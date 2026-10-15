import { hatchConfig } from "@/lib/solana/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(hatchConfig());
}
