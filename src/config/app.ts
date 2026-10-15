/**
 * Branding. Rename the game here and nowhere else.
 */
export const APP = {
  name: "Reefworld",
  tagline: "A living reef of creatures hatched as real tokens",
  currency: "Pearls",
  disclaimer: "Market data is for gameplay only. Not financial advice.",
  dataCredit: "Data: Solana, pump.fun, DexScreener, CoinGecko",
} as const;

/**
 * The project's own token and social links, shown in the header. Leave a value empty to hide
 * its button.
 *   mint:    the token's mint address (contract address) on Solana, e.g. "Fvxh…pump"
 *   twitter: full link to the project's X account, e.g. "https://x.com/yourhandle"
 */
export const OFFICIAL: { mint: string; twitter: string } = {
  mint: "mqWFS3fVZyTUdTqeMuVgWisCqTdByBiCELMZU3Rpump",
  twitter: "https://x.com/reefworldfun",
};

/** pump.fun page for the official token, or null if no mint is set. */
export const officialPumpFunUrl = () => (OFFICIAL.mint ? `https://pump.fun/coin/${OFFICIAL.mint}` : null);
