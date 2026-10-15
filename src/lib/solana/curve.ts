/**
 * pump.fun bonding curve: PDA derivation and decoding, without the SDK (which can't be
 * imported by the plain-Node worker). Layout per the pump program IDL:
 *   8  discriminator
 *   u64 virtual_token_reserves, u64 virtual_sol_reserves, u64 real_token_reserves,
 *   u64 real_sol_reserves, u64 token_total_supply, bool complete, pubkey creator, ...
 */
import { PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM_ID, PUMP_TOKEN_DECIMALS } from "@/config/data";

const PROGRAM = new PublicKey(PUMP_PROGRAM_ID);
const SEED = Buffer.from("bonding-curve");

export function bondingCurvePda(mint: PublicKey | string): PublicKey {
  const m = typeof mint === "string" ? new PublicKey(mint) : mint;
  return PublicKey.findProgramAddressSync([SEED, m.toBuffer()], PROGRAM)[0];
}

export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string;
}

export function decodeBondingCurve(data: Uint8Array): BondingCurveState | null {
  if (data.length < 81) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (o: number) => view.getBigUint64(o, true);
  return {
    virtualTokenReserves: u64(8),
    virtualSolReserves: u64(16),
    realTokenReserves: u64(24),
    realSolReserves: u64(32),
    tokenTotalSupply: u64(40),
    complete: data[48] === 1,
    creator: new PublicKey(data.slice(49, 81)).toBase58(),
  };
}

export const isPumpProgram = (owner: PublicKey) => owner.equals(PROGRAM);

/** Market cap and price in SOL from curve reserves (same formula as the SDK's bondingCurveMarketCap). */
export function curveMarket(c: BondingCurveState): { marketCapSol: number; priceSol: number } | null {
  if (c.virtualTokenReserves === 0n) return null;
  const lamportsPerSol = 1e9;
  const tokenUnit = 10 ** PUMP_TOKEN_DECIMALS;
  const priceLamportsPerBaseUnit = Number(c.virtualSolReserves) / Number(c.virtualTokenReserves);
  return {
    marketCapSol: (Number(c.tokenTotalSupply) * priceLamportsPerBaseUnit) / lamportsPerSol,
    priceSol: (priceLamportsPerBaseUnit * tokenUnit) / lamportsPerSol,
  };
}
