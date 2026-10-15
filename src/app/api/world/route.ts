import { after } from "next/server";
import { getWorld } from "@/lib/world";
import { runTick } from "../../../../worker/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** On serverless hosts (no long-running worker), page traffic keeps the data fresh. */
const inlineTicks = process.env.VERCEL === "1" || process.env.INLINE_TICKS === "1";

export async function GET() {
  const world = await getWorld();
  if (inlineTicks) {
    // Runs after the response is sent, so it never slows the page down.
    after(() => runTick({ budgetMs: 40_000, minGapMs: 60_000 }).catch((err) => console.error("[tick]", err)));
  }
  return Response.json(world, { headers: { "cache-control": "public, max-age=15" } });
}
