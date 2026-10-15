import { db } from "@/lib/db";

/** Self-hosted token metadata (used when no IPFS pinning is configured). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const l = await db.launch.findUnique({
    where: { id },
    select: { name: true, ticker: true, description: true, imageUrl: true, twitter: true, telegram: true, website: true, metadataHost: true },
  });
  if (!l || l.metadataHost !== "self") return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(
    {
      name: l.name,
      symbol: l.ticker,
      description: l.description,
      image: l.imageUrl,
      showName: true,
      ...(l.twitter ? { twitter: l.twitter } : {}),
      ...(l.telegram ? { telegram: l.telegram } : {}),
      ...(l.website ? { website: l.website } : {}),
    },
    { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } },
  );
}
