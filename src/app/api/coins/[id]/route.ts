import { getCoinDetail } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = await getCoinDetail(id);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail, { headers: { "cache-control": "public, max-age=30" } });
}
