/**
 * Loads the official pump.fun SDK through Node's CommonJS loader. Its ES-module build imports
 * `BN` from @coral-xyz/anchor in a way Node's ESM loader rejects; the CommonJS build works.
 * Server only (the package is in next.config's serverExternalPackages).
 */
import { createRequire } from "node:module";
import type * as PumpSdk from "@pump-fun/pump-sdk";

const require = createRequire(import.meta.url);

let cached: typeof PumpSdk | null = null;
export function pumpSdk(): typeof PumpSdk {
  cached ??= require("@pump-fun/pump-sdk") as typeof PumpSdk;
  return cached;
}
