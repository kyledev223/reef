/**
 * CoinGecko: only the SOL/USD price, to express bonding-curve market caps in dollars.
 * The Demo key (COINGECKO_API_KEY) is optional.
 */
import { z } from "zod";
import { ENDPOINTS } from "@/config/data";
import { getJson } from "./http";

export function cgApiKey(): string | null {
  const k = process.env.COINGECKO_API_KEY?.trim();
  return k ? k : null;
}

export async function fetchSolPriceUsd(): Promise<number> {
  const key = cgApiKey();
  const r = await getJson(
    `${ENDPOINTS.coingecko}/simple/price?ids=solana&vs_currencies=usd`,
    z.object({ solana: z.object({ usd: z.number().positive() }) }),
    key ? { "x-cg-demo-api-key": key } : {},
  );
  return r.solana.usd;
}
