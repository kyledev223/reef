import { db } from "@/lib/db";

/** A creature's round emblem (made from its token image at hatch time). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const coin = await db.coin.findUnique({ where: { id }, select: { logoWebp: true, status: true } });
  if (!coin?.logoWebp || coin.status === "HIDDEN") return new Response("not found", { status: 404 });
  const etag = `"${id}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  return new Response(new Uint8Array(coin.logoWebp), {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=86400", etag },
  });
}
