import { POLLING } from "@/config/balance";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/sources/http";
import type { WorldEventKind } from "@/generated/prisma/client";

export const log = (scope: string, ...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), `[${scope}]`, ...args);

export const SOURCES = {
  curves: "solana:curves",
  solPrice: "coingecko:sol-price",
  dexPairs: "dexscreener:pairs",
} as const;

/**
 * Run fn as a call to an upstream source, recording success/failure in SourceStatus.
 * Returns null (without calling) while the source is backing off.
 */
export async function withSource<T>(source: string, fn: () => Promise<T>): Promise<T | null> {
  const status = await db.sourceStatus.findUnique({ where: { source } });
  if (status?.nextAllowedAt && status.nextAllowedAt > new Date()) {
    log(source, `backing off until ${status.nextAllowedAt.toISOString().slice(11, 19)}`);
    return null;
  }
  const now = new Date();
  try {
    const result = await fn();
    await db.sourceStatus.upsert({
      where: { source },
      create: { source, lastAttemptAt: now, lastSuccessAt: new Date(), consecutiveFailures: 0 },
      update: { lastAttemptAt: now, lastSuccessAt: new Date(), consecutiveFailures: 0, lastError: null, nextAllowedAt: null },
    });
    return result;
  } catch (err) {
    const failures = (status?.consecutiveFailures ?? 0) + 1;
    const retryAfter = err instanceof HttpError ? err.retryAfterMs : undefined;
    const backoff = Math.min(POLLING.backoffMaxMs, retryAfter ?? POLLING.backoffBaseMs * 2 ** (failures - 1));
    const message = err instanceof Error ? err.message : String(err);
    log(source, `failed (${failures}x), retry in ${Math.round(backoff / 1000)}s:`, message);
    await db.sourceStatus.upsert({
      where: { source },
      create: { source, lastAttemptAt: now, lastError: message, consecutiveFailures: failures, nextAllowedAt: new Date(Date.now() + backoff) },
      update: { lastAttemptAt: now, lastError: message, consecutiveFailures: failures, nextAllowedAt: new Date(Date.now() + backoff) },
    });
    return null;
  }
}

export async function lastSuccess(source: string): Promise<Date | null> {
  const s = await db.sourceStatus.findUnique({ where: { source } });
  return s?.lastSuccessAt ?? null;
}

export async function addEvent(kind: WorldEventKind, message: string, coinId?: string, data?: object) {
  await db.worldEvent.create({ data: { kind, message, coinId, data: data ?? undefined } });
}

export function fmtPct(p: number) {
  const r = Math.abs(p) >= 100 ? Math.round(p) : Math.round(p * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("en-US")}%`;
}
