import { isWalletAddress, setSessionCookie, verifySignIn } from "@/lib/auth/wallet";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { wallet?: unknown; nonce?: unknown; signature?: unknown };
  if (!isWalletAddress(body.wallet) || typeof body.nonce !== "string" || typeof body.signature !== "string") {
    return Response.json({ error: "Malformed sign-in." }, { status: 400 });
  }
  const token = await verifySignIn(body.wallet, body.nonce, body.signature);
  if (!token) return Response.json({ error: "The signature didn't match, or the sign-in request expired. Try again." }, { status: 401 });
  await setSessionCookie(token);
  return Response.json({ wallet: body.wallet });
}
