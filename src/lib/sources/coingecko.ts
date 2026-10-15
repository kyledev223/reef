/**
 * SOL/USD price, to express bonding-curve market caps in dollars. CoinGecko first (the Demo key,
 * COINGECKO_API_KEY, is optional), then Coinbase and Kraken: CoinGecko's keyless API often
 * rate-limits shared hosting like Vercel.
 */
import { z } from "zod";
import { ENDPOINTS } from "@/config/data";
import { getJson } from "./http";

export function cgApiKey(): string | null {
  const k = process.env.COINGECKO_API_KEY?.trim();
  return k ? k : null;
}

async function fromCoinGecko(): Promise<number> {
  const key = cgApiKey();
  const r = await getJson(
    `${ENDPOINTS.coingecko}/simple/price?ids=solana&vs_currencies=usd`,
    z.object({ solana: z.object({ usd: z.number().positive() }) }),
    key ? { "x-cg-demo-api-key": key } : {},
  );
  return r.solana.usd;
}

const fromCoinbase = async () =>
  Number((await getJson(ENDPOINTS.coinbaseSolUsd, z.object({ data: z.object({ amount: z.string() }) }))).data.amount);

const fromKraken = async () => {
  const r = await getJson(ENDPOINTS.krakenSolUsd, z.object({ result: z.record(z.string(), z.object({ c: z.array(z.string()) })) }));
  return Number(Object.values(r.result)[0]?.c[0]);
};

export async function fetchSolPriceUsd(): Promise<number> {
  const errors: string[] = [];
  for (const source of [fromCoinGecko, fromCoinbase, fromKraken]) {
    try {
      const usd = await source();
      if (Number.isFinite(usd) && usd > 0) return usd;
      errors.push(`${source.name}: bad value`);
    } catch (err) {
      errors.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`No SOL/USD price available (${errors.join("; ")})`);
}
