import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { MARKET_CAP, MOOD, TRACKING } from "@/config/balance";
import { checkFields } from "@/lib/hatch/validate";
import { isDenied } from "@/lib/moderation";
import { paletteFromRgba } from "@/lib/palette";
import { bondingCurvePda, curveMarket, decodeBondingCurve } from "@/lib/solana/curve";
import { aggregatePairs, type DexPair } from "@/lib/sources/dexscreener";
import { habitatFor } from "@/lib/zones";
import { isNewArrival, marketModifiers, moodIntensity, nextMood, percentiles, rarityFor, tierFor } from "./layer";
import { FAMILIES, matchups, speciesFor } from "./species";

describe("tiers", () => {
  it("maps market cap to size tiers scaled for new pump.fun coins", () => {
    expect(tierFor(4_500)?.id).toBe("hatchling");
    expect(tierFor(10_000)?.id).toBe("juvenile");
    expect(tierFor(80_000)?.id).toBe("adult");
    expect(tierFor(900_000)?.id).toBe("elder");
    expect(tierFor(12_000_000)?.id).toBe("leviathan");
  });
  it("returns null without a market cap instead of guessing", () => {
    expect(tierFor(null)).toBeNull();
    expect(tierFor(0)).toBeNull();
  });
});

describe("mood", () => {
  it("enters Frenzy/Sulking at the thresholds", () => {
    expect(nextMood("CALM", MOOD.frenzyEnter)).toBe("FRENZY");
    expect(nextMood("CALM", MOOD.sulkEnter)).toBe("SULKING");
    expect(nextMood("CALM", MOOD.frenzyEnter - 1)).toBe("CALM");
  });
  it("uses hysteresis so moods don't flicker", () => {
    expect(nextMood("FRENZY", MOOD.frenzyLeave + 1)).toBe("FRENZY");
    expect(nextMood("FRENZY", MOOD.frenzyLeave - 1)).toBe("CALM");
    expect(nextMood("SULKING", MOOD.sulkLeave - 1)).toBe("SULKING");
    expect(nextMood("SULKING", MOOD.sulkLeave + 1)).toBe("CALM");
  });
  it("is Calm when the 24h change is missing", () => {
    expect(nextMood("FRENZY", null)).toBe("CALM");
  });
  it("scales intensity between min and max effect, saturating", () => {
    expect(moodIntensity("FRENZY", MOOD.frenzyEnter)).toBeCloseTo(MOOD.minEffect);
    expect(moodIntensity("FRENZY", MOOD.saturatePct)).toBeCloseTo(MOOD.maxEffect);
    expect(moodIntensity("FRENZY", 57_939)).toBeCloseTo(MOOD.maxEffect);
    expect(moodIntensity("CALM", 50)).toBe(0);
  });
});

describe("market modifiers", () => {
  it("never exceed the configured cap", () => {
    const m = marketModifiers({ marketCapUsd: 5e10, change24hPct: 5000, mood: "FRENZY", trackedRank: 1, speedPercentile: 1 });
    for (const v of [m.hp, m.atk, m.def, m.spd]) {
      expect(v).toBeLessThanOrEqual(MARKET_CAP.max);
      expect(v).toBeGreaterThanOrEqual(MARKET_CAP.min);
    }
    expect(m.atk).toBeGreaterThan(1);
    expect(m.def).toBeLessThan(1);
  });
  it("Sulking trades attack for defense", () => {
    const m = marketModifiers({ marketCapUsd: 8e4, change24hPct: -60, mood: "SULKING", trackedRank: 200, speedPercentile: 0.5 });
    expect(m.def).toBeGreaterThan(1);
    expect(m.atk).toBeLessThan(1);
    expect(m.spd).toBeCloseTo(1);
  });
  it("is neutral for missing data", () => {
    const m = marketModifiers({ marketCapUsd: null, change24hPct: null, mood: "CALM", trackedRank: null, speedPercentile: null });
    expect([m.hp, m.atk, m.def, m.spd]).toEqual([1, 1, 1, 1]);
  });
});

describe("rarity, percentiles, new arrivals", () => {
  it("ranks rarity by market-cap rank", () => {
    expect(rarityFor(1).id).toBe("legendary");
    expect(rarityFor(20).id).toBe("epic");
    expect(rarityFor(61).id).toBe("uncommon");
    expect(rarityFor(null).id).toBe("common");
  });
  it("computes percentiles ignoring nulls, ties share a rank", () => {
    expect(percentiles([3, null, 1, 2, 2])).toEqual([1, null, 0, 0.5, 0.5]);
    expect(percentiles([null, 7])).toEqual([null, 0.5]);
  });
  it("counts as a new arrival only within the configured hours of hatching", () => {
    const now = Date.now();
    expect(isNewArrival(new Date(now - 3_600_000), now)).toBe(true);
    expect(isNewArrival(new Date(now - (TRACKING.newArrivalMaxAgeHours + 1) * 3_600_000), now)).toBe(false);
  });
});

describe("species", () => {
  it("is deterministic and case-insensitive", () => {
    const key = "devnet:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    expect(speciesFor(key)).toEqual(speciesFor(key.toLowerCase()));
    expect(FAMILIES.some((f) => f.id === speciesFor(key).family)).toBe(true);
  });
  it("spreads coins over every family", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(speciesFor(`devnet:mint-${i}`).family);
    expect(seen.size).toBe(FAMILIES.length);
  });
  it("has a ring type chart", () => {
    expect(matchups("eel")).toEqual({ strongVs: "octopus", weakVs: "fish" });
    expect(matchups("fish")).toEqual({ strongVs: "eel", weakVs: "jelly" });
  });
});

