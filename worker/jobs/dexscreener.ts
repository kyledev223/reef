/**
 * DexScreener data for hatched mainnet coins: liquidity, DEX volume and 24h change once
 * DexScreener has indexed the token. After graduation it is also the market-cap source.
 * (DexScreener doesn't index devnet, so devnet coins are skipped.)
 */
import { POLLING } from "@/config/balance";
import { db } from "@/lib/db";
import { solanaNetwork } from "@/lib/solana/server";
import { aggregatePairs, fetchTokenPairs } from "@/lib/sources/dexscreener";
import { sleep } from "@/lib/sources/http";
import type { Prisma } from "@/generated/prisma/client";
import { SOURCES, log, withSource } from "../lib";

/** @param opts.limit check at most this many coins (oldest-checked first); for short serverless runs. */
export async function runDexPairs(opts: { limit?: number } = {}) {
  if (solanaNetwork() !== "mainnet-beta") return true;
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE", network: "mainnet-beta" },
    orderBy: [{ dexUpdatedAt: { sort: "asc", nulls: "first" } }],
    select: { id: true, address: true, curveComplete: true },
    take: opts.limit,
  });
  let found = 0;
  const ok = await withSource(SOURCES.dexPairs, async () => {
    for (const coin of coins) {
      const agg = aggregatePairs(coin.address, await fetchTokenPairs("solana", coin.address));
      const data: Prisma.CoinUpdateInput = { dexUpdatedAt: new Date() };
      if (agg) {
        found++;
        Object.assign(data, {
          liquidityUsd: agg.liquidityUsd,
          dexVolume24hUsd: agg.dexVolume24hUsd,
          dexPairCount: agg.pairCount,
        });
        const h24 = agg.main?.priceChange?.h24;
        if (h24 != null) Object.assign(data, { change24hPct: h24, change24hSource: "dexscreener" });
        if (coin.curveComplete && agg.main) {
          const price = agg.main.priceUsd != null ? Number(agg.main.priceUsd) : null;
          Object.assign(data, {
            marketCapUsd: agg.main.marketCap ?? null,
            priceUsd: price != null && Number.isFinite(price) ? price : null,
            marketUpdatedAt: new Date(),
          });
        }
      }
      await db.coin.update({ where: { id: coin.id }, data });
      await sleep(POLLING.dexCallGapMs);
    }
    return true;
  });
  log("dex-pairs", `${found}/${coins.length} coins indexed by DexScreener`);
  return !!ok;
}
