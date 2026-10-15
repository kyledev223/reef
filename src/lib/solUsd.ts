/**
 * The SOL/USD price for pages and finalizing launches. Uses the value the worker stores, and
 * fetches a fresh one (then stores it) when that is missing or stale, so dollar figures never
 * depend on the background worker having run.
 */
import { db } from "@/lib/db";
import { fetchSolPriceUsd } from "@/lib/sources/coingecko";

const STALE_MS = 15 * 60_000;
let memo: { usd: number; at: number } | null = null;

export async function solUsdNow(): Promise<number | null> {
  if (memo && Date.now() - memo.at < 60_000) return memo.usd;
  const kv = await db.keyValue.findUnique({ where: { key: "solUsd" } });
  const stored = (kv?.value as { usd?: number } | null)?.usd;
  if (typeof stored === "number" && kv && Date.now() - kv.updatedAt.getTime() < STALE_MS) {
    memo = { usd: stored, at: Date.now() };
    return stored;
  }
  try {
    const usd = await fetchSolPriceUsd();
    await db.keyValue.upsert({ where: { key: "solUsd" }, create: { key: "solUsd", value: { usd } }, update: { value: { usd } } });
    memo = { usd, at: Date.now() };
    return usd;
  } catch (err) {
    console.error("[sol-usd]", err instanceof Error ? err.message : err);
    return typeof stored === "number" ? stored : null;
  }
}
