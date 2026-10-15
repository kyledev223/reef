import { TRACKING } from "@/config/balance";
import { db } from "@/lib/db";
import { nextMood, percentiles, type MoodId } from "@/lib/market/layer";
import type { Prisma } from "@/generated/prisma/client";
import { addEvent, fmtPct, log } from "../lib";

const MOOD_MSG: Record<MoodId, (t: string, pct: string) => string> = {
  FRENZY: (t, pct) => `🔥 ${t} creatures are in a Frenzy today (${pct})`,
  SULKING: (t, pct) => `🌧️ ${t} creatures are Sulking today (${pct})`,
  CALM: (t, pct) => `🌊 ${t} creatures have calmed down (${pct})`,
};

/**
 * Recompute the derived market layer for every creature: 24h change (DexScreener if it has
 * the coin, otherwise from our own snapshots), market-cap rank, speed percentile and mood.
 */
export async function runDerive() {
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, ticker: true, marketCapUsd: true, marketCapSol: true, change24hPct: true, change24hSource: true,
      liquidityUsd: true, dexVolume24hUsd: true, mood: true, moodInitialized: true,
      trackedRank: true, speedPercentile: true,
    },
  });

  // 24h change from snapshots (market cap in SOL, so SOL's own price moves don't count) when DexScreener has none.
  const minAge = new Date(Date.now() - TRACKING.snapshotChangeMinAgeHours * 3_600_000);
  const old = await db.$queryRaw<{ coinId: string; marketCapSol: number | null }[]>`
    SELECT DISTINCT ON ("coinId") "coinId", "marketCapSol"
    FROM "CoinSnapshot"
    WHERE at <= ${minAge} AND at >= ${new Date(minAge.getTime() - 6 * 3_600_000)} AND "marketCapSol" IS NOT NULL
    ORDER BY "coinId", at DESC`;
  const past = new Map(old.map((r) => [r.coinId, r.marketCapSol]));

  const ranked = coins.filter((c) => c.marketCapUsd != null).sort((a, b) => b.marketCapUsd! - a.marketCapUsd!);
  const rank = new Map(ranked.map((c, i) => [c.id, i + 1]));
  const pct = percentiles(
    coins.map((c) => (c.dexVolume24hUsd != null && c.liquidityUsd ? c.dexVolume24hUsd / c.liquidityUsd : null)),
  );

  const updates: Prisma.PrismaPromise<unknown>[] = [];
  let moodChanges = 0;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    const data: Prisma.CoinUpdateInput = {};
    let change = c.change24hPct;
    if (c.change24hSource !== "dexscreener") {
      const then = past.get(c.id);
      change = then && c.marketCapSol != null ? ((c.marketCapSol - then) / then) * 100 : null;
      if (change !== c.change24hPct) Object.assign(data, { change24hPct: change, change24hSource: change == null ? null : "snapshots" });
    }
    const r = rank.get(c.id) ?? null;
    if (r !== c.trackedRank) data.trackedRank = r;
    const p = pct[i] != null ? Math.round(pct[i]! * 1000) / 1000 : null;
    if (p !== c.speedPercentile) data.speedPercentile = p;

    const mood = nextMood(c.mood, change);
    if (!c.moodInitialized) {
      Object.assign(data, { mood, moodInitialized: true, moodSince: new Date() });
    } else if (mood !== c.mood) {
      Object.assign(data, { mood, moodSince: new Date() });
      if (change != null) {
        await addEvent("MOOD_CHANGE", MOOD_MSG[mood](`$${c.ticker}`, fmtPct(change)), c.id, { from: c.mood, to: mood, change24hPct: change });
        moodChanges++;
      }
    }
    if (Object.keys(data).length) updates.push(db.coin.update({ where: { id: c.id }, data }));
  }
  if (updates.length) await db.$transaction(updates);
  if (coins.length) log("derive", `${coins.length} creatures, ${updates.length} updated, ${moodChanges} mood changes`);
}
