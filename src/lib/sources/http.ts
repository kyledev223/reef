import type { z } from "zod";
import { POLLING } from "@/config/balance";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public retryAfterMs?: number,
  ) {
    super(`HTTP ${status} for ${url.replace(/x_cg_demo_api_key=[^&]+/, "x_cg_demo_api_key=***")}`);
  }
}

export async function getJson<S extends z.ZodType>(
  url: string,
  schema: S,
  headers: Record<string, string> = {},
): Promise<z.infer<S>> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "reefworld-worker/0.1", ...headers },
    signal: AbortSignal.timeout(POLLING.requestTimeoutMs),
  });
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"));
    throw new HttpError(res.status, url, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
  }
  const body = await res.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${new URL(url).pathname}: ${parsed.error.message.slice(0, 400)}`);
  }
  return parsed.data;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
