/**
 * One "tick" of the worker for serverless hosting (Vercel), where no long-running process exists.
 * Runs each job whose interval has elapsed, within a time budget, under a database lock so two
 * ticks never overlap. Triggered by Vercel Cron (/api/cron) and, while people use the site, in the
 * background after page loads (/api/world). The long-running worker (worker/index.ts) is still the
 * better choice on a normal server.
 */
import { POLLING } from "@/config/balance";
import { db } from "@/lib/db";
import { cgApiKey } from "@/lib/sources/coingecko";
import { runCurves, runSolPrice } from "./jobs/curves";
import { runDexPairs } from "./jobs/dexscreener";
import { runDerive } from "./jobs/derive";
import { runHatchFinalize } from "./jobs/hatch";
import { runHousekeeping, runSnapshots } from "./jobs/housekeeping";

interface TickJob {
  name: string;
  everyMs: number;
  derive?: boolean;
  run: () => Promise<unknown>;
}

const JOBS: TickJob[] = [
  { name: "hatch-finalize", everyMs: POLLING.hatchFinalizeMs, run: runHatchFinalize },
  { name: "sol-price", everyMs: cgApiKey() ? POLLING.solPriceMs.withKey : POLLING.solPriceMs.keyless, run: runSolPrice },
  { name: "curves", everyMs: POLLING.curvesMs, derive: true, run: runCurves },
  // A slice of coins per tick keeps each run short; the oldest-checked coins go first.
  { name: "dex-pairs", everyMs: POLLING.dexPairsMs, derive: true, run: () => runDexPairs({ limit: 20 }) },
  { name: "snapshots", everyMs: POLLING.snapshotsMs, run: runSnapshots },
  { name: "housekeeping", everyMs: POLLING.housekeepingMs, run: runHousekeeping },
];

const LOCK_KEY = "tick:lock";

async function lastRun(name: string): Promise<number> {
  const kv = await db.keyValue.findUnique({ where: { key: `tick:${name}` } });
  return (kv?.value as { at?: number } | null)?.at ?? 0;
}
async function markRun(name: string, at: number) {
  await db.keyValue.upsert({ where: { key: `tick:${name}` }, create: { key: `tick:${name}`, value: { at } }, update: { value: { at } } });
}

/** Take the tick lock for `ms`, unless another tick holds it. */
async function acquire(ms: number): Promise<boolean> {
  const now = Date.now();
  const rows = await db.$executeRaw`
    INSERT INTO "KeyValue" (key, value, "updatedAt") VALUES (${LOCK_KEY}, ${JSON.stringify({ until: now + ms })}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
    WHERE ("KeyValue".value->>'until')::bigint < ${now}`;
  return rows > 0;
}
async function release() {
  await db.keyValue.deleteMany({ where: { key: LOCK_KEY } });
}

export interface TickResult {
  ran: string[];
  skipped: "locked" | "recent" | null;
  ms: number;
}

/**
 * Run due jobs. `minGapMs` skips the tick entirely if one finished that recently (cheap guard for
 * the page-load trigger).
 */
export async function runTick({ budgetMs = 45_000, minGapMs = 0 } = {}): Promise<TickResult> {
  const t0 = Date.now();
  if (minGapMs > 0 && t0 - (await lastRun("last")) < minGapMs) return { ran: [], skipped: "recent", ms: 0 };
  if (!(await acquire(budgetMs + 15_000))) return { ran: [], skipped: "locked", ms: Date.now() - t0 };
  const ran: string[] = [];
  try {
    let needDerive = false;
    for (const job of JOBS) {
      if (Date.now() - t0 > budgetMs) break;
      if (Date.now() - (await lastRun(job.name)) < job.everyMs) continue;
      try {
        await job.run();
      } catch (err) {
        console.error(`[tick] ${job.name} failed:`, err);
      }
      await markRun(job.name, Date.now());
      ran.push(job.name);
      if (job.derive) needDerive = true;
    }
    if (needDerive) await runDerive().catch((err) => console.error("[tick] derive failed:", err));
  } finally {
    await markRun("last", Date.now());
    await release();
  }
  return { ran, skipped: null, ms: Date.now() - t0 };
}

