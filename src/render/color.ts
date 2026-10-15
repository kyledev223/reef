/** Small colour helpers for procedural creature art. Colours are 0xRRGGBB numbers. */

export function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function toRgb(c: number) {
  return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
}

function fromRgb(r: number, g: number, b: number) {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (k(r) << 16) | (k(g) << 8) | k(b);
}

export function rgbToHsl(c: number): [number, number, number] {
  const { r, g, b } = toRgb(c);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function hsl(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return fromRgb((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function mix(a: number, b: number, t: number): number {
  const A = toRgb(a), B = toRgb(b);
  return fromRgb(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x001018, t);

/** Keep a colour readable on teal water: clamp lightness and lift dull colours a bit. */
function reefSafe(c: number): number {
  const [h, s, l] = rgbToHsl(c);
  return hsl(h, Math.max(s, 0.35), Math.min(0.78, Math.max(0.36, l)));
}

export interface CreatureColors {
  body: number;
  accent: number;
  pattern: number;
  outline: number;
  highlight: number;
}

/** Body/accent/pattern from the logo palette, falling back to the coin's hash hue. */
export function creatureColors(palette: string[], hue: number): CreatureColors {
  const p = palette.map(hexToNum).map(reefSafe);
  const body = p[0] ?? hsl(hue, 0.65, 0.58);
  const [bh] = rgbToHsl(body);
  const accent = p[1] ?? hsl(bh + 35, 0.7, 0.62);
  const pattern = p[2] ?? (p[1] != null ? lighten(p[1], 0.35) : hsl(bh - 30, 0.6, 0.45));
  return { body, accent, pattern, outline: darken(body, 0.55), highlight: lighten(body, 0.45) };
}

/** Deterministic PRNG for pattern details. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
