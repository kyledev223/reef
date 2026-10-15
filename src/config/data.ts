/**
 * External services, network settings and the moderation denylist.
 * Secrets and deployment-specific values come from environment variables (see .env.example).
 */

export const ENDPOINTS = {
  coingecko: "https://api.coingecko.com/api/v3",
  dexscreener: "https://api.dexscreener.com",
  /** pump.fun's own image + metadata upload (IPFS), as used by pump.fun's site. */
  pumpIpfs: "https://pump.fun/api/ipfs",
  pinataPinFile: "https://api.pinata.cloud/pinning/pinFileToIPFS",
  pinataPinJson: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
} as const;

export type SolanaNetwork = "devnet" | "mainnet-beta";

export const NETWORK_LABEL: Record<SolanaNetwork, string> = {
  devnet: "Solana devnet",
  "mainnet-beta": "Solana mainnet",
};

export const DEFAULT_RPC: Record<SolanaNetwork, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/** pump.fun bonding-curve program (same address on devnet and mainnet). */
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
/** pump.fun tokens use 6 decimals. */
export const PUMP_TOKEN_DECIMALS = 6;

export const explorerUrl = (network: SolanaNetwork, kind: "token" | "tx" | "account", id: string) =>
  `https://solscan.io/${kind}/${id}${network === "devnet" ? "?cluster=devnet" : ""}`;

/** Friendly chain labels for the UI. */
export const CHAIN_LABELS: Record<string, string> = { solana: "Solana" };

/**
 * Moderation. Case-insensitive. Plain entries match a whole word in the name or ticker;
 * entries ending in "*" match anywhere (use for stems that rarely occur innocently).
 */
export const DENYLIST_WORDS: string[] = [
  "nigg*",
  "faggot*",
  "fag",
  "retard*",
  "rape",
  "rapist",
  "hitler*",
  "nazi",
  "porn*",
  "cum",
  "pedo",
  "pedophil*",
  "kkk",
];

/** Mint addresses ("<network>:<mint>") hidden from the reef by moderators. */
export const DENYLIST_KEYS: string[] = [];
