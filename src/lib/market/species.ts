/**
 * Deterministic species from a coin's stable key.
 * Key = "<chain>:<address>" for DexScreener coins, "cg:<id>" for CoinGecko coins
 * (CoinGecko coins can live on several chains, so their id is the stable identity).
 */

export const FAMILIES = [
  {
    id: "eel",
    label: "Eel",
    blurb: "Long, sinuous ambushers that strike from crevices.",
    variants: ["Moray", "Ribbon Eel", "Electric Eel"],
  },
  {
    id: "octopus",
    label: "Octopus",
    blurb: "Clever eight-armed tricksters that cloud the water with ink.",
    variants: ["Reef Octopus", "Cuttlefish", "Nautilus"],
  },
  {
    id: "crab",
    label: "Crab",
    blurb: "Armoured pinchers that scuttle sideways and hit hard.",
    variants: ["Hermit Crab", "Spider Crab", "Mantis Shrimp", "Lobster"],
  },
  {
    id: "turtle",
    label: "Turtle",
    blurb: "Shell-backed wanderers with endless stamina.",
    variants: ["Green Turtle", "Hawksbill", "Leatherback"],
  },
  {
    id: "jelly",
    label: "Jellyfish",
    blurb: "Drifting bells trailing stinging ribbons.",
    variants: ["Moon Jelly", "Box Jelly", "Lion's Mane"],
  },
  {
    id: "fish",
    label: "Fish",
    blurb: "Quick, colourful schoolers that swarm larger foes.",
    variants: ["Angelfish", "Pufferfish", "Lionfish", "Sailfish"],
  },
] as const;

export type FamilyId = (typeof FAMILIES)[number]["id"];

/** Ring type chart: each family beats the next one. */
export const TYPE_RING: FamilyId[] = ["eel", "octopus", "crab", "turtle", "jelly", "fish"];

/** cyrb53: small, fast, isomorphic 53-bit string hash. */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export interface Species {
  family: FamilyId;
  familyLabel: string;
  variantIndex: number;
  variant: string;
  /** Fallback hue (0–360) used when the logo has no usable colours. */
  hue: number;
  /** Extra per-coin seed for pattern details (stripes, spots...). */
  patternSeed: number;
}

export function speciesFor(coinKey: string): Species {
  const k = coinKey.toLowerCase();
  const h = hash53(k);
  const fam = FAMILIES[h % FAMILIES.length];
  const variantIndex = Math.floor(h / FAMILIES.length) % fam.variants.length;
  return {
    family: fam.id,
    familyLabel: fam.label,
    variantIndex,
    variant: fam.variants[variantIndex],
    hue: hash53(k, 7) % 360,
    patternSeed: hash53(k, 13) % 1_000_000,
  };
}

export function familyInfo(id: FamilyId) {
  return FAMILIES.find((f) => f.id === id)!;
}

/** Families this one is strong / weak against on the ring. */
export function matchups(id: FamilyId): { strongVs: FamilyId; weakVs: FamilyId } {
  const i = TYPE_RING.indexOf(id);
  const n = TYPE_RING.length;
  return { strongVs: TYPE_RING[(i + 1) % n], weakVs: TYPE_RING[(i - 1 + n) % n] };
}
