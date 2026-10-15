/**
 * Builds the payloads the web app reads. Everything comes from the database;
 * the browser never talks to market APIs or Solana RPC for reef data.
 */
import { POLLING, TRACKING, WORLD } from "@/config/balance";
import { NETWORK_LABEL, explorerUrl, type SolanaNetwork } from "@/config/data";
import { db } from "@/lib/db";
import {
  isNewArrival, marketModifiers, moodIntensity, rarityFor, speedModFor, tierFor,
  type MarketModifiers, type MoodId, type RarityId, type TierId,
} from "@/lib/market/layer";
import { familyInfo, matchups, speciesFor, type FamilyId } from "@/lib/market/species";
import { solanaNetwork } from "@/lib/solana/server";
import { habitatFor, type ZoneId } from "@/lib/zones";
import type { Coin } from "@/generated/prisma/client";

export interface WorldCreature {
  id: string;
  ticker: string;
  name: string;
  family: FamilyId;
  variantIndex: number;
  hue: number;
  patternSeed: number;
  palette: string[];
  hasLogo: boolean;
  tier: TierId | null;
  scale: number;
  mood: MoodId;
  moodIntensity: number;
  rarity: RarityId;
  newArrival: boolean;
  graduated: boolean;
  /** Home zone (creatures also roam). */
  zone: ZoneId;
  /** Swim speed multiplier from the market layer (clamped). */
  spd: number;
  schoolSize: number;
}

export interface SourceAsOf {
  lastSuccessAt: string | null;
  stale: boolean;
  failing: boolean;
}

export interface WorldPayload {
  generatedAt: string;
  network: SolanaNetwork;
  sources: { chain: SourceAsOf; solPrice: SourceAsOf; dex: SourceAsOf | null };
  creatures: WorldCreature[];
}

const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

async function sourceInfo(network: SolanaNetwork): Promise<WorldPayload["sources"]> {
  const rows = await db.sourceStatus.findMany();
  const get = (id: string): SourceAsOf => {
    const r = rows.find((s) => s.source === id);
    const at = r?.lastSuccessAt ?? null;
    return {
      lastSuccessAt: at?.toISOString() ?? null,
      stale: !at || Date.now() - at.getTime() > POLLING.staleAfterMs,
      failing: (r?.consecutiveFailures ?? 0) > 0,
    };
  };
  return {
    chain: get("solana:curves"),
    solPrice: get("coingecko:sol-price"),
    dex: network === "mainnet-beta" ? get("dexscreener:pairs") : null,
  };
}

function marketInputs(c: Coin) {
  return {
    marketCapUsd: c.marketCapUsd,
    change24hPct: c.change24hPct,
    mood: c.mood as MoodId,
    trackedRank: c.trackedRank,
    speedPercentile: c.speedPercentile,
  };
}

export function toCreature(c: Coin): WorldCreature {
  const sp = speciesFor(c.speciesSeed);
  const tier = tierFor(c.marketCapUsd);
  const mood = c.mood as MoodId;
  const newArrival = isNewArrival(c.firstSeenAt);
  const schoolSize = tier?.id === "leviathan" ? WORLD.maxSchoolSize : tier?.id === "elder" ? 2 : 1;
  return {
    id: c.id,
    ticker: c.ticker,
    name: c.name,
    family: sp.family,
    variantIndex: sp.variantIndex,
    hue: sp.hue,
    patternSeed: sp.patternSeed,
    palette: c.palette,
    // Every hatched coin gets its emblem from the uploaded image at hatch time.
    hasLogo: true,
    tier: tier?.id ?? null,
    scale: tier?.scale ?? 0.8,
    mood,
    moodIntensity: moodIntensity(mood, c.change24hPct),
    rarity: rarityFor(c.trackedRank).id,
    newArrival,
    graduated: c.curveComplete,
    zone: habitatFor({ mood, tier: tier?.id ?? null, newArrival, speedPercentile: c.speedPercentile }),
    spd: marketModifiers(marketInputs(c)).spd,
    schoolSize: Math.min(schoolSize, WORLD.maxSchoolSize),
  };
}

let worldCache: { at: number; payload: WorldPayload } | null = null;

