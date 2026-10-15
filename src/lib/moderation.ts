import { DENYLIST_KEYS, DENYLIST_WORDS } from "@/config/data";

const denyKeys = new Set(DENYLIST_KEYS.map((k) => k.toLowerCase()));
const stems = DENYLIST_WORDS.filter((w) => w.endsWith("*")).map((w) => w.slice(0, -1).toLowerCase());
const words = new Set(DENYLIST_WORDS.filter((w) => !w.endsWith("*")).map((w) => w.toLowerCase()));

/** True if a coin must never be shown (denylisted key, or offensive name/ticker/text). */
export function isDenied(keys: string[], name: string, ticker: string): boolean {
  if (keys.some((k) => denyKeys.has(k.toLowerCase()))) return true;
  const text = `${name} ${ticker}`.toLowerCase();
  if (stems.some((s) => text.includes(s))) return true;
  return text.split(/[^a-z0-9]+/).some((t) => words.has(t));
}
