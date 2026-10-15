import { getFeed } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const after = new URL(req.url).searchParams.get("after");
  const afterId = after && /^\d{1,19}$/.test(after) ? BigInt(after) : undefined;
  return Response.json({ items: await getFeed(afterId) }, { headers: { "cache-control": "no-store" } });
}
