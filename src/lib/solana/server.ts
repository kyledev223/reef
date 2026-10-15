/**
 * Server-side Solana settings. Everything deployment-specific comes from env:
 *   SOLANA_NETWORK   "devnet" (default) or "mainnet-beta"
 *   SOLANA_RPC_URL   optional; defaults to the public endpoint for the network
 *   SITE_URL         public https URL of this site (needed for self-hosted metadata on mainnet)
 *   PINATA_JWT       optional backup for token metadata storage (pump.fun's IPFS upload is used first)
 */
import { Connection } from "@solana/web3.js";
import { DEFAULT_RPC, type SolanaNetwork } from "@/config/data";

export function solanaNetwork(): SolanaNetwork {
  const n = process.env.SOLANA_NETWORK?.trim();
  return n === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

let conn: { key: string; c: Connection } | null = null;
export function solanaConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL?.trim() || DEFAULT_RPC[solanaNetwork()];
  if (!conn || conn.key !== url) conn = { key: url, c: new Connection(url, "confirmed") };
  return conn.c;
}

export function siteUrl(): string {
  return (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

export function pinataJwt(): string | null {
  return process.env.PINATA_JWT?.trim() || null;
}

export interface HatchConfig {
  network: SolanaNetwork;
  enabled: boolean;
  /** Why launching is off, in words for the player. */
  disabledReason: string | null;
}

/** Whether the Hatchery is open. Token metadata goes to pump.fun's IPFS, so no extra setup is needed. */
export function hatchConfig(): HatchConfig {
  const network = solanaNetwork();
  const disabledReason = process.env.HATCHERY_DISABLED === "1" ? "The Hatchery is closed for maintenance." : null;
  return { network, enabled: disabledReason == null, disabledReason };
}
