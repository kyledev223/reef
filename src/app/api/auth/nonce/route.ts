import { createSignInMessage, isWalletAddress } from "@/lib/auth/wallet";

export async function POST(req: Request) {
  const { wallet } = (await req.json().catch(() => ({}))) as { wallet?: unknown };
  if (!isWalletAddress(wallet)) return Response.json({ error: "Not a Solana wallet address." }, { status: 400 });
  return Response.json(await createSignInMessage(wallet));
}
