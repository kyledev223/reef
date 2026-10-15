import { TRACKING } from "@/config/balance";
import { db } from "@/lib/db";
import { log } from "../lib";

/** One snapshot row per creature with its latest real values. */
export async function runSnapshots() {
  const coins = await db.coin.findMany({
    where: { status: "ACTIVE", OR: [{ marketCapSol: { not: null } }, { marketCapUsd: { not: null } }] },
    select: { id: true, priceUsd: true, marketCapUsd: true, marketCapSol: true, liquidityUsd: true, dexVolume24hUsd: true },
  });
  if (coins.length === 0) return;
  await db.coinSnapshot.createMany({ data: coins.map(({ id, ...v }) => ({ coinId: id, ...v })) });
  log("snapshots", `${coins.length} rows`);
}

export async function runHousekeeping() {
  // Downsample: per-run rows older than 48h -> one per hour; hourly rows older than 30d -> one per day.
  const hourly = await db.$executeRaw`
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY "coinId", date_trunc('hour', at) ORDER BY at) AS rn
      FROM "CoinSnapshot"
      WHERE res = 'M' AND at < now() - make_interval(hours => ${TRACKING.snapshotFullResHours}::int)
    ), del AS (
      DELETE FROM "CoinSnapshot" s USING ranked r WHERE s.id = r.id AND r.rn > 1
    )
    UPDATE "CoinSnapshot" s SET res = 'H' FROM ranked r WHERE s.id = r.id AND r.rn = 1`;
  const daily = await db.$executeRaw`
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY "coinId", date_trunc('day', at) ORDER BY at) AS rn
      FROM "CoinSnapshot"
      WHERE res = 'H' AND at < now() - make_interval(days => ${TRACKING.snapshotHourlyDays}::int)
    ), del AS (
      DELETE FROM "CoinSnapshot" s USING ranked r WHERE s.id = r.id AND r.rn > 1
    )
    UPDATE "CoinSnapshot" s SET res = 'D' FROM ranked r WHERE s.id = r.id AND r.rn = 1`;

  const now = new Date();
  const [events, nonces, sessions] = await Promise.all([
    db.worldEvent.deleteMany({ where: { at: { lt: new Date(now.getTime() - 30 * 86_400_000) } } }),
    db.walletNonce.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.walletSession.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  log("housekeeping", `downsampled ${hourly}+${daily} snapshots; pruned ${events.count} events, ${nonces.count} nonces, ${sessions.count} sessions`);
}
