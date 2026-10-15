import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node at runtime instead of being bundled: native modules (sharp, pg) and the
  // pump.fun SDK, whose mixed CommonJS/ESM build breaks when bundled.
  serverExternalPackages: ["sharp", "pg", "@prisma/adapter-pg", "@pump-fun/pump-sdk", "@pump-fun/pump-swap-sdk", "@coral-xyz/anchor"],
  // The pump.fun SDK is loaded with createRequire (see src/lib/hatch/pumpSdk.ts), which file tracing
  // may not follow; make sure it ships with the hatch routes on Vercel.
  outputFileTracingIncludes: {
    "/api/hatch/**": ["./node_modules/@pump-fun/**/*", "./node_modules/@coral-xyz/anchor/**/*"],
  },
};

export default nextConfig;
