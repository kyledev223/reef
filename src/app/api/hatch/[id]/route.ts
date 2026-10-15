import { sessionWallet } from "@/lib/auth/wallet";
import { db } from "@/lib/db";
import { finalizeLaunch } from "@/lib/hatch/finalize";

export const dynamic = "force-dynamic";

/** Launch status; while the transaction is in flight, each poll checks Solana. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const wallet = await sessionWallet();
  let launch = await db.launch.findUnique({ where: { id } });
  if (!launch || !wallet || launch.wallet !== wallet) return Response.json({ error: "Launch not found." }, { status: 404 });
  if (launch.status === "SUBMITTED") {
    try {
      launch = await finalizeLaunch(launch);
    } catch (err) {
      console.error("finalize failed", err);
    }
  }
  return Response.json({
    status: launch.status,
    error: launch.error,
    signature: launch.signature,
    coinId: launch.coinId,
    mint: launch.mint,
    network: launch.network,
  });
}
