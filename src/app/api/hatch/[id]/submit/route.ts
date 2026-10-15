/**
 * Step 3: relay the signed transaction to Solana. Only a transaction that creates exactly this
 * launch's token (plus compute-budget settings), paid and fully signed by the player's wallet,
 * is relayed, so the relay can't be used to send anything else.
 */
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { sessionWallet } from "@/lib/auth/wallet";
import { db } from "@/lib/db";
import { checkSignedLaunchTx } from "@/lib/hatch/build";
import { solanaConnection } from "@/lib/solana/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const wallet = await sessionWallet();
  const launch = await db.launch.findUnique({ where: { id } });
  if (!launch || !wallet || launch.wallet !== wallet) return Response.json({ error: "Launch not found." }, { status: 404 });
  if (launch.status !== "PREPARED" || !launch.messageB64) return Response.json({ error: "This launch can't be sent." }, { status: 409 });

  const { tx: txB64 } = (await req.json().catch(() => ({}))) as { tx?: unknown };
  if (typeof txB64 !== "string") return Response.json({ error: "Missing transaction." }, { status: 400 });
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(txB64, "base64"));
  } catch {
    return Response.json({ error: "Malformed transaction." }, { status: 400 });
  }
  const problem = await checkSignedLaunchTx(launch, tx);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  try {
    const signature = await solanaConnection().sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
    await db.launch.update({ where: { id }, data: { status: "SUBMITTED", signature, submittedAt: new Date() } });
    return Response.json({ signature });
  } catch (err) {
    // SendTransactionError keeps the useful part ("no record of a prior credit", logs...) in extra fields.
    const e = err as { message?: string; transactionMessage?: string; transactionError?: { message?: string }; transactionLogs?: string[] };
    const msg = [e.message, e.transactionMessage, e.transactionError?.message, ...(e.transactionLogs ?? [])].filter(Boolean).join(" | ") || String(err);
    console.error("send failed", msg.slice(0, 500));
    const expired = /blockhash not found|block height exceeded/i.test(msg);
    // An empty or nearly empty wallet often fails with no detail at all; check the balance directly.
    const lowBalance = await solanaConnection()
      .getBalance(new PublicKey(wallet), "confirmed")
      .then((lamports) => lamports < 0.02 * LAMPORTS_PER_SOL)
      .catch(() => false);
    return Response.json(
      {
        error: expired
          ? "The approval took too long and the transaction expired. Nothing was charged; approve again."
          : lowBalance || /insufficient|0x1\b|no record of a prior credit|AccountNotFound/i.test(msg)
            ? "This wallet doesn't have enough SOL to create the token."
            : "Solana rejected the transaction. Nothing was charged.",
        retry: expired,
      },
      { status: 400 },
    );
  }
}
