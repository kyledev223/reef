import { HATCH } from "@/config/balance";
import { db } from "@/lib/db";
import { finalizeLaunch } from "@/lib/hatch/finalize";
import { log } from "../lib";

/** Finish launches whose transaction was sent but whose page was closed; expire abandoned ones. */
export async function runHatchFinalize() {
  const pending = await db.launch.findMany({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "asc" }, take: 20 });
  let hatched = 0;
  for (const l of pending) {
    try {
      const after = await finalizeLaunch(l);
      if (after.status === "CONFIRMED") hatched++;
    } catch (err) {
      log("hatch", `${l.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const expired = await db.launch.updateMany({
    where: { status: "PREPARED", createdAt: { lt: new Date(Date.now() - HATCH.preparedTtlMs) } },
    data: { status: "FAILED", error: "Not signed in time. Nothing was created or charged." },
  });
  if (pending.length || expired.count) log("hatch", `${pending.length} in flight, ${hatched} hatched, ${expired.count} expired`);
}
