/**
 * Builds the pump.fun create transaction for a prepared launch. Server only.
 * The player's wallet pays and signs; the mint key is generated and signed in the browser.
 * No buy instruction: the site creates the token and nothing else.
 *
 * Uses a legacy (non-versioned) transaction: every Solana wallet supports it, and this
 * transaction needs no address lookup tables.
 */
import {
  ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction, type TransactionInstruction,
} from "@solana/web3.js";
import { HATCH } from "@/config/balance";
import { withRpc } from "@/lib/solana/server";
import { pumpSdk } from "./pumpSdk";
import type { Launch } from "@/generated/prisma/client";

/** The pump.fun SDK failed to load or build the instruction (a server problem, not Solana). */
export class TokenBuilderError extends Error {}

/** The one pump.fun instruction a launch may contain. Deterministic for a given launch. */
export async function createInstructionFor(launch: Launch): Promise<TransactionInstruction> {
  const wallet = new PublicKey(launch.wallet);
  let sdk: ReturnType<typeof pumpSdk>;
  try {
    sdk = pumpSdk();
  } catch (err) {
    throw new TokenBuilderError(`pump.fun SDK failed to load: ${err instanceof Error ? err.message : err}`);
  }
  return sdk.PUMP_SDK.createV2Instruction({
    mint: new PublicKey(launch.mint),
    name: launch.name,
    symbol: launch.ticker,
    uri: launch.metadataUri,
    creator: wallet,
    user: wallet,
    mayhemMode: false,
  });
}

export interface BuiltLaunchTx {
  /** Unsigned transaction, base64. */
  tx: string;
  /** Message bytes, base64 (kept for reference). */
  message: string;
  /** Estimated SOL the wallet spends (network fee + rent for the new accounts), or null if unknown. */
  estimatedCostSol: number | null;
  /** Simulation error in words, if the transaction would fail (e.g. not enough SOL). */
  simulationError: string | null;
}

export async function buildLaunchTx(launch: Launch): Promise<BuiltLaunchTx> {
  const wallet = new PublicKey(launch.wallet);
  const create = await createInstructionFor(launch);
  const { blockhash, lastValidBlockHeight } = await withRpc((c) => c.getLatestBlockhash("confirmed"));
  const tx = new Transaction({ feePayer: wallet, blockhash, lastValidBlockHeight }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: HATCH.computeUnitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: HATCH.computeUnitPriceMicroLamports }),
    create,
  );
  const message = tx.compileMessage();

  // Simulate (without signatures) to catch failures early and estimate what the wallet pays.
  let estimatedCostSol: number | null = null;
  let simulationError: string | null = null;
  try {
    const [before, sim, fee] = await Promise.all([
      withRpc((c) => c.getBalance(wallet, "confirmed")),
      withRpc((c) => c.simulateTransaction(new VersionedTransaction(message), {
        sigVerify: false,
        replaceRecentBlockhash: false,
        accounts: { encoding: "base64", addresses: [wallet.toBase58()] },
      })),
      withRpc((c) => c.getFeeForMessage(message, "confirmed")),
    ]);
    if (sim.value.err) {
      const logs = (sim.value.logs ?? []).join("\n");
      const err = JSON.stringify(sim.value.err);
      simulationError = before === 0 || err === '"AccountNotFound"'
        ? "This wallet has no SOL on this network yet."
        : /insufficient (lamports|funds)/i.test(logs) || err.includes("InsufficientFunds")
          ? "This wallet doesn't have enough SOL to pay for creating the token."
          : `The transaction would fail: ${err}`;
    } else {
      const after = sim.value.accounts?.[0]?.lamports;
      if (after != null) estimatedCostSol = (before - after + (fee.value ?? 0)) / LAMPORTS_PER_SOL;
    }
  } catch {
    // Estimation is best-effort; the wallet still shows the exact amount before approval.
  }

  return {
    tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: message.serialize().toString("base64"),
    estimatedCostSol,
    simulationError,
  };
}

/**
 * Check a signed transaction before relaying it: paid by the launch's wallet, containing exactly
 * our pump.fun create instruction plus (optionally) compute-budget instructions, which some
 * wallets adjust, and fully, validly signed. Returns an error message, or null if it's fine.
 */
export async function checkSignedLaunchTx(launch: Launch, tx: Transaction): Promise<string | null> {
  if (!tx.feePayer?.equals(new PublicKey(launch.wallet))) return "The transaction isn't paid by your wallet.";
  const expected = await createInstructionFor(launch);
  let creates = 0;
  for (const ix of tx.instructions) {
    if (ix.programId.equals(ComputeBudgetProgram.programId)) continue;
    const same =
      ix.programId.equals(expected.programId) &&
      Buffer.compare(Buffer.from(ix.data), Buffer.from(expected.data)) === 0 &&
      ix.keys.length === expected.keys.length &&
      ix.keys.every((k, i) => k.pubkey.equals(expected.keys[i].pubkey));
    if (!same) return "The transaction contains something other than creating your token.";
    creates++;
  }
  if (creates !== 1) return "The transaction doesn't create your token.";
  if (!tx.verifySignatures(true)) return "The transaction is missing a valid signature.";
  return null;
}