describe("moderation", () => {
  it("blocks whole words and stems, not innocent substrings", () => {
    expect(isDenied([], "Cucumber", "CUKE")).toBe(false);
    expect(isDenied([], "Pipedog", "PIPEDOG")).toBe(false);
    expect(isDenied([], "Pornhub Inu", "PHI")).toBe(true);
    expect(isDenied([], "Big Cum", "BC")).toBe(true);
  });
});

describe("habitat", () => {
  const base = { mood: "CALM" as const, tier: "adult" as const, newArrival: false, speedPercentile: 0.5 };
  it("follows live traits", () => {
    expect(habitatFor(base)).toBe("kelp");
    expect(habitatFor({ ...base, mood: "FRENZY" })).toBe("racetrack");
    expect(habitatFor({ ...base, mood: "SULKING" })).toBe("ship");
    expect(habitatFor({ ...base, tier: "leviathan" })).toBe("trench");
    expect(habitatFor({ ...base, newArrival: true })).toBe("plaza");
  });
});

describe("pump.fun bonding curve", () => {
  const creator = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  const encode = (vTok: bigint, vSol: bigint, supply: bigint, complete: boolean) => {
    const buf = new Uint8Array(150);
    const v = new DataView(buf.buffer);
    v.setBigUint64(8, vTok, true);
    v.setBigUint64(16, vSol, true);
    v.setBigUint64(24, 793_100_000_000_000n, true);
    v.setBigUint64(32, 0n, true);
    v.setBigUint64(40, supply, true);
    buf[48] = complete ? 1 : 0;
    buf.set(creator.toBytes(), 49);
    return buf;
  };
  it("decodes reserves, completion and creator", () => {
    const c = decodeBondingCurve(encode(1_073_000_000_000_000n, 30_000_000_000n, 1_000_000_000_000_000n, false))!;
    expect(c.complete).toBe(false);
    expect(c.creator).toBe(creator.toBase58());
    expect(c.virtualSolReserves).toBe(30_000_000_000n);
  });
  it("prices a fresh curve at about 28 SOL market cap", () => {
    // Initial pump.fun curve: 30 virtual SOL against 1.073B virtual tokens, 1B supply.
    const m = curveMarket(decodeBondingCurve(encode(1_073_000_000_000_000n, 30_000_000_000n, 1_000_000_000_000_000n, false))!)!;
    expect(m.marketCapSol).toBeCloseTo(27.96, 1);
    expect(m.priceSol).toBeCloseTo(2.796e-8, 10);
  });
  it("rejects short data and derives a stable PDA", () => {
    expect(decodeBondingCurve(new Uint8Array(40))).toBeNull();
    const mint = "So11111111111111111111111111111111111111112";
    expect(bondingCurvePda(mint).toBase58()).toBe(bondingCurvePda(new PublicKey(mint)).toBase58());
  });
});

describe("hatch form validation", () => {
  const ok = { name: "Captain Bubbles", ticker: "$bubble", description: "Born in a kelp storm.", mint: "So11111111111111111111111111111111111111112" };
  it("normalises the ticker and optional links", () => {
    const r = checkFields({ ...ok, website: "bubbles.example", twitter: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.ticker).toBe("BUBBLE");
      expect(r.fields.website).toBe("https://bubbles.example");
      expect(r.fields.twitter).toBeNull();
    }
  });
  it("rejects bad tickers, foreign social links and denylisted names", () => {
    expect(checkFields({ ...ok, ticker: "BUB BLE" }).ok).toBe(false);
    expect(checkFields({ ...ok, twitter: "https://evil.example/x" }).ok).toBe(false);
    expect(checkFields({ ...ok, name: "Porn Coin" }).ok).toBe(false);
    expect(checkFields({ ...ok, name: "x".repeat(40) }).ok).toBe(false);
  });
});

describe("palette", () => {
  it("picks distinct dominant colours and ignores transparent pixels", () => {
    const px: number[] = [];
    for (let i = 0; i < 60; i++) px.push(230, 40, 40, 255);
    for (let i = 0; i < 30; i++) px.push(40, 90, 230, 255);
    for (let i = 0; i < 90; i++) px.push(0, 255, 0, 0);
    const p = paletteFromRgba(px);
    expect(p.length).toBe(2);
    expect(p[0]).toBe("#e62828");
  });
});

describe("DexScreener aggregation", () => {
  const pair = (base: string, liq: number | null, vol: number, created: number): DexPair => ({
    chainId: "solana",
    pairAddress: `${base}-${liq}-${created}`,
    baseToken: { address: base, name: "X", symbol: "X" },
    quoteToken: { address: "So11111111111111111111111111111111111111112", name: "SOL", symbol: "SOL" },
    liquidity: liq == null ? undefined : { usd: liq },
    volume: { h24: vol },
    pairCreatedAt: created,
  });
  it("sums liquidity/volume over base pairs and takes the oldest pair", () => {
    const agg = aggregatePairs("AbC", [pair("abc", 100, 10, 2000), pair("AbC", 300, 5, 1000), pair("other", 999, 999, 1)])!;
    expect(agg.liquidityUsd).toBe(400);
    expect(agg.dexVolume24hUsd).toBe(15);
    expect(agg.pairCreatedAt?.getTime()).toBe(1000);
    expect(agg.main?.liquidity?.usd).toBe(300);
  });
  it("keeps liquidity null when no pair reports it", () => {
    expect(aggregatePairs("abc", [pair("abc", null, 1, 1)])!.liquidityUsd).toBeNull();
    expect(aggregatePairs("abc", [])).toBeNull();
  });
});
