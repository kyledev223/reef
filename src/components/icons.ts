import type { FamilyId } from "@/lib/market/species";

export const FAMILY_ICON: Record<FamilyId, string> = {
  fish: "🐠",
  octopus: "🐙",
  crab: "🦀",
  turtle: "🐢",
  jelly: "🪼",
  eel: "〰️",
};

export const MOOD_ICON = { FRENZY: "🔥", SULKING: "🌧️", CALM: "🌊" } as const;
export const MOOD_LABEL = { FRENZY: "Frenzy", SULKING: "Sulking", CALM: "Calm" } as const;
