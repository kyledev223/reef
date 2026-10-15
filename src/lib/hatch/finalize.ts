/**
 * Turns a sent launch transaction into a creature, but only once Solana confirms it and the
 * token's pump.fun bonding curve exists with the launching wallet as creator.
 * Safe to call repeatedly and concurrently (from the status API and the worker).
 */
import { PublicKey } from "@solana/web3.js";
import { HATCH } from "@/config/balance";
import { db } from "@/lib/db";
import { emblemAndPalette } from "@/lib/images";
import { speciesFor } from "@/lib/market/species";
import { bondingCurvePda, curveMarket, decodeBondingCurve, isPumpProgram } from "@/lib/solana/curve";
import { withRpc } from "@/lib/solana/server";
import { solUsdNow } from "@/lib/solUsd";
import { PUMP_TOTAL_SUPPLY } from "@/config/data";
import type { Launch } from "@/generated/prisma/client";

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

async function fail(launch: Launch, error: string) {
  await db.launch.updateMany({ where: { id: launch.id, status: "SUBMITTED" }, data: { status: "FAILED", error } });
}

export async function finalizeLaunch(launch: Launch): Promise<Launch> {
  if (launch.status !== "SUBMITTED" || !launch.signature) return launch;
  const { value } = await withRpc((c) => c.getSignatureStatuses([launch.signature!], { searchTransactionHistory: true }));
  const st = value[0];

  if (st?.err) {
    await fail(launch, `The transaction failed on-chain: ${JSON.stringify(st.err)}. Only the network fee was charged.`);
  } else if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
    await hatch(launch);
  } else if (launch.submittedAt && Date.now() - launch.submittedAt.getTime() > HATCH.confirmTimeoutMs) {
    await fail(launch, "The transaction never landed (it expired). Nothing was charged. You can try again.");
  }
  return (await db.launch.findUniqueOrThrow({ where: { id: launch.id } }));
}

async function hatch(launch: Launch) {
  const curveAcc = await withRpc((c) => c.getAccountInfo(bondingCurvePda(launch.mint), "confirmed"));
  const curve = curveAcc && isPumpProgram(curveAcc.owner) ? decodeBondingCurve(curveAcc.data) : null;
  if (!curve) {
    // Confirmed but no curve yet visible on this RPC node; try again on the next check.
    return;
  }
  if (curve.creator !== launch.wallet) {
    await fail(launch, "The token on-chain doesn't name this wallet as its creator.");
    return;
  }
  new PublicKey(launch.mint); // sanity: valid key

  const key = `${launch.network}:${launch.mint}`;
  const { webp, palette } = await emblemAndPalette(Buffer.from(launch.imagePng));
  const market = curveMarket(curve);
  const solUsd = market ? await solUsdNow() : null;
  const mcapUsd = market && solUsd ? market.marketCapSol * solUsd : null;

  try {
    await db.$transaction(async (tx) => {
      // Claim the launch first so two finalizers can't both hatch it.
      const claimed = await tx.launch.updateMany({ where: { id: launch.id, status: "SUBMITTED" }, data: { status: "CONFIRMED", error: null } });
      if (claimed.count === 0) return;
      const coin = await tx.coin.create({
        data: {
          key,
          speciesSeed: key,
          network: launch.network,
          address: launch.mint,
          creatorWallet: launch.wallet,
          launchSignature: launch.signature!,
          name: launch.name,
          ticker: launch.ticker,
          description: launch.description,
          twitter: launch.twitter,
          telegram: launch.telegram,
          website: launch.website,
          metadataUri: launch.metadataUri,
          logoWebp: new Uint8Array(webp),
          palette,
          marketCapSol: market?.marketCapSol ?? null,
          marketCapUsd: mcapUsd,
          priceUsd: mcapUsd != null ? mcapUsd / PUMP_TOTAL_SUPPLY : null,
          marketUpdatedAt: mcapUsd != null ? new Date() : null,
          curveComplete: curve.complete,
          curveUpdatedAt: new Date(),
        },
      });
      await tx.launch.update({ where: { id: launch.id }, data: { coinId: coin.id } });
      const sp = speciesFor(key);
      await tx.worldEvent.create({
        data: {
          kind: "HATCH",
          coinId: coin.id,
          message: `🥚 $${coin.ticker} hatched! A new ${sp.variant} joined the reef (keeper ${short(launch.wallet)})`,
        },
      });
    });
  } catch (err) {
    // Unique (network, mint): another finalizer won the race. Anything else is real.
    if (!(err instanceof Error && /Unique constraint/i.test(err.message))) throw err;
  }
}
