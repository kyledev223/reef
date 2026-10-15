/**
 * Seabed under the sunken city (a soft painted backdrop, low-res and scaled up), plus the shared
 * light textures: caustics, soft dots for glows/particles/shadows, and the vignette.
 */
import { Sprite, Texture } from "pixi.js";
import { WORLD_SIZE, ZONES, type ZoneId } from "@/lib/zones";
import { mulberry32 } from "./color";

const PAINT_SCALE = 0.25;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, inner: string, outer: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, inner);
  g.addColorStop(0.65, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Seabed tint per district. */
const GROUND: Record<ZoneId, string> = {
  plaza: "rgba(250,238,205,0.35)",
  kelp: "rgba(60,160,120,0.45)",
  market: "rgba(255,190,170,0.35)",
  racetrack: "rgba(150,240,236,0.35)",
  ship: "rgba(30,100,130,0.4)",
  trench: "rgba(20,60,110,0.45)",
};

/** The painted seabed, rendered small and stretched to the world for a soft, brushy look. */
export function paintBackdrop(): Sprite {
  const W = Math.round(WORLD_SIZE.w * PAINT_SCALE), H = Math.round(WORLD_SIZE.h * PAINT_SCALE);
  const { c, ctx } = canvas(W, H);
  const lin = ctx.createLinearGradient(0, 0, W * 0.3, H);
  lin.addColorStop(0, "#7fe6d6");
  lin.addColorStop(0.5, "#3cc0c2");
  lin.addColorStop(1, "#167f9c");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, W, H);

  const rnd = mulberry32(4242);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 60;
    blob(ctx, x, y, r, r * (0.5 + rnd() * 0.6), rnd() > 0.5 ? "rgba(220,255,245,0.06)" : "rgba(0,60,90,0.06)", "rgba(0,0,0,0)");
  }
  // District tints, soft-edged
  for (const z of ZONES) {
    const { x, y, w, h } = z.rect;
    blob(ctx, (x + w / 2) * PAINT_SCALE, (y + h / 2) * PAINT_SCALE, (w / 2) * PAINT_SCALE * 1.05, (h / 2) * PAINT_SCALE * 1.05, GROUND[z.id], "rgba(0,0,0,0)");
  }
  // The abyss beyond the Trench Gate, at the bottom edge of the city
  blob(ctx, 2100 * PAINT_SCALE, 3000 * PAINT_SCALE, 760 * PAINT_SCALE, 420 * PAINT_SCALE, "rgba(2,14,40,0.95)", "rgba(2,14,40,0)");
  // Darker open sea around the old city walls
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.62);
  edge.addColorStop(0, "rgba(0,40,70,0)");
  edge.addColorStop(1, "rgba(0,40,70,0.35)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  const s = new Sprite(Texture.from(c));
  s.width = WORLD_SIZE.w;
  s.height = WORLD_SIZE.h;
  return s;
}

/** Tileable caustic light pattern (Worley F2−F1 edges). */
export function causticTexture(size = 256, seed = 9): Texture {
  const { c, ctx } = canvas(size, size);
  const rnd = mulberry32(seed);
  const pts = Array.from({ length: 22 }, () => [rnd(), rnd()]);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let d1 = 9, d2 = 9;
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px), dy = Math.abs(v - py);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const i = Math.pow(Math.max(0, 1 - e * 16), 3);
      const o = (y * size + x) * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(i * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(c);
}

/** Soft round dot used for particles, glows and shadows. */
export function softDotTexture(size = 64): Texture {
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Screen-space vignette for depth. */
export function vignetteTexture(): Texture {
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
  g.addColorStop(0, "rgba(0,30,50,0)");
  g.addColorStop(1, "rgba(0,30,50,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return Texture.from(c);
}
