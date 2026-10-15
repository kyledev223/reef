/**
 * Reefworld worker: keeps hatched creatures' market data fresh (from Solana and
 * DexScreener), finishes in-flight launches, and maintains the world state.
 * The web app only ever reads from the database.
 *
 *   npm run worker         # long-running
 *   npm run worker:once    # run every job once, then exit
 */
import pg from "pg";
import { POLLING } from "@/config/balance";
import { db } from "@/lib/db";
import { cgApiKey } from "@/lib/sources/coingecko";
import { sleep } from "@/lib/sources/http";
import { solanaNetwork } from "@/lib/solana/server";
import { SOURCES, lastSuccess, log } from "./lib";
import { runCurves, runSolPrice } from "./jobs/curves";
import { runDexPairs } from "./jobs/dexscreener";
import { runDerive } from "./jobs/derive";
import { runHatchFinalize } from "./jobs/hatch";
import { runHousekeeping, runSnapshots } from "./jobs/housekeeping";

const LOCK_ID = 727_001;
const hasKey = !!cgApiKey();

interface Job {
  name: string;
  /** Jobs in the same lane run one at a time; lanes run in parallel. */
  lane: "chain" | "price" | "dex" | "db";
  everyMs: number;
  /** SourceStatus used to resume the schedule after a restart. */
  source?: string;
  derive?: boolean;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: "sol-price", lane: "price", everyMs: hasKey ? POLLING.solPriceMs.withKey : POLLING.solPriceMs.keyless, source: SOURCES.solPrice, run: runSolPrice },
  { name: "curves", lane: "chain", everyMs: POLLING.curvesMs, source: SOURCES.curves, derive: true, run: runCurves },
  { name: "hatch-finalize", lane: "chain", everyMs: POLLING.hatchFinalizeMs, run: runHatchFinalize },
  { name: "dex-pairs", lane: "dex", everyMs: POLLING.dexPairsMs, source: SOURCES.dexPairs, derive: true, run: runDexPairs },
  { name: "snapshots", lane: "db", everyMs: POLLING.snapshotsMs, run: runSnapshots },
  { name: "housekeeping", lane: "db", everyMs: POLLING.housekeepingMs, run: runHousekeeping },
];

// Derive runs after any data job, serialised so two lanes never race on it.
let deriveChain: Promise<void> = Promise.resolve();
const derive = () => (deriveChain = deriveChain.then(runDerive).catch((e) => log("derive", "failed:", e)));

async function runJob(job: Job) {
  const t0 = Date.now();
  try {
    await job.run();
    if (job.derive) await derive();
  } catch (err) {
    log(job.name, "crashed:", err instanceof Error ? err.stack ?? err.message : err);
  }
  return Date.now() - t0;
}

async function acquireLock(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (;;) {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_ID]);
    if (rows[0].ok) return client;
    log("worker", "another worker holds the polling lock; standing by");
    await sleep(30_000);
  }
}

async function main() {
  if (!hasKey) {
    console.warn(
      "\n⚠️  COINGECKO_API_KEY is not set. The SOL/USD price is polled every " +
        `${POLLING.solPriceMs.keyless / 60_000} min instead of ${POLLING.solPriceMs.withKey / 60_000}. ` +
        "Get a free Demo key at https://www.coingecko.com/en/api/pricing and put it in .env.\n",
    );
  }
  const lock = await acquireLock();
  log("worker", `polling lock acquired (network: ${solanaNetwork()})`);

  if (process.argv.includes("--once")) {
    for (const job of JOBS) {
      log("once", `running ${job.name}…`);
      await runJob(job);
    }
    await derive();
    await lock.end();
    await db.$disconnect();
    return;
  }

  // Resume schedules from the last successful run so restarts don't hammer the APIs.
  const next = new Map<string, number>();
  for (const job of JOBS) {
    const last = job.source ? await lastSuccess(job.source) : null;
    next.set(job.name, last ? last.getTime() + job.everyMs : 0);
  }
  const busyLanes = new Set<string>();

  const tick = () => {
    const now = Date.now();
    for (const job of JOBS) {
      if (busyLanes.has(job.lane) || (next.get(job.name) ?? 0) > now) continue;
      busyLanes.add(job.lane);
      runJob(job).then((ms) => {
        if (ms > 2_000) log(job.name, `done in ${(ms / 1000).toFixed(1)}s`);
        next.set(job.name, Date.now() + job.everyMs);
        busyLanes.delete(job.lane);
      });
    }
  };
  tick();
  const timer = setInterval(tick, 2_000);

  const shutdown = async () => {
    clearInterval(timer);
    log("worker", "shutting down");
    await lock.end().catch(() => {});
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