export async function getWorld(): Promise<WorldPayload> {
  if (worldCache && Date.now() - worldCache.at < 10_000) return worldCache.payload;
  const network = solanaNetwork();
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE", network },
    omit: { logoWebp: true },
    orderBy: { marketCapUsd: { sort: "desc", nulls: "last" } },
  });
  const payload: WorldPayload = {
    generatedAt: new Date().toISOString(),
    network,
    sources: await sourceInfo(network),
    creatures: coins.map((c) => toCreature(c as Coin)),
  };
  worldCache = { at: Date.now(), payload };
  return payload;
}

export interface StatField {
  value: number | string | null;
  /** Tooltip shown with "—" when value is null. */
  missing?: string;
}

export interface CoinDetail {
  creature: WorldCreature;
  name: string;
  description: string;
  network: SolanaNetwork;
  networkLabel: string;
  mint: string;
  creatorWallet: string;
  creatorShort: string;
  hatchedAt: string;
  links: { twitter: string | null; telegram: string | null; website: string | null };
  explorer: { token: string; launchTx: string; creator: string };
  species: {
    familyLabel: string;
    variant: string;
    blurb: string;
    strongVs: string;
    weakVs: string;
    tierLabel: string | null;
    rarityLabel: string;
    habitat: ZoneId;
  };
  market: MarketModifiers & { speedMod: number; moodSince: string };
  stats: {
    marketCapUsd: StatField;
    marketCapSol: StatField;
    priceUsd: StatField;
    change24hPct: StatField;
    liquidityUsd: StatField;
    dexVolume24hUsd: StatField;
    trackedRank: StatField;
  };
  change24hSource: string | null;
  updated: { curve: string | null; market: string | null; dex: string | null };
  history: { t: number; mcap: number | null }[];
  events: { id: string; at: string; message: string }[];
}

function dexMissing(c: Coin): string {
  if (c.network !== "mainnet-beta") return "DexScreener doesn't index Solana devnet, so DEX liquidity and volume aren't available for test creatures.";
  if (!c.dexUpdatedAt) return `Not checked yet. DexScreener is checked about every ${POLLING.dexPairsMs / 60_000} minutes.`;
  return "DexScreener hasn't listed this token yet. New pump.fun tokens usually show up there once they start trading.";
}

export async function getCoinDetail(id: string): Promise<CoinDetail | null> {
  const c = (await db.coin.findUnique({ where: { id }, omit: { logoWebp: true } })) as Coin | null;
  if (!c || c.status === "HIDDEN") return null;

  const creature = toCreature(c);
  const sp = speciesFor(c.speciesSeed);
  const fam = familyInfo(sp.family);
  const mu = matchups(sp.family);
  const network = c.network as SolanaNetwork;

  const since = new Date(Date.now() - TRACKING.snapshotFullResHours * 3_600_000);
  const [snaps, events] = await Promise.all([
    db.coinSnapshot.findMany({ where: { coinId: id, at: { gte: since } }, orderBy: { at: "asc" }, select: { at: true, marketCapUsd: true } }),
    db.worldEvent.findMany({ where: { coinId: id }, orderBy: { at: "desc" }, take: 6 }),
  ]);
  const f = (value: number | string | null | undefined, missing: string): StatField =>
    value == null ? { value: null, missing } : { value };
  const hoursOld = (Date.now() - c.firstSeenAt.getTime()) / 3_600_000;

  return {
    creature,
    name: c.name,
    description: c.description,
    network,
    networkLabel: NETWORK_LABEL[network],
    mint: c.address,
    creatorWallet: c.creatorWallet,
    creatorShort: shortWallet(c.creatorWallet),
    hatchedAt: c.firstSeenAt.toISOString(),
    links: { twitter: c.twitter, telegram: c.telegram, website: c.website },
    explorer: {
      token: explorerUrl(network, "token", c.address),
      launchTx: explorerUrl(network, "tx", c.launchSignature),
      creator: explorerUrl(network, "account", c.creatorWallet),
    },
    species: {
      familyLabel: fam.label,
      variant: sp.variant,
      blurb: fam.blurb,
      strongVs: familyInfo(mu.strongVs).label,
      weakVs: familyInfo(mu.weakVs).label,
      tierLabel: tierFor(c.marketCapUsd)?.label ?? null,
      rarityLabel: rarityFor(c.trackedRank).label,
      habitat: creature.zone,
    },
    market: { ...marketModifiers(marketInputs(c)), speedMod: speedModFor(c.speedPercentile), moodSince: c.moodSince.toISOString() },
    stats: {
      marketCapUsd: f(c.marketCapUsd, c.marketCapSol == null ? "Waiting for the first reading of this token's bonding curve." : "Waiting for the SOL/USD price."),
      marketCapSol: f(c.marketCapSol, c.curveComplete ? "The bonding curve is complete; the token now trades in a pool." : "Waiting for the first reading of this token's bonding curve."),
      priceUsd: f(c.priceUsd, "Waiting for the first price reading."),
      change24hPct: f(
        c.change24hPct,
        hoursOld < TRACKING.snapshotChangeMinAgeHours
          ? `Needs 24 hours of history; this creature hatched ${hoursOld < 1 ? "less than an hour" : `${Math.floor(hoursOld)} h`} ago.`
          : "No reading from 24 hours ago is available.",
      ),
      liquidityUsd: f(c.liquidityUsd, dexMissing(c)),
      dexVolume24hUsd: f(c.dexVolume24hUsd, dexMissing(c)),
      trackedRank: f(c.trackedRank, "Ranks are given once a market cap is known."),
    },
    change24hSource: c.change24hSource,
    updated: {
      curve: c.curveUpdatedAt?.toISOString() ?? null,
      market: c.marketUpdatedAt?.toISOString() ?? null,
      dex: c.dexUpdatedAt?.toISOString() ?? null,
    },
    history: snaps.map((s) => ({ t: s.at.getTime(), mcap: s.marketCapUsd })),
    events: events.map((e) => ({ id: e.id.toString(), at: e.at.toISOString(), message: e.message })),
  };
}

