export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (v === 0) return "$0";
  // Small prices: keep 4 significant digits.
  return `$${v.toPrecision(4).replace(/0+$/, "")}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const r = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(digits);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(r).replace("-", "")}%`;
}

export function fmtMod(v: number): string {
  const p = Math.round(v * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)}%`;
}

export function fmtAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d >= 365) return `${(d / 365).toFixed(1)} years`;
  if (d >= 2) return `${Math.floor(d)} days`;
  const h = ms / 3_600_000;
  if (h >= 1) return `${Math.floor(h)} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
