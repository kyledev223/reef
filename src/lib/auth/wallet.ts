/**
 * Sign in with a Solana wallet: the server issues a one-time message, the wallet signs it
 * (a plain message, not a transaction, so it costs nothing), and we verify the ed25519
 * signature. The session token lives in an httpOnly cookie; only its hash is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import { cookies } from "next/headers";
import { APP } from "@/config/app";
import { HATCH } from "@/config/balance";
import { db } from "@/lib/db";
import { siteUrl, solanaNetwork } from "@/lib/solana/server";

export const SESSION_COOKIE = "reef_wallet";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function isWalletAddress(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes());
  } catch {
    return false;
  }
}

export async function createSignInMessage(wallet: string) {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = [
    `${APP.name} wants you to sign in with your Solana account:`,
    wallet,
    "",
    "Sign in to hatch creatures. Signing this message is free: it is not a transaction and moves no funds.",
    "",
    `URI: ${siteUrl()}`,
    `Network: ${solanaNetwork()}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
  await db.walletNonce.create({
    data: { nonce, wallet, message, expiresAt: new Date(Date.now() + HATCH.nonceTtlMs) },
  });
  return { nonce, message };
}

export async function verifySignIn(wallet: string, nonce: string, signatureB64: string): Promise<string | null> {
  const row = await db.walletNonce.findUnique({ where: { nonce } });
  if (!row || row.wallet !== wallet || row.usedAt || row.expiresAt < new Date()) return null;
  let ok = false;
  try {
    const sig = Buffer.from(signatureB64, "base64");
    ok = sig.length === 64 && ed25519.verify(sig, new TextEncoder().encode(row.message), new PublicKey(wallet).toBytes());
  } catch {
    ok = false;
  }
  // One attempt per nonce, successful or not.
  await db.walletNonce.update({ where: { nonce }, data: { usedAt: new Date() } });
  if (!ok) return null;
  const token = randomBytes(32).toString("base64url");
  await db.walletSession.create({
    data: { tokenHash: sha256(token), wallet, expiresAt: new Date(Date.now() + HATCH.sessionTtlMs) },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl().startsWith("https://"),
    path: "/",
    maxAge: Math.floor(HATCH.sessionTtlMs / 1000),
  });
}

/** The signed-in wallet for this request, or null. */
export async function sessionWallet(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.walletSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.wallet;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.walletSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}