export interface FeedItem {
  id: string;
  at: string;
  kind: string;
  message: string;
  coinId: string | null;
}

export async function getFeed(afterId?: bigint): Promise<FeedItem[]> {
  const rows = await db.worldEvent.findMany({
    where: {
      ...(afterId ? { id: { gt: afterId } } : {}),
      OR: [{ coinId: null }, { coin: { status: "ACTIVE", network: solanaNetwork() } }],
    },
    orderBy: { id: "desc" },
    take: WORLD.feedLimit,
  });
  return rows.map((e) => ({ id: e.id.toString(), at: e.at.toISOString(), kind: e.kind, message: e.message, coinId: e.coinId }));
}

export type RankSort = "mcap" | "movers" | "newest" | "oldest";
export const RANK_SORTS: { id: RankSort; label: string }[] = [
  { id: "mcap", label: "Biggest" },
  { id: "movers", label: "Biggest moves (24h)" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

export interface RankRow {
  id: string;
  ticker: string;
  name: string;
  family: FamilyId;
  variant: string;
  hasLogo: boolean;
  tierLabel: string | null;
  mood: MoodId;
  marketCapUsd: number | null;
  change24hPct: number | null;
  hatchedAt: string;
  creatorShort: string;
  graduated: boolean;
}

export async function getRankings(sort: RankSort): Promise<RankRow[]> {
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE", network: solanaNetwork() },
    omit: { logoWebp: true },
  });
  const rows = coins.map((c): RankRow => {
    const sp = speciesFor(c.speciesSeed);
    return {
      id: c.id,
      ticker: c.ticker,
      name: c.name,
      family: sp.family,
      variant: sp.variant,
      hasLogo: true,
      tierLabel: tierFor(c.marketCapUsd)?.label ?? null,
      mood: c.mood as MoodId,
      marketCapUsd: c.marketCapUsd,
      change24hPct: c.change24hPct,
      hatchedAt: c.firstSeenAt.toISOString(),
      creatorShort: shortWallet(c.creatorWallet),
      graduated: c.curveComplete,
    };
  });
  const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);
  if (sort === "mcap") rows.sort((a, b) => nullsLast(a.marketCapUsd, b.marketCapUsd));
  if (sort === "movers") rows.sort((a, b) => nullsLast(a.change24hPct == null ? null : Math.abs(a.change24hPct), b.change24hPct == null ? null : Math.abs(b.change24hPct)));
  if (sort === "newest") rows.sort((a, b) => b.hatchedAt.localeCompare(a.hatchedAt));
  if (sort === "oldest") rows.sort((a, b) => a.hatchedAt.localeCompare(b.hatchedAt));
  return rows;
}
