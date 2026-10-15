/**
 * DexScreener client (no key). Only fields DexScreener actually returns are modelled.
 */
import { z } from "zod";
import { ENDPOINTS } from "@/config/data";
import { getJson } from "./http";

const Token = z.object({ address: z.string(), name: z.string(), symbol: z.string() });

export const DexPair = z.object({
  chainId: z.string(),
  dexId: z.string().optional(),
  pairAddress: z.string(),
  baseToken: Token,
  quoteToken: Token,
  priceUsd: z.string().nullable().optional(),
  volume: z.object({ h24: z.number().nullable().optional() }).partial().nullable().optional(),
  priceChange: z.object({ h24: z.number().nullable().optional() }).partial().nullable().optional(),
  liquidity: z.object({ usd: z.number().nullable().optional() }).partial().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  pairCreatedAt: z.number().nullable().optional(),
  info: z.object({ imageUrl: z.string().nullable().optional() }).partial().nullable().optional(),
});
export type DexPair = z.infer<typeof DexPair>;

export async function fetchTokenPairs(chainId: string, address: string): Promise<DexPair[]> {
  const url = `${ENDPOINTS.dexscreener}/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`;
  return getJson(url, z.array(DexPair).nullable()).then((r) => r ?? []);
}

/**
 * Aggregate the pairs where the token is the base asset: summed liquidity / volume,
 * oldest pair, and the deepest pair. (Pools where it is the quote asset are skipped
 * so another coin's pool doesn't inflate this coin's liquidity.)
 */
export function aggregatePairs(address: string, pairs: DexPair[]) {
  const a = address.toLowerCase();
  const mine = pairs.filter((p) => p.baseToken.address.toLowerCase() === a);
  if (mine.length === 0) return null;
  let liquidity: number | null = null;
  let volume: number | null = null;
  let oldest: number | null = null;
  let main: DexPair | null = null;
  for (const p of mine) {
    const liq = p.liquidity?.usd;
    if (liq != null) liquidity = (liquidity ?? 0) + liq;
    const vol = p.volume?.h24;
    if (vol != null) volume = (volume ?? 0) + vol;
    if (p.pairCreatedAt != null) oldest = oldest == null ? p.pairCreatedAt : Math.min(oldest, p.pairCreatedAt);
    if (main == null || (liq ?? 0) > (main.liquidity?.usd ?? 0)) main = p;
  }
  return {
    liquidityUsd: liquidity,
    dexVolume24hUsd: volume,
    pairCount: mine.length,
    pairCreatedAt: oldest != null ? new Date(oldest) : null,
    main,
  };
}
