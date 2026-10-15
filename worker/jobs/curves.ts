/**
 * Live market data for hatched coins, straight from Solana: each coin's pump.fun bonding
 * curve gives its market cap in SOL; the SOL/USD price turns that into dollars.
 */
import { db } from "@/lib/db";
import { bondingCurvePda, curveMarket, decodeBondingCurve, isPumpProgram } from "@/lib/solana/curve";
import { solanaNetwork, withRpc } from "@/lib/solana/server";
import { fetchSolPriceUsd } from "@/lib/sources/coingecko";
import { SOURCES, addEvent, getSolUsd, log, withSource } from "../lib";

export async function runSolPrice() {
  const usd = await withSource(SOURCES.solPrice, fetchSolPriceUsd);
  if (usd == null) return false;
  await db.keyValue.upsert({ where: { key: "solUsd" }, create: { key: "solUsd", value: { usd } }, update: { value: { usd } } });
  log("sol-price", `SOL = $${usd}`);
  return true;
}

export async function runCurves() {
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE", network: solanaNetwork() },
    select: { id: true, ticker: true, address: true, curveComplete: true },
  });
  if (coins.length === 0) return true;
  const solUsd = await getSolUsd();
  const ok = await withSource(SOURCES.curves, async () => {
    for (let i = 0; i < coins.length; i += 100) {
      const batch = coins.slice(i, i + 100);
      const infos = await withRpc((conn) => conn.getMultipleAccountsInfo(batch.map((c) => bondingCurvePda(c.address)), "confirmed"));
      for (let j = 0; j < batch.length; j++) {
        const coin = batch[j];
        const info = infos[j];
        const curve = info && isPumpProgram(info.owner) ? decodeBondingCurve(info.data) : null;
        if (!curve) continue;
        const now = new Date();
        if (curve.complete) {
          // Graduated: the curve is frozen; market data now comes from DexScreener's pool data.
          await db.coin.update({ where: { id: coin.id }, data: { curveComplete: true, curveUpdatedAt: now } });
        } else {
          const m = curveMarket(curve);
          await db.coin.update({
            where: { id: coin.id },
            data: {
              curveComplete: false,
              curveUpdatedAt: now,
              marketCapSol: m?.marketCapSol ?? null,
              marketCapUsd: m && solUsd ? m.marketCapSol * solUsd : null,
              priceUsd: m && solUsd ? m.priceSol * solUsd : null,
              marketUpdatedAt: m && solUsd ? now : undefined,
            },
          });
        }
        if (curve.complete && !coin.curveComplete) {
          await addEvent("GRADUATED", `🎓 $${coin.ticker} outgrew the nursery: its bonding curve is complete`, coin.id);
        }
      }
    }
    return true;
  });
  log("curves", `${coins.length} curves read${solUsd ? "" : " (no SOL price yet: USD values pending)"}`);
  return !!ok;
}
