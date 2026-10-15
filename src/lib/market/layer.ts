/**
 * Market layer: turns real coin data into capped creature modifiers.
 * Pure functions: used by the worker (to store derived values) and the API (to explain them).
 */
import { MARKET_CAP, MOOD, RARITY, SPEED, TIERS, TRACKING } from "@/config/balance";

export type MoodId = "CALM" | "FRENZY" | "SULKING";
export type TierId = (typeof TIERS)[number]["id"];
export type RarityId = (typeof RARITY)[number]["id"];

export function tierFor(marketCapUsd: number | null | undefined) {
  if (marketCapUsd == null || !(marketCapUsd > 0)) return null;
  let t: (typeof TIERS)[number] = TIERS[0];
  for (const tier of TIERS) if (marketCapUsd >= tier.minCap) t = tier;
  return t;
}

export function rarityFor(trackedRank: number | null | undefined) {
  if (trackedRank == null) return RARITY[RARITY.length - 1];
  return RARITY.find((r) => trackedRank <= r.maxRank) ?? RARITY[RARITY.length - 1];
}

/** Next mood given the previous one and the 24h change, with hysteresis. */
export function nextMood(prev: MoodId, change24hPct: number | null | undefined): MoodId {
  if (change24hPct == null || !Number.isFinite(change24hPct)) return "CALM";
  const c = change24hPct;
  if (prev === "FRENZY" && c >= MOOD.frenzyLeave) return "FRENZY";
  if (prev === "SULKING" && c <= MOOD.sulkLeave) return "SULKING";
  if (c >= MOOD.frenzyEnter) return "FRENZY";
  if (c <= MOOD.sulkEnter) return "SULKING";
  return "CALM";
}

/** Size of the mood effect (0 for Calm), log-scaled between the thresholds and saturation. */
export function moodIntensity(mood: MoodId, change24hPct: number | null | undefined): number {
  if (mood === "CALM" || change24hPct == null) return 0;
  const a = Math.abs(change24hPct);
  const lo = mood === "FRENZY" ? MOOD.frenzyEnter : -MOOD.sulkEnter;
  const t = a <= lo ? 0 : Math.min(1, Math.log(a / lo) / Math.log(MOOD.saturatePct / lo));
  return MOOD.minEffect + t * (MOOD.maxEffect - MOOD.minEffect);
}

export function speedModFor(percentile: number | null | undefined): number {
  if (percentile == null) return 0;
  return (percentile - 0.5) * 2 * SPEED.maxMod;
}

/** Hatched within the last TRACKING.newArrivalMaxAgeHours. */
export function isNewArrival(hatchedAt: Date | string | null | undefined, now = Date.now()) {
  if (!hatchedAt) return false;
  const ageMs = now - new Date(hatchedAt).getTime();
  return ageMs >= 0 && ageMs <= TRACKING.newArrivalMaxAgeHours * 3_600_000;
}

const clamp = (v: number) => Math.min(MARKET_CAP.max, Math.max(MARKET_CAP.min, v));

export interface MarketInputs {
  marketCapUsd: number | null;
  change24hPct: number | null;
  mood: MoodId;
  trackedRank: number | null;
  speedPercentile: number | null;
}

export interface ModifierPart {
  source: "tier" | "mood" | "speed" | "rarity";
  label: string;
  value: number;
}

export interface MarketModifiers {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  parts: { hp: ModifierPart[]; atk: ModifierPart[]; def: ModifierPart[]; spd: ModifierPart[] };
}

/** Final stat multipliers (each clamped to MARKET_CAP) plus the breakdown for the UI. */
export function marketModifiers(m: MarketInputs): MarketModifiers {
  const tier = tierFor(m.marketCapUsd);
  const rarity = rarityFor(m.trackedRank);
  const intensity = moodIntensity(m.mood, m.change24hPct);
  const speed = speedModFor(m.speedPercentile);

  const parts: MarketModifiers["parts"] = { hp: [], atk: [], def: [], spd: [] };
  const add = (stat: keyof typeof parts, p: ModifierPart) => p.value !== 0 && parts[stat].push(p);

  if (tier) add("hp", { source: "tier", label: tier.label, value: tier.hpMod });
  if (m.mood === "FRENZY") {
    add("atk", { source: "mood", label: "Frenzy", value: intensity });
    add("def", { source: "mood", label: "Frenzy", value: -intensity });
  } else if (m.mood === "SULKING") {
    add("atk", { source: "mood", label: "Sulking", value: -intensity });
    add("def", { source: "mood", label: "Sulking", value: intensity });
  }
  add("spd", { source: "speed", label: "Trading pace", value: speed });
  for (const s of ["hp", "atk", "def", "spd"] as const) {
    add(s, { source: "rarity", label: rarity.label, value: rarity.statMod });
  }

  const total = (s: keyof typeof parts) => clamp(1 + parts[s].reduce((a, p) => a + p.value, 0));
  return { hp: total("hp"), atk: total("atk"), def: total("def"), spd: total("spd"), parts };
}

/** Percentile rank (0..1) of each value among the non-null ones. Ties share the average rank. */
export function percentiles(values: (number | null)[]): (number | null)[] {
  const idx = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => a.v - b.v);
  const out: (number | null)[] = values.map(() => null);
  if (idx.length === 1) out[idx[0].i] = 0.5;
  if (idx.length < 2) return out;
  let j = 0;
  while (j < idx.length) {
    let k = j;
    while (k + 1 < idx.length && idx[k + 1].v === idx[j].v) k++;
    const p = (j + k) / 2 / (idx.length - 1);
    for (let t = j; t <= k; t++) out[idx[t].i] = p;
    j = k + 1;
  }
  return out;
}
