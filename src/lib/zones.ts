/**
 * Districts of the sunken city and where creatures make their home. Home follows live market
 * traits, so creatures move house as the market changes (and roam the roads in between).
 */
import type { MoodId, TierId } from "@/lib/market/layer";

export const WORLD_SIZE = { w: 4200, h: 3000 } as const;

export interface District {
  id: "plaza" | "kelp" | "market" | "racetrack" | "ship" | "trench";
  name: string;
  blurb: string;
  habitat: string;
  /** Area of the city this district covers (roads inside it count as its streets). */
  rect: { x: number; y: number; w: number; h: number };
  /** Where the district's name plate sits. */
  label: { x: number; y: number };
}

export const ZONES: readonly District[] = [
  {
    id: "plaza",
    name: "Shell Plaza",
    blurb: "The heart of the city, where newly hatched creatures emerge from the Great Shell.",
    habitat: "Creatures hatched in the last 24 hours.",
    rect: { x: 1500, y: 300, w: 1200, h: 1800 },
    label: { x: 2100, y: 1180 },
  },
  {
    id: "kelp",
    name: "Kelp Gardens",
    blurb: "Terraced gardens of swaying kelp, home to the reef's settled adults.",
    habitat: "Adult-tier creatures.",
    rect: { x: 0, y: 0, w: 1500, h: 1500 },
    label: { x: 1200, y: 900 },
  },
  {
    id: "market",
    name: "Coral Market",
    blurb: "Bright coral arcades and stalls, always busy with small fry.",
    habitat: "Hatchlings and juveniles.",
    rect: { x: 2700, y: 0, w: 1500, h: 1500 },
    label: { x: 3000, y: 900 },
  },
  {
    id: "racetrack",
    name: "Current Racetrack",
    blurb: "A great hippodrome where fast water runs and restless creatures race.",
    habitat: "Creatures in a Frenzy and the fastest traders.",
    rect: { x: 2700, y: 1500, w: 1500, h: 1500 },
    label: { x: 3300, y: 1455 },
  },
  {
    id: "ship",
    name: "Sunken Ship Docks",
    blurb: "An old harbour basin around a barnacled wreck, where sulking creatures hide.",
    habitat: "Creatures that are Sulking.",
    rect: { x: 0, y: 1500, w: 1500, h: 1500 },
    label: { x: 900, y: 1455 },
  },
  {
    id: "trench",
    name: "Trench Gate",
    blurb: "The great gate over the abyss, where the city's giants gather.",
    habitat: "Elder and Leviathan-class creatures.",
    rect: { x: 1500, y: 2100, w: 1200, h: 900 },
    label: { x: 2100, y: 2160 },
  },
];

export type ZoneId = District["id"];

export const zoneName = (id: ZoneId) => ZONES.find((z) => z.id === id)!.name;

/** District containing a point (first match), or the nearest district by label position. */
export function zoneAt(x: number, y: number): ZoneId {
  const hit = ZONES.find((z) => x >= z.rect.x && x < z.rect.x + z.rect.w && y >= z.rect.y && y < z.rect.y + z.rect.h);
  if (hit) return hit.id;
  return ZONES.reduce((best, z) => (Math.hypot(z.label.x - x, z.label.y - y) < Math.hypot(best.label.x - x, best.label.y - y) ? z : best)).id;
}

/** Home district. Creatures also roam to other districts (see WORLD.roamChance) but return here. */
export function habitatFor(c: {
  mood: MoodId;
  tier: TierId | null;
  newArrival: boolean;
  speedPercentile: number | null;
}): ZoneId {
  if (c.newArrival) return "plaza";
  if (c.mood === "FRENZY") return "racetrack";
  if (c.mood === "SULKING") return "ship";
  if (c.speedPercentile != null && c.speedPercentile >= 0.92) return "racetrack";
  if (c.tier === "leviathan" || c.tier === "elder") return "trench";
  if (c.tier === "adult") return "kelp";
  return "market";
}
