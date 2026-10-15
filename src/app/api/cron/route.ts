import { runTick } from "../../../../worker/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the data jobs that are due (Vercel Cron calls this; any external scheduler can too).
 * Protected by CRON_SECRET: Vercel Cron sends it as "Authorization: Bearer <secret>"; other
 * schedulers can send the same header or ?secret=<secret>.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const auth = req.headers.get("authorization");
  const given = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("secret");
  if (given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await runTick({ budgetMs: 45_000 }));
}
