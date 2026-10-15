import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const l = await db.launch.findUnique({ where: { id }, select: { imagePng: true } });
  if (!l) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(l.imagePng), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, immutable", "access-control-allow-origin": "*" },
  });
}
