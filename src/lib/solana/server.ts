/**
 * Server-side Solana settings. Everything deployment-specific comes from env:
 *   SOLANA_NETWORK   "devnet" (default) or "mainnet-beta"
 *   SOLANA_RPC_URL   optional; one or more RPC endpoints, comma-separated, tried in order.
 *                    The public endpoint for the network is always kept as the last fallback.
 *                    Use a dedicated provider (Helius, QuickNode, Triton...) in production: the public
 *                    endpoint is rate-limited, and on shared hosting (Vercel) many sites share its limit.
 *   SITE_URL         public https URL of this site (needed for self-hosted metadata on mainnet)
 *   PINATA_JWT       optional backup for token metadata storage (pump.fun's IPFS upload is used first)
 */
import { Connection } from "@solana/web3.js";
import { DEFAULT_RPC, type SolanaNetwork } from "@/config/data";

export function solanaNetwork(): SolanaNetwork {
  const n = process.env.SOLANA_NETWORK?.trim();
  return n === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

/** Configured RPC endpoints in order, ending with the public one. */
export function rpcUrls(): string[] {
  const configured = (process.env.SOLANA_RPC_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u));
  const fallback = DEFAULT_RPC[solanaNetwork()];
  return [...new Set([...configured, fallback])];
}

/** Endpoint label safe to show or log (host only, never the API key). */
export function rpcLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid url";
  }
}

const connections = new Map<string, Connection>();
function connectionFor(url: string): Connection {
  let c = connections.get(url);
  if (!c) {
    // We retry and fail over ourselves, so turn off web3.js's own long 429 back-off.
    c = new Connection(url, { commitment: "confirmed", disableRetryOnRateLimit: true });
    connections.set(url, c);
  }
  return c;
}

/** The primary connection (first configured endpoint). Prefer withRpc() for anything that matters. */
export function solanaConnection(): Connection {
  return connectionFor(rpcUrls()[0]);
}

export type RpcFailure = "rate-limited" | "forbidden" | "unauthorized" | "server-error" | "unreachable" | "other";

export class RpcError extends Error {
  constructor(public kind: RpcFailure, public attempts: { endpoint: string; kind: RpcFailure; message: string }[]) {
    super(`Solana RPC failed (${kind}): ${attempts.map((a) => `${a.endpoint}: ${a.message}`).join(" | ")}`);
  }
}

export function classifyRpcError(err: unknown): { kind: RpcFailure; message: string } {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  if (/429|too many requests|rate limit/i.test(message)) return { kind: "rate-limited", message };
  if (/403|forbidden/i.test(message)) return { kind: "forbidden", message };
  if (/401|unauthori[sz]ed|invalid api key/i.test(message)) return { kind: "unauthorized", message };
  if (/\b5\d\d\b|bad gateway|service unavailable|internal server error/i.test(message)) return { kind: "server-error", message };
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|timeout|timed out|aborted|socket|network/i.test(message)) return { kind: "unreachable", message };
  return { kind: "other", message };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an RPC call with retries and fail-over: each endpoint gets up to `tries` attempts on
 * transient failures (rate limits, server errors, network trouble), then the next endpoint is used.
 * Errors that aren't transport problems (e.g. a transaction Solana rejects) are thrown immediately.
 */
export async function withRpc<T>(fn: (c: Connection) => Promise<T>, { tries = 2 } = {}): Promise<T> {
  const attempts: RpcError["attempts"] = [];
  for (const url of rpcUrls()) {
    for (let i = 0; i < tries; i++) {
      try {
        return await fn(connectionFor(url));
      } catch (err) {
        const c = classifyRpcError(err);
        if (c.kind === "other") throw err;
        attempts.push({ endpoint: rpcLabel(url), ...c });
        if (c.kind === "unauthorized" || c.kind === "forbidden") break; // retrying the same endpoint won't help
        await sleep(400 * (i + 1));
      }
    }
  }
  const worst = attempts.find((a) => a.kind === "rate-limited")?.kind ?? attempts[attempts.length - 1]?.kind ?? "unreachable";
  throw new RpcError(worst, attempts);
}

/** A message for players about an RPC failure (no endpoint details). */
export function rpcErrorForPlayers(err: RpcError): string {
  switch (err.kind) {
    case "rate-limited":
      return "Solana's network is very busy right now and turned the request away. Please try again in a minute.";
    case "unreachable":
    case "server-error":
      return "Couldn't reach the Solana network just now. Please try again in a minute.";
    default:
      return "The site couldn't talk to the Solana network. The site owner has been told to check its Solana connection settings.";
  }
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
