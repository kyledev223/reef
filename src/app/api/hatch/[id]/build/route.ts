import { HATCH } from "@/config/balance";
import { sessionWallet } from "@/lib/auth/wallet";
import { db } from "@/lib/db";
import { buildLaunchTx } from "@/lib/hatch/build";

/** Step 2: build (or rebuild with a fresh blockhash) the create transaction for the wallet to sign. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const wallet = await sessionWallet();
  const launch = await db.launch.findUnique({ where: { id } });
  if (!launch || !wallet || launch.wallet !== wallet) return Response.json({ error: "Launch not found." }, { status: 404 });
  if (launch.status !== "PREPARED") return Response.json({ error: "This launch was already sent." }, { status: 409 });
  if (Date.now() - launch.createdAt.getTime() > HATCH.preparedTtlMs) {
    return Response.json({ error: "This hatching expired. Please start again." }, { status: 410 });
  }
  try {
    const built = await buildLaunchTx(launch);
    await db.launch.update({ where: { id }, data: { messageB64: built.message } });
    return Response.json({ tx: built.tx, estimatedCostSol: built.estimatedCostSol, simulationError: built.simulationError, network: launch.network });
  } catch (err) {
    console.error("build failed", err);
    return Response.json({ error: "Couldn't reach Solana to build the transaction. Please try again." }, { status: 502 });
  }
}
