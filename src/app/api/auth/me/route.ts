import { sessionWallet, signOut } from "@/lib/auth/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ wallet: await sessionWallet() });
}

export async function DELETE() {
  await signOut();
  return Response.json({ wallet: null });
}
