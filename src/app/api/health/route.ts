/**
 * Health check for the deployed site: open /api/health to see whether the database, the Solana
 * RPC endpoints, the pump.fun SDK and pump.fun's upload service work from the server.
 * Shows hostnames only, never API keys.
 */
import { Connection, Keypair } from "@solana/web3.js";
import { ENDPOINTS } from "@/config/data";
import { db } from "@/lib/db";
import { pumpSdk } from "@/lib/hatch/pumpSdk";
import { classifyRpcError, rpcLabel, rpcUrls, solanaNetwork } from "@/lib/solana/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: true; ms: number; value: T } | { ok: false; ms: number; error: string }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t0, value };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: (err instanceof Error ? err.message : String(err)).slice(0, 240) };
  }
}

export async function GET() {
  const network = solanaNetwork();
  const urls = rpcUrls();

  const [database, rpc, sdk, pumpUpload] = await Promise.all([
    timed(() => db.$queryRaw`SELECT 1`).then((r) => (r.ok ? { ok: true, ms: r.ms } : r)),
    Promise.all(
      urls.map(async (url) => {
        const conn = new Connection(url, { commitment: "confirmed", disableRetryOnRateLimit: true });
        const r = await timed(() => conn.getLatestBlockhash("confirmed"));
        return r.ok
          ? { endpoint: rpcLabel(url), ok: true, ms: r.ms }
          : { endpoint: rpcLabel(url), ok: false, ms: r.ms, problem: classifyRpcError(new Error(r.error)).kind, error: r.error };
      }),
    ),
    timed(async () => {
      const k = Keypair.generate().publicKey;
      await pumpSdk().PUMP_SDK.createV2Instruction({ mint: k, name: "Health", symbol: "HLTH", uri: "https://example.com", creator: k, user: k, mayhemMode: false });
      return true;
    }).then((r) => (r.ok ? { ok: true, ms: r.ms } : r)),
    timed(async () => {
      const res = await fetch(ENDPOINTS.pumpIpfs, { method: "OPTIONS", signal: AbortSignal.timeout(10_000) });
      return res.status;
    }).then((r) => (r.ok ? { ok: r.value < 500, ms: r.ms, status: r.value } : r)),
  ]);

  const rpcOk = rpc.some((r) => r.ok);
  const hints: string[] = [];
  if (!process.env.SOLANA_RPC_URL?.trim()) {
    hints.push("SOLANA_RPC_URL is not set, so the public Solana endpoint is used. It is rate-limited and often refuses requests from shared hosting like Vercel. Set SOLANA_RPC_URL to a dedicated endpoint (e.g. Helius).");
  }
  for (const r of rpc) {
    if (!r.ok && r.problem === "rate-limited") hints.push(`${r.endpoint} is rate-limiting this server.`);
    if (!r.ok && (r.problem === "unauthorized" || r.problem === "forbidden")) hints.push(`${r.endpoint} refused the request: check the API key in SOLANA_RPC_URL.`);
  }
  if (!sdk.ok) hints.push("The pump.fun SDK failed to load on the server; launches can't be built.");

  const ok = database.ok && rpcOk && sdk.ok;
  return Response.json(
    { ok, network, database, rpc, pumpSdk: sdk, pumpUpload, hints },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
