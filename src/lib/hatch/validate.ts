import { z } from "zod";
import { HATCH } from "@/config/balance";
import { isDenied } from "@/lib/moderation";

const httpsUrl = (hosts?: string[]) =>
  z
    .string()
    .trim()
    .max(200)
    .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
    .refine((s) => {
      if (!s) return true;
      try {
        const u = new URL(s);
        return u.protocol === "https:" && (!hosts || hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)));
      } catch {
        return false;
      }
    }, hosts ? `Must be a link on ${hosts.join(" or ")}` : "Must be an https link")
    .transform((s) => s || null);

export const HatchFields = z.object({
  name: z.string().trim().min(1, "Give your creature a name").max(HATCH.nameMax, `At most ${HATCH.nameMax} characters`),
  ticker: z
    .string()
    .trim()
    .transform((s) => s.replace(/^\$+/, "").toUpperCase())
    .pipe(
      z
        .string()
        .min(1, "Pick a ticker")
        .max(HATCH.tickerMax, `At most ${HATCH.tickerMax} characters`)
        .regex(/^[A-Z0-9]+$/, "Letters and digits only"),
    ),
  description: z.string().trim().min(1, "Write a short origin story").max(HATCH.descriptionMax, `At most ${HATCH.descriptionMax} characters`),
  twitter: httpsUrl(["x.com", "twitter.com"]).optional().default(""),
  telegram: httpsUrl(["t.me", "telegram.me"]).optional().default(""),
  website: httpsUrl().optional().default(""),
  mint: z.string().trim().min(32).max(44),
});
export type HatchFields = z.infer<typeof HatchFields>;

/** Field errors as { field: message }, or null if the fields pass. Includes moderation. */
export function checkFields(raw: Record<string, unknown>): { ok: true; fields: HatchFields } | { ok: false; errors: Record<string, string> } {
  const parsed = HatchFields.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, errors };
  }
  const f = parsed.data;
  if (isDenied([], f.name, f.ticker)) return { ok: false, errors: { name: "That name or ticker isn't allowed on the reef." } };
  if (isDenied([], f.description, "")) return { ok: false, errors: { description: "Please keep the story friendly." } };
  return { ok: true, fields: f };
}
