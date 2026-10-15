/**
 * Up to 3 dominant, distinct colours from raw RGBA pixels, favouring saturated mid-tones
 * over flat backgrounds. Pure, so the server (sharp) and the browser (canvas) agree.
 */
export function paletteFromRgba(data: ArrayLike<number>, channels = 4): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += channels) {
    if (data[i + 3] < 160) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(k, e);
  }
  const scored = [...buckets.values()].map((e) => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const extreme = l < 0.12 || l > 0.93 ? 0.25 : 1;
    return { r, g, b, score: e.n * (0.3 + s) * extreme };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: typeof scored = [];
  for (const c of scored) {
    if (picked.every((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) > 70)) picked.push(c);
    if (picked.length === 3) break;
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return picked.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
}
