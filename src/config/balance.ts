/**
 * Every tunable number in the game lives here: launch limits, polling cadence,
 * market-layer tiers and caps, and (from step 3 on) XP curves, timers and rewards.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const POLLING = {
  /** pump.fun bonding curves of every hatched coin, read straight from Solana. */
  curvesMs: 2 * MIN,
  /** SOL/USD price (CoinGecko simple price), to turn curve market caps into USD. */
  solPriceMs: { withKey: 5 * MIN, keyless: 10 * MIN },
  /** DexScreener token-pairs sweep (mainnet coins only; DexScreener doesn't index devnet). */
  dexPairsMs: 5 * MIN,
  /** Pause between DexScreener calls inside one job (keeps us far below their limits). */
  dexCallGapMs: 1_200,
  /** Finish launches whose transaction was sent but whose page was closed before confirmation. */
  hatchFinalizeMs: 30_000,
  /** History snapshot of every creature's latest values. */
  snapshotsMs: 10 * MIN,
  /** Snapshot downsampling and old-row cleanup. */
  housekeepingMs: 30 * MIN,
  /** Retry backoff after a failed call (multiplied per consecutive failure, capped). */
  backoffBaseMs: 30_000,
  backoffMaxMs: 15 * MIN,
  requestTimeoutMs: 20_000,
  /** Data older than this is shown as stale in the UI. */
  staleAfterMs: 30 * MIN,
} as const;

export const TRACKING = {
  /** "Hatched today" badge and Shell Plaza residence: hatched at most this long ago. */
  newArrivalMaxAgeHours: 24,
  /** 24h change from our own snapshots needs one at least this old. */
  snapshotChangeMinAgeHours: 23,
  /** Snapshot retention. */
  snapshotFullResHours: 48,
  snapshotHourlyDays: 30,
} as const;

/** Hatchery (token creation) limits. */
export const HATCH = {
  /** Metaplex limits: name 32, symbol 10 characters. */
  nameMax: 32,
  tickerMax: 10,
  descriptionMax: 500,
  imageMaxBytes: 2 * 1024 * 1024,
  /** Stored image size (longest edge, px). */
  imageMaxEdge: 1000,
  /** Launches a wallet may start per rolling 24h (prepared, whether or not they complete). */
  perWalletPerDay: 5,
  /** Launches an IP may start per rolling hour. */
  perIpPerHour: 10,
  /** A prepared launch that wasn't signed in this long is abandoned. */
  preparedTtlMs: 30 * MIN,
  /** How long we keep checking a sent transaction before marking it failed. */
  confirmTimeoutMs: 3 * MIN,
  computeUnitLimit: 180_000,
  /** Priority fee (micro-lamports per compute unit). Small, but helps on busy mainnet. */
  computeUnitPriceMicroLamports: 100_000,
  /** Wallet sign-in sessions. */
  sessionTtlMs: 12 * HOUR,
  nonceTtlMs: 5 * MIN,
} as const;

/** Size tiers by market cap (USD), scaled for freshly launched pump.fun coins. Ordered small -> large. */
export const TIERS = [
  { id: "hatchling", label: "Hatchling", minCap: 0, hpMod: -0.06, scale: 0.75 },
  { id: "juvenile", label: "Juvenile", minCap: 10_000, hpMod: -0.03, scale: 0.9 },
  { id: "adult", label: "Adult", minCap: 50_000, hpMod: 0, scale: 1.05 },
  { id: "elder", label: "Elder", minCap: 500_000, hpMod: 0.03, scale: 1.25 },
  { id: "leviathan", label: "Leviathan-class", minCap: 5_000_000, hpMod: 0.06, scale: 1.5 },
] as const;

export const MOOD = {
  /** 24h change (%) to enter / leave each mood. Hysteresis prevents flicker. New coins swing hard, so the bar is high. */
  frenzyEnter: 25,
  frenzyLeave: 18,
  sulkEnter: -25,
  sulkLeave: -18,
  /** Effect size grows log-scaled from minEffect at the threshold to maxEffect at saturatePct. */
  minEffect: 0.06,
  maxEffect: 0.18,
  saturatePct: 200,
} as const;

export const SPEED = {
  /** speedMod = (percentile - 0.5) * 2 * maxMod, from DEX volume / liquidity. */
  maxMod: 0.15,
} as const;

export const RARITY = [
  { id: "legendary", label: "Legendary", maxRank: 5, encounterWeight: 0.2, statMod: 0.04 },
  { id: "epic", label: "Epic", maxRank: 20, encounterWeight: 0.5, statMod: 0.03 },
  { id: "rare", label: "Rare", maxRank: 60, encounterWeight: 0.8, statMod: 0.02 },
  { id: "uncommon", label: "Uncommon", maxRank: 150, encounterWeight: 1.0, statMod: 0.01 },
  { id: "common", label: "Common", maxRank: Infinity, encounterWeight: 1.2, statMod: 0 },
] as const;

/** Total market multiplier on any single stat is clamped to this range. */
export const MARKET_CAP = { min: 0.8, max: 1.2 } as const;

export const WORLD = {
  /** Max creatures rendered per coin in the world view (bigger caps get a small school). */
  maxSchoolSize: 3,
  /** Chance that a creature's next destination is another zone instead of its home zone. */
  roamChance: 0.35,
  /** Frenzied creatures roam even more. */
  roamChanceFrenzy: 0.6,
  /** Creatures keep at least this much space between them (world px, before scale). */
  personalSpace: 70,
  feedLimit: 40,
  feedPollMs: 10_000,
  worldRefreshMs: 30_000,
} as const;
