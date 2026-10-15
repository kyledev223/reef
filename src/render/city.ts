/**
 * The sunken city, drawn from straight above: winding sand paths, buildings that fill their
 * blocks with lit roofs (light from the top-left, shadows to the bottom-right), yards, and
 * kelp, coral and rocks in every gap. Buildings are interactive; everything else is decoration.
 */
import { BitmapText, Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent, type Texture } from "pixi.js";
import { BUILDINGS, PLAZA, ROADS, distanceToPaths, type Building, type Rect } from "@/lib/city";
import { WORLD_SIZE, ZONES } from "@/lib/zones";
import { darken, lighten, mix, mulberry32 } from "./color";

const SAND = 0xe9d6a8;
const SAND_EDGE = 0xc9b07f;
const SAND_LIGHT = 0xf4e6c2;
const MARBLE = 0xf1ebdf;
const MARBLE_SHADE = 0xcfc4ae;
/** Weathered, realistic roof materials. */
const ROOFS = [0xc0704f, 0x5f7f99, 0x5fa898, 0xd2ae7c, 0xd98676, 0x4f9fae, 0x9583bf, 0xb35d4a];
const GLOW = 0x9ff6ff;
const SHADOW = 0x04303e;

export interface City {
  root: Container;
  setSelected(id: string | null): void;
  animate(t: number, zoom: number): void;
  centerOf(id: string): { x: number; y: number } | null;
}

interface Animated {
  sway: { c: Container; phase: number; amp: number }[];
  glows: { s: Sprite; phase: number; base: number; amp: number }[];
  chevrons: { g: Graphics; t: number; cx: number; cy: number; rx: number; ry: number }[];
  bubbles: { g: Graphics; x: number; y: number; phase: number; rise: number }[];
}

// ---------------------------------------------------------------- drawing primitives

/** Soft shadow cast to the bottom-right. */
function shadowRect(g: Graphics, r: Rect, radius = 6, depth = 1) {
  for (const [o, a] of [[5, 0.1], [9, 0.08], [14, 0.06]] as const) {
    g.roundRect(r.x + o * depth, r.y + o * 1.3 * depth, r.w, r.h, radius + o * 0.3).fill({ color: SHADOW, alpha: a });
  }
}
function shadowCircle(g: Graphics, cx: number, cy: number, r: number, depth = 1) {
  for (const [o, a] of [[5, 0.1], [9, 0.08], [14, 0.06]] as const) g.circle(cx + o * depth, cy + o * 1.3 * depth, r).fill({ color: SHADOW, alpha: a });
}

/**
 * Hip roof from above: four slopes meeting at a ridge along the long side. Lit from the
 * top-left, so the top and left slopes are bright and the bottom and right ones dark.
 */
function hipRoof(g: Graphics, r: Rect, color: number) {
  const { x, y, w, h } = r;
  const horiz = w >= h;
  const k = (horiz ? h : w) / 2;
  const top = lighten(color, 0.22), left = lighten(color, 0.08), right = darken(color, 0.12), bottom = darken(color, 0.26);
  if (horiz) {
    const rx0 = x + k, rx1 = x + w - k, ry = y + h / 2;
    g.poly([x, y, x + w, y, rx1, ry, rx0, ry]).fill(top);
    g.poly([x, y + h, x + w, y + h, rx1, ry, rx0, ry]).fill(bottom);
    g.poly([x, y, rx0, ry, x, y + h]).fill(left);
    g.poly([x + w, y, rx1, ry, x + w, y + h]).fill(right);
    // tile courses parallel to the eaves
    for (let d = 7; d < k - 2; d += 7) {
      g.moveTo(x + d, y + d).lineTo(x + w - d, y + d).stroke({ width: 1, color: darken(color, 0.25), alpha: 0.28 });
      g.moveTo(x + d, y + h - d).lineTo(x + w - d, y + h - d).stroke({ width: 1, color: darken(color, 0.5), alpha: 0.25 });
    }
    g.moveTo(x, y).lineTo(rx0, ry).lineTo(x, y + h).stroke({ width: 1.5, color: darken(color, 0.35), alpha: 0.5 });
    g.moveTo(x + w, y).lineTo(rx1, ry).lineTo(x + w, y + h).stroke({ width: 1.5, color: darken(color, 0.35), alpha: 0.5 });
    g.moveTo(rx0, ry).lineTo(rx1, ry).stroke({ width: 3, color: lighten(color, 0.35), alpha: 0.9 });
  } else {
    const ry0 = y + k, ry1 = y + h - k, rx = x + w / 2;
    g.poly([x, y, x, y + h, rx, ry1, rx, ry0]).fill(left);
    g.poly([x + w, y, x + w, y + h, rx, ry1, rx, ry0]).fill(right);
    g.poly([x, y, rx, ry0, x + w, y]).fill(top);
    g.poly([x, y + h, rx, ry1, x + w, y + h]).fill(bottom);
    for (let d = 7; d < k - 2; d += 7) {
      g.moveTo(x + d, y + d).lineTo(x + d, y + h - d).stroke({ width: 1, color: darken(color, 0.25), alpha: 0.28 });
      g.moveTo(x + w - d, y + d).lineTo(x + w - d, y + h - d).stroke({ width: 1, color: darken(color, 0.5), alpha: 0.25 });
    }
    g.moveTo(x, y).lineTo(rx, ry0).lineTo(x + w, y).stroke({ width: 1.5, color: darken(color, 0.35), alpha: 0.5 });
    g.moveTo(x, y + h).lineTo(rx, ry1).lineTo(x + w, y + h).stroke({ width: 1.5, color: darken(color, 0.35), alpha: 0.5 });
    g.moveTo(rx, ry0).lineTo(rx, ry1).stroke({ width: 3, color: lighten(color, 0.35), alpha: 0.9 });
  }
  g.rect(x, y, w, h).stroke({ width: 2, color: darken(color, 0.55), alpha: 0.55 });
}

/** Flat roof with a parapet, gravel, and rooftop details. */
function flatRoof(g: Graphics, r: Rect, color: number, rnd: () => number, details = true) {
  const { x, y, w, h } = r;
  g.rect(x, y, w, h).fill(lighten(color, 0.1)).stroke({ width: 2, color: darken(color, 0.45), alpha: 0.6 });
  g.rect(x + 6, y + 6, w - 12, h - 12).fill(darken(color, 0.06));
  g.moveTo(x + 6, y + h - 6).lineTo(x + 6, y + 6).lineTo(x + w - 6, y + 6).stroke({ width: 2, color: darken(color, 0.3), alpha: 0.5 });
  for (let i = 0; i < (w * h) / 500; i++) g.circle(x + 8 + rnd() * (w - 16), y + 8 + rnd() * (h - 16), 0.8 + rnd()).fill({ color: rnd() > 0.5 ? lighten(color, 0.3) : darken(color, 0.3), alpha: 0.5 });
  // roofing panel seams
  for (let sx = x + 48; sx < x + w - 10; sx += 48) g.moveTo(sx, y + 7).lineTo(sx, y + h - 7).stroke({ width: 1.5, color: darken(color, 0.22), alpha: 0.35 });
  for (let sy = y + 48; sy < y + h - 10; sy += 48) g.moveTo(x + 7, sy).lineTo(x + w - 7, sy).stroke({ width: 1.5, color: darken(color, 0.22), alpha: 0.35 });
  if (!details) return;
  const n = Math.min(9, 2 + Math.floor((w * h) / 9000));
  for (let i = 0; i < n; i++) {
    const sw = 14 + rnd() * 16, sh = 10 + rnd() * 14;
    const sx = x + 12 + rnd() * Math.max(1, w - 24 - sw), sy = y + 12 + rnd() * Math.max(1, h - 24 - sh);
    if (rnd() > 0.5) {
      g.rect(sx + 2, sy + 3, sw, sh).fill({ color: SHADOW, alpha: 0.2 });
      g.rect(sx, sy, sw, sh).fill(0x7fc4d6).stroke({ width: 1.5, color: 0x4a7f8c });
      g.moveTo(sx + 2, sy + sh - 2).lineTo(sx + sw - 2, sy + 2).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
    } else {
      g.circle(sx + 3, sy + 4, 6).fill({ color: SHADOW, alpha: 0.2 });
      g.circle(sx, sy, 6).fill(0x9aa6a8).stroke({ width: 1.5, color: 0x5d6b6e });
      g.circle(sx, sy, 2.5).fill(0x3d4648);
    }
  }
}

/** Dome lit from the top-left. */
function dome(g: Graphics, cx: number, cy: number, r: number, color: number, ribs = 8) {
  shadowCircle(g, cx, cy, r, r / 60);
  g.circle(cx, cy, r).fill(darken(color, 0.25));
  for (let i = 0; i < 6; i++) {
    const k = 1 - i * 0.15;
    g.circle(cx - r * (1 - k) * 0.35, cy - r * (1 - k) * 0.4, r * k).fill({ color: lighten(color, i * 0.09), alpha: 0.9 });
  }
  for (let a = 0; a < ribs; a++) {
    const ang = (a / ribs) * Math.PI * 2;
    g.moveTo(cx + Math.cos(ang) * r * 0.15, cy + Math.sin(ang) * r * 0.15).lineTo(cx + Math.cos(ang) * r * 0.97, cy + Math.sin(ang) * r * 0.97).stroke({ width: 1.2, color: darken(color, 0.35), alpha: 0.3 });
  }
  g.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.22, r * 0.14).fill({ color: 0xffffff, alpha: 0.45 });
  g.circle(cx, cy, r).stroke({ width: 2, color: darken(color, 0.5), alpha: 0.5 });
  g.circle(cx, cy, Math.max(3, r * 0.1)).fill(0xf6e7b8).stroke({ width: 1, color: 0xb89b5c });
}

/** Conical roof from above: wedges shaded by which way they face the light. */
function conicalRoof(g: Graphics, cx: number, cy: number, r: number, color: number) {
  shadowCircle(g, cx, cy, r, r / 50);
  const n = 16, light = (-3 * Math.PI) / 4;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const lit = Math.cos(am - light);
    const col = lit > 0 ? lighten(color, lit * 0.3) : darken(color, -lit * 0.3);
    g.poly([cx, cy, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]).fill(col);
  }
  for (let rr = r * 0.85; rr > r * 0.2; rr -= r * 0.15) g.circle(cx, cy, rr).stroke({ width: 1, color: darken(color, 0.4), alpha: 0.25 });
  g.circle(cx, cy, r).stroke({ width: 2, color: darken(color, 0.55), alpha: 0.55 });
  g.circle(cx, cy, Math.max(3, r * 0.08)).fill(0xf6e7b8);
}

function chimney(g: Graphics, x: number, y: number) {
  g.rect(x + 4, y + 5, 12, 12).fill({ color: SHADOW, alpha: 0.25 });
  g.rect(x, y, 12, 12).fill(0x9a8a7a).stroke({ width: 1.5, color: 0x5d5046 });
  g.rect(x + 3, y + 3, 6, 6).fill(0x3a3230);
}

/** Kelp tree seen from above: a clump of canopy blobs, lit top-left. */
function kelpTree(g: Graphics, x: number, y: number, r: number, rnd: () => number) {
  const greens = [0x2f8f5a, 0x3fa868, 0x2a7d63, 0x4db07a];
  g.circle(x + r * 0.35, y + r * 0.45, r).fill({ color: SHADOW, alpha: 0.18 });
  const base = greens[Math.floor(rnd() * greens.length)];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.45;
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.55 + rnd() * 0.3)).fill(darken(base, 0.1));
  }
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.35;
    g.circle(x - r * 0.15 + Math.cos(a) * d, y - r * 0.18 + Math.sin(a) * d, r * (0.3 + rnd() * 0.2)).fill(lighten(base, 0.15));
  }
  g.circle(x - r * 0.3, y - r * 0.32, r * 0.18).fill({ color: 0xc9f0a0, alpha: 0.5 });
}

function coralBush(g: Graphics, x: number, y: number, r: number, rnd: () => number) {
  const col = [0xe2735f, 0xef93b4, 0xe8b14a, 0xa784d8, 0x6fcfb4][Math.floor(rnd() * 5)];
  g.circle(x + r * 0.3, y + r * 0.4, r * 0.9).fill({ color: SHADOW, alpha: 0.15 });
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6;
    g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.3 + rnd() * 0.25)).fill(i < 3 ? darken(col, 0.12) : col);
  }
  g.circle(x - r * 0.2, y - r * 0.2, r * 0.15).fill({ color: 0xffffff, alpha: 0.35 });
}

function rock(g: Graphics, x: number, y: number, r: number, rnd: () => number) {
  const col = rnd() > 0.5 ? 0x8a9ea0 : 0x9cab9f;
  g.ellipse(x + r * 0.3, y + r * 0.4, r, r * 0.8).fill({ color: SHADOW, alpha: 0.2 });
  g.ellipse(x, y, r, r * 0.8).fill(col).stroke({ width: 1.5, color: darken(col, 0.4), alpha: 0.5 });
  g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.3).fill({ color: lighten(col, 0.3), alpha: 0.7 });
}

/** Paved yard (stone flags) or a garden of sea grass. */
function yard(g: Graphics, r: Rect, paved: boolean, rnd: () => number) {
  if (paved) {
    g.roundRect(r.x, r.y, r.w, r.h, 16).fill(0xd8ccb2);
    for (let yy = r.y; yy < r.y + r.h; yy += 18) {
      const off = ((yy - r.y) / 18) % 2 ? 9 : 0;
      for (let xx = r.x - off; xx < r.x + r.w; xx += 26) {
        const x0 = Math.max(r.x, xx), x1 = Math.min(r.x + r.w, xx + 25), y1 = Math.min(r.y + r.h, yy + 17);
        // keep the flagstones off the rounded corners
        const corner = (px: number, py: number) => {
          const dx = Math.max(r.x + 16 - px, 0, px - (r.x + r.w - 16)), dy = Math.max(r.y + 16 - py, 0, py - (r.y + r.h - 16));
          return dx > 0 && dy > 0;
        };
        if (x1 > x0 && !corner(x0, yy) && !corner(x1, y1) && !corner(x0, y1) && !corner(x1, yy)) {
          g.rect(x0, yy, x1 - x0, y1 - yy).fill(mix(0xd8ccb2, rnd() > 0.5 ? 0xe9dfc8 : 0xc9bc9f, rnd() * 0.6));
        }
      }
    }
  } else {
    g.roundRect(r.x, r.y, r.w, r.h, 16).fill(0x6fae8a);
    for (let i = 0; i < (r.w * r.h) / 220; i++) {
      g.circle(r.x + rnd() * r.w, r.y + rnd() * r.h, 1.5 + rnd() * 2.5).fill({ color: rnd() > 0.5 ? 0x8cc79c : 0x5a9a78, alpha: 0.8 });
    }
  }
}

// ---------------------------------------------------------------- buildings

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

function addGlow(parent: Container, dot: Texture, a: Animated, x: number, y: number, size: number, color: number, base = 0.3, amp = 0.15) {
  const s = new Sprite(dot);
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.width = s.height = size;
  s.tint = color;
  s.blendMode = "add";
  s.alpha = base;
  parent.addChild(s);
  a.glows.push({ s, phase: Math.random() * 6, base, amp });
}

/** A courtyard building: four wings of roof around an open court. */
function cloister(g: Graphics, r: Rect, wing: number, color: number) {
  shadowRect(g, r, 4, 1.4);
  const { x, y, w, h } = r;
  hipRoof(g, { x, y, w, h: wing }, color);
  hipRoof(g, { x, y: y + h - wing, w, h: wing }, color);
  hipRoof(g, { x, y: y + wing, w: wing, h: h - 2 * wing }, color);
  hipRoof(g, { x: x + w - wing, y: y + wing, w: wing, h: h - 2 * wing }, color);
}

function drawBuilding(b: Building, layer: Container, glowLayer: Container, dot: Texture, a: Animated): Graphics {
  const g = new Graphics();
  const rnd = mulberry32(b.seed);
  const r = b.rects[0];
  const { x, y, w, h } = r;
  const cx = x + w / 2, cy = y + h / 2;
  const roof = ROOFS[Math.floor(rnd() * ROOFS.length)];

  switch (b.kind) {
    case "palace": {
      yard(g, b.lot, true, rnd);
      const body = inset(r, 18);
      cloister(g, body, 82, 0x4f9fae);
      const court = inset(body, 82);
      yard(g, court, true, rnd);
      const pw = court.w * 0.24;
      for (const px of [court.x + 20, court.x + court.w - 20 - pw]) {
        g.roundRect(px, court.y + court.h / 2 - 50, pw, 100, 30).fill(0x2aa9c0).stroke({ width: 4, color: MARBLE_SHADE });
      }
      dome(g, cx, cy, Math.min(court.h * 0.62, 150), 0x3fb0bf, 12);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dome(g, body.x + 41 + dx * (body.w - 82), body.y + 41 + dy * (body.h - 82), 50, 0xd2ae7c);
      for (let s = 0; s < 4; s++) g.rect(cx - 110 + s * 10, y + h - 18 + s * 4, 220 - s * 20, 4).fill(lighten(MARBLE_SHADE, 0.2 + s * 0.1));
      addGlow(glowLayer, dot, a, cx, cy, 300, GLOW, 0.1, 0.05);
      break;
    }
    case "plaza":
      break; // the plaza floor and fountain are drawn with the paths
    case "hall": {
      yard(g, b.lot, true, rnd);
      const body: Rect = { x: x + 10, y: y + 10, w: w - 20, h: h * 0.58 };
      shadowRect(g, body, 4, 1.4);
      hipRoof(g, body, 0x5f7f99);
      for (let px = body.x + 12; px <= body.x + body.w - 12; px += 22) {
        g.circle(px + 3, body.y + body.h + 14, 6).fill({ color: SHADOW, alpha: 0.2 });
        g.circle(px, body.y + body.h + 10, 6).fill(MARBLE).stroke({ width: 1.5, color: MARBLE_SHADE });
      }
      const fy = body.y + body.h + 32;
      for (let i = 0; i < 6; i++) {
        const tx = x + 30 + i * ((w - 80) / 5), ty = fy + (i % 2) * 24;
        g.rect(tx + 3, ty + 4, 26, 34).fill({ color: SHADOW, alpha: 0.2 });
        g.roundRect(tx, ty, 26, 34, 4).fill(0xe6e1d6).stroke({ width: 1.5, color: 0x8f8a80 });
        for (let l = 0; l < 4; l++) g.rect(tx + 5, ty + 7 + l * 6, 16, 1.5).fill(0x8f8a80);
      }
      break;
    }
    case "temple": {
      yard(g, b.lot, true, rnd);
      const body = inset(r, 10);
      cloister(g, body, 58, 0xd2ae7c);
      const court = inset(body, 58);
      yard(g, court, false, rnd);
      const n = 6, rr = Math.min(court.w, court.h) * 0.32;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const ex = cx + Math.cos(ang) * rr, ey = cy + Math.sin(ang) * rr;
        addGlow(glowLayer, dot, a, ex, ey, 46, 0xffe07a, 0.28, 0.14);
        g.ellipse(ex + 3, ey + 4, 13, 17).fill({ color: SHADOW, alpha: 0.2 });
        g.ellipse(ex, ey, 13, 17).fill([0xfff3e0, 0xffd6c4, 0xd8f3ff, 0xf2c6ff, 0xe8ffd0, 0xffe9b0][i]).stroke({ width: 1.5, color: 0xc49a7c });
        g.ellipse(ex - 4, ey - 6, 4, 3).fill({ color: 0xffffff, alpha: 0.8 });
      }
      g.circle(cx, cy, 20).fill(0xe6e1d6).stroke({ width: 2, color: 0x8f8a80 });
      break;
    }
    case "archive": {
      yard(g, b.lot, false, rnd);
      const body = inset(r, 14);
      shadowRect(g, body, 4, 1.4);
      flatRoof(g, body, 0xe8e2d4, rnd, false);
      const cols = 3, rows = 2;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          dome(g, body.x + body.w * ((i + 0.5) / cols), body.y + body.h * ((j + 0.5) / rows), Math.min(body.w / cols, body.h / rows) * 0.36, 0xf3eefc);
        }
      }
      break;
    }
    case "vents": {
      yard(g, b.lot, true, rnd);
      const body = inset(r, 10);
      shadowRect(g, body, 4, 1.4);
      hipRoof(g, { x: body.x, y: body.y, w: body.w, h: 64 }, 0xb35d4a);
      hipRoof(g, { x: body.x, y: body.y + 64, w: 64, h: body.h - 64 }, 0xb35d4a);
      hipRoof(g, { x: body.x + body.w - 64, y: body.y + 64, w: 64, h: body.h - 64 }, 0xb35d4a);
      const pool = { x: body.x + 80, y: body.y + 80, w: body.w - 160, h: body.h - 96 };
      for (let i = 0; i < 3; i++) {
        const pw = pool.w / 3 - 10, px = pool.x + i * (pool.w / 3) + 5;
        g.roundRect(px, pool.y, pw, pool.h, 18).fill(0x4fc4d0).stroke({ width: 4, color: MARBLE_SHADE });
        g.roundRect(px + 6, pool.y + 6, pw - 12, 10, 5).fill({ color: 0xffffff, alpha: 0.25 });
        for (let k = 0; k < 3; k++) {
          const bub = new Graphics().circle(0, 0, 3 + rnd() * 3).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
          layer.addChild(bub);
          a.bubbles.push({ g: bub, x: px + 12 + rnd() * (pw - 24), y: pool.y + pool.h - 12, phase: rnd() * 6, rise: pool.h - 20 });
        }
      }
      break;
    }
    case "market": {
      yard(g, b.lot, true, rnd);
      const ring = 54;
      cloister(g, inset(r, 6), ring, 0xc0704f);
      const sq = inset(r, 6 + ring + 10);
      const cols = 3, rows = 3, cw = sq.w / cols, rh = sq.h / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (i === 1 && j === 1) {
            g.circle(sq.x + cw * 1.5, sq.y + rh * 1.5, Math.min(cw, rh) * 0.32).fill(0x5fd0d8).stroke({ width: 4, color: MARBLE_SHADE });
            continue;
          }
          const s = { x: sq.x + i * cw + 8, y: sq.y + j * rh + 8, w: cw - 16, h: rh - 16 };
          const col = [0xd9534f, 0x4f9fae, 0xe8b14a, 0x9583bf, 0x5fa898][(i * 3 + j) % 5];
          shadowRect(g, s, 3, 0.8);
          g.rect(s.x, s.y, s.w, s.h).fill(0xf6efe0);
          for (let k = 0; k < 6; k += 2) g.rect(s.x + (k * s.w) / 6, s.y, s.w / 6, s.h).fill(col);
          g.moveTo(s.x, s.y + s.h / 2).lineTo(s.x + s.w, s.y + s.h / 2).stroke({ width: 2, color: darken(col, 0.4), alpha: 0.5 });
          g.rect(s.x, s.y, s.w, s.h).stroke({ width: 1.5, color: darken(col, 0.5), alpha: 0.6 });
        }
      }
      break;
    }
    case "beacon": {
      yard(g, b.lot, false, rnd);
      for (let i = 0; i < 14; i++) rock(g, x + rnd() * w, y + rnd() * h, 16 + rnd() * 18, rnd);
      for (let i = 0; i < 10; i++) coralBush(g, x + rnd() * w, y + rnd() * h, 14 + rnd() * 10, rnd);
      const rr = Math.min(w, h) * 0.3;
      g.circle(cx, cy, rr + 22).fill(0xbfc6bf).stroke({ width: 3, color: 0x8a948c });
      conicalRoof(g, cx, cy, rr, 0x5f7f99);
      g.circle(cx, cy, rr * 0.22).fill(0xfff1b8).stroke({ width: 3, color: 0xe6b85c });
      addGlow(glowLayer, dot, a, cx, cy, rr * 3.2, 0xfff1b8, 0.28, 0.14);
      break;
    }
    case "racetrack": {
      yard(g, b.lot, true, rnd);
      const rx = w / 2 - 6, ry = h / 2 - 6;
      for (const [o, al] of [[6, 0.1], [11, 0.08], [16, 0.06]] as const) g.ellipse(cx + o, cy + o * 1.3, rx, ry).fill({ color: SHADOW, alpha: al });
      g.ellipse(cx, cy, rx, ry).fill(0xd9cbb0).stroke({ width: 4, color: 0x9c8d70 });
      for (let k = 0; k < 6; k++) g.ellipse(cx, cy, rx - 8 - k * 10, ry - 8 - k * 10).stroke({ width: 3, color: k % 2 ? 0xc9b997 : 0xe6dac0 });
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        g.moveTo(cx + Math.cos(ang) * (rx - 8), cy + Math.sin(ang) * (ry - 8)).lineTo(cx + Math.cos(ang) * (rx - 64), cy + Math.sin(ang) * (ry - 64)).stroke({ width: 1, color: 0x9c8d70, alpha: 0.35 });
      }
      g.ellipse(cx, cy, rx - 70, ry - 70).fill(0x3fbcc9);
      g.ellipse(cx, cy, rx - 70, ry - 70).stroke({ width: 3, color: 0xffffff, alpha: 0.5 });
      g.ellipse(cx, cy, rx - 140, ry - 140).fill(0x6fae8a).stroke({ width: 4, color: MARBLE_SHADE });
      g.roundRect(cx - (rx - 190), cy - 9, (rx - 190) * 2, 18, 9).fill(MARBLE).stroke({ width: 2, color: MARBLE_SHADE });
      for (const ox of [-(rx - 200), rx - 200]) dome(g, cx + ox, cy, 15, 0xe6b85c, 6);
      for (let i = 0; i < 24; i++) {
        const ch = new Graphics().moveTo(-7, -9).lineTo(5, 0).lineTo(-7, 9).stroke({ width: 4, color: 0xffffff, alpha: 0.75, cap: "round", join: "round" });
        layer.addChild(ch);
        a.chevrons.push({ g: ch, t: i / 24, cx, cy, rx: rx - 105, ry: ry - 105 });
      }
      break;
    }
    case "gardens": {
      g.rect(b.lot.x, b.lot.y, b.lot.w, b.lot.h).fill(0x4f9a74);
      for (let k = 0; k < 3; k++) {
        const t = inset(b.lot, 10 + k * 28);
        g.roundRect(t.x + 4, t.y + 6, t.w, t.h, 18).fill({ color: SHADOW, alpha: 0.12 });
        g.roundRect(t.x, t.y, t.w, t.h, 18).fill(mix(0x5fae84, 0x7cc496, k / 3)).stroke({ width: 3, color: 0x3d7f5c, alpha: 0.6 });
      }
      const well = { x: cx + (rnd() - 0.5) * w * 0.3, y: cy + (rnd() - 0.5) * h * 0.3 };
      g.circle(well.x + 4, well.y + 6, 26).fill({ color: SHADOW, alpha: 0.2 });
      g.circle(well.x, well.y, 26).fill(0xbfc6bf).stroke({ width: 3, color: 0x8a948c });
      g.circle(well.x, well.y, 15).fill(0x2a8fae);
      for (let i = 0; i < 26; i++) {
        const tx = x + 30 + rnd() * (w - 60), ty = y + 30 + rnd() * (h - 60);
        if (Math.hypot(tx - well.x, ty - well.y) < 50) continue;
        const tree = new Container();
        tree.position.set(tx, ty);
        const tg = new Graphics();
        kelpTree(tg, 0, 0, 18 + rnd() * 16, rnd);
        tree.addChild(tg);
        layer.addChild(tree);
        a.sway.push({ c: tree, phase: rnd() * 6, amp: 0.03 });
      }
      break;
    }
    case "docks": {
      g.rect(b.lot.x, b.lot.y, b.lot.w, b.lot.h).fill(0xb8a888);
      const basin = inset(r, 26);
      g.roundRect(basin.x, basin.y, basin.w, basin.h, 30).fill(0x1d6f8f).stroke({ width: 6, color: 0x8a7a5c });
      g.roundRect(basin.x + 10, basin.y + 10, basin.w - 20, basin.h - 20, 24).stroke({ width: 3, color: 0x3b97b6, alpha: 0.6 });
      for (let i = 0; i < 5; i++) {
        const px = basin.x + 60 + i * ((basin.w - 120) / 4);
        g.rect(px + 4, basin.y + 6, 24, 120).fill({ color: SHADOW, alpha: 0.25 });
        g.rect(px, basin.y, 24, 116).fill(0x8a5a32).stroke({ width: 2, color: 0x5a3a1e });
        for (let pl = 0; pl < 116; pl += 10) g.moveTo(px, basin.y + pl).lineTo(px + 24, basin.y + pl).stroke({ width: 1, color: 0x5a3a1e, alpha: 0.6 });
      }
      const sx = cx + 30, sy = cy + 50;
      const hull = [-240, -62, 140, -70, 250, 0, 140, 70, -240, 62, -258, 0].map((v, i) => (i % 2 ? v + sy : v + sx));
      g.poly(hull.map((v, i) => v + (i % 2 ? 16 : 12))).fill({ color: SHADOW, alpha: 0.35 });
      g.poly(hull).fill(0x7a5236).stroke({ width: 5, color: 0x4a2f1f });
      for (let yy = -48; yy <= 48; yy += 12) g.moveTo(sx - 230, sy + yy).lineTo(sx + 150 - Math.abs(yy) * 0.6, sy + yy).stroke({ width: 1.5, color: 0x4a2f1f, alpha: 0.5 });
      g.rect(sx - 180, sy - 34, 80, 68).fill(0x6a452c).stroke({ width: 3, color: 0x3e271a });
      g.moveTo(sx + 10, sy).lineTo(sx + 150, sy - 130).stroke({ width: 10, color: 0x5a3a26, cap: "round" });
      g.poly([sx - 40, sy + 16, sx + 30, sy + 8, sx + 14, sy + 50, sx - 26, sy + 50]).fill({ color: 0x0b3540, alpha: 0.85 });
      for (let i = 0; i < 8; i++) {
        const bx = x + 20 + rnd() * (w - 40), by = rnd() > 0.5 ? y + 12 : y + h - 12;
        g.circle(bx + 3, by + 4, 11).fill({ color: SHADOW, alpha: 0.25 });
        g.circle(bx, by, 11).fill(0x8a5a32).stroke({ width: 3, color: 0x4a2f1f });
      }
      break;
    }
    case "gate": {
      g.rect(b.lot.x, b.lot.y, b.lot.w, b.lot.h).fill(0x7f969e);
      for (let k = 1; k <= 5; k++) g.roundRect(x + k * 30, y + k * 22, w - k * 60, h - k * 22, 22).fill(darken(0x8fa7b0, k * 0.14));
      g.roundRect(x + 170, y + 130, w - 340, h - 130, 20).fill(0x041a3a);
      g.roundRect(x + 220, y + 170, w - 440, h - 170, 18).fill(0x020c24);
      g.rect(cx - 250 + 6, y + 92 + 8, 500, 30).fill({ color: SHADOW, alpha: 0.3 });
      g.rect(cx - 250, y + 92, 500, 30).fill(MARBLE).stroke({ width: 3, color: MARBLE_SHADE });
      for (const ox of [-250, 250]) {
        shadowRect(g, { x: cx + ox - 36, y: y + 70, w: 72, h: 72 }, 12);
        g.roundRect(cx + ox - 36, y + 70, 72, 72, 12).fill(MARBLE).stroke({ width: 3, color: MARBLE_SHADE });
        dome(g, cx + ox, y + 106, 22, 0xd2ae7c, 6);
      }
      for (let i = 0; i < 36; i++) addGlow(glowLayer, dot, a, x + 240 + rnd() * (w - 480), y + 200 + rnd() * (h - 220), 14 + rnd() * 12, rnd() > 0.5 ? 0x7af7ff : 0xb6a2ff, 0.45, 0.4);
      break;
    }
    // ---------------------------------------------------------- houses
    case "villa": {
      yard(g, b.lot, rnd() > 0.4, rnd);
      // L-shaped: a main wing and a side wing
      const main: Rect = { x, y, w: w * (0.6 + rnd() * 0.15), h };
      const side: Rect = rnd() > 0.5 ? { x: main.x + main.w, y, w: w - main.w, h: h * 0.55 } : { x: main.x + main.w, y: y + h * 0.45, w: w - main.w, h: h * 0.55 };
      shadowRect(g, main, 2);
      shadowRect(g, side, 2, 0.8);
      hipRoof(g, side, darken(roof, 0.05));
      hipRoof(g, main, roof);
      chimney(g, main.x + main.w * 0.7, main.y + main.h * 0.2);
      break;
    }
    case "domehouse": {
      yard(g, b.lot, true, rnd);
      shadowRect(g, r, 4);
      flatRoof(g, r, 0xe8e2d4, rnd, false);
      dome(g, cx + (rnd() - 0.5) * w * 0.15, cy + (rnd() - 0.5) * h * 0.15, Math.min(w, h) * 0.34, roof);
      for (const [px, py] of [[x + 14, y + 14], [x + w - 14, y + h - 14]]) coralBush(g, px, py, 9, rnd);
      break;
    }
    case "tower": {
      yard(g, b.lot, false, rnd);
      const rr = Math.min(w, h) / 2;
      g.circle(cx, cy, rr).fill(0xbfc6bf).stroke({ width: 2, color: 0x8a948c });
      conicalRoof(g, cx, cy, rr * 0.86, roof);
      break;
    }
    case "cottage": {
      yard(g, b.lot, false, rnd);
      const body: Rect = { x, y, w, h: h * (0.65 + rnd() * 0.2) };
      shadowRect(g, body, 2);
      hipRoof(g, body, roof);
      chimney(g, body.x + body.w * 0.15, body.y + body.h * 0.15);
      for (let i = 0; i < 4; i++) coralBush(g, x + 14 + rnd() * (w - 28), body.y + body.h + 14 + rnd() * Math.max(4, h - body.h - 24), 9 + rnd() * 6, rnd);
      break;
    }
    case "shrine": {
      yard(g, b.lot, true, rnd);
      const body = inset(r, Math.min(w, h) * 0.12);
      for (let px = body.x; px <= body.x + body.w; px += 22) {
        g.circle(px, body.y - 8, 5).fill(MARBLE).stroke({ width: 1, color: MARBLE_SHADE });
        g.circle(px, body.y + body.h + 8, 5).fill(MARBLE).stroke({ width: 1, color: MARBLE_SHADE });
      }
      shadowRect(g, body, 2);
      hipRoof(g, body, 0xd2ae7c);
      g.circle(cx, body.y + body.h + 26, 9).fill(0xbff8ff).stroke({ width: 2, color: 0x6fd3e0 });
      addGlow(glowLayer, dot, a, cx, body.y + body.h + 26, 50, GLOW, 0.25, 0.12);
      break;
    }
    case "workshop": {
      yard(g, b.lot, true, rnd);
      const body: Rect = { x, y, w: w * 0.78, h };
      shadowRect(g, body, 2);
      flatRoof(g, body, 0xa59a86, rnd, true);
      for (let i = 0; i < 4; i++) {
        const bx = body.x + body.w + 8 + rnd() * Math.max(2, w - body.w - 30), by = y + 10 + rnd() * (h - 30);
        g.rect(bx + 3, by + 4, 18, 18).fill({ color: SHADOW, alpha: 0.25 });
        g.rect(bx, by, 18, 18).fill(0x9a6b3e).stroke({ width: 2, color: 0x5a3a1e });
        g.moveTo(bx, by).lineTo(bx + 18, by + 18).stroke({ width: 1, color: 0x5a3a1e, alpha: 0.6 });
      }
      break;
    }
    case "grotto": {
      yard(g, b.lot, false, rnd);
      for (let i = 0; i < 9; i++) rock(g, x + w * (0.15 + rnd() * 0.7), y + h * (0.15 + rnd() * 0.7), Math.min(w, h) * (0.14 + rnd() * 0.12), rnd);
      g.ellipse(cx, cy, Math.min(w, h) * 0.15, Math.min(w, h) * 0.11).fill(0x0b2a33);
      for (let i = 0; i < 5; i++) g.circle(x + rnd() * w, y + rnd() * h, 4 + rnd() * 4).fill({ color: 0x7cc496, alpha: 0.8 });
      break;
    }
    case "grove": {
      yard(g, b.lot, false, rnd);
      for (let i = 0; i < 7; i++) kelpTree(g, x + 24 + rnd() * (w - 48), y + 24 + rnd() * (h - 48), 18 + rnd() * 14, rnd);
      for (let i = 0; i < 3; i++) coralBush(g, x + rnd() * w, y + rnd() * h, 10, rnd);
      break;
    }
  }
  layer.addChild(g);
  return g;
}

// ---------------------------------------------------------------- the city

export function buildCity(opts: {
  fontFamily: string;
  dot: Texture;
  onTap: (id: string, e: FederatedPointerEvent) => void;
}): City {
  const root = new Container();
  const pathLayer = new Graphics();
  const decoLayer = new Graphics();
  const buildingLayer = new Container();
  const glowLayer = new Container();
  const fxLayer = new Container();
  const labelLayer = new Container();
  for (const c of [pathLayer, decoLayer, glowLayer, fxLayer, labelLayer]) c.interactiveChildren = false;
  root.addChild(pathLayer, decoLayer, buildingLayer, glowLayer, fxLayer, labelLayer);
  const anim: Animated = { sway: [], glows: [], chevrons: [], bubbles: [] };
  const rnd = mulberry32(4242);

  // ---- sea-meadow ground under the city, so the verges between paths and buildings read as land
  const ground = new Graphics();
  root.addChildAt(ground, 0);
  ground.interactiveChildren = false;
  for (const [pad, alpha] of [[70, 0.25], [40, 0.5], [0, 1]] as const) {
    ground.roundRect(170 - pad, 170 - pad, 3860 + pad * 2, 2660 + pad * 2, 220 + pad).fill({ color: 0x9fbf9c, alpha });
  }
  for (let i = 0; i < 9000; i++) {
    const gx = 200 + rnd() * 3800, gy = 200 + rnd() * 2600;
    ground.circle(gx, gy, 2 + rnd() * 5).fill({ color: rnd() > 0.5 ? 0x8db48e : 0xb7cfa9, alpha: 0.6 });
  }
  for (let i = 0; i < 60; i++) {
    const gx = 200 + rnd() * 3800, gy = 200 + rnd() * 2600, gr = 40 + rnd() * 90;
    ground.ellipse(gx, gy, gr, gr * (0.5 + rnd() * 0.5)).fill({ color: rnd() > 0.5 ? 0xb3c99f : 0x8fb08f, alpha: 0.35 });
  }
  // the abyss beyond the Trench Gate stays dark
  for (const [k, alpha] of [[1.25, 0.35], [1.1, 0.55], [1, 0.85], [0.8, 1]] as const) {
    ground.ellipse(2100, 2880, 640 * k, 230 * k).fill({ color: 0x031634, alpha });
  }

  // ---- sand paths: a darker rim, the sand, a worn lighter centre, pebbles
  const P = PLAZA;
  pathLayer.circle(P.x + 8, P.y + 10, P.radius).fill({ color: SHADOW, alpha: 0.1 });
  pathLayer.circle(P.x, P.y, P.radius + 8).fill(SAND_EDGE);
  pathLayer.circle(P.x, P.y, P.radius).fill(SAND);
  for (let k = 0; k < 3; k++) pathLayer.circle(P.x, P.y, P.radius - 12 - k * 6).stroke({ width: 2, color: SAND_EDGE, alpha: 0.35 });
  const stroke = (pts: { x: number; y: number }[], width: number, color: number, alpha = 1) => {
    pathLayer.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) pathLayer.lineTo(pts[i].x, pts[i].y);
    pathLayer.stroke({ width, color, alpha, cap: "round", join: "round" });
  };
  for (const e of ROADS.edges) stroke(e.pts, e.width + 12, SAND_EDGE, 0.75);
  for (const n of ROADS.nodes) pathLayer.circle(n.x, n.y, 44).fill({ color: SAND_EDGE, alpha: 0.75 });
  for (const e of ROADS.edges) stroke(e.pts, e.width, SAND);
  for (const n of ROADS.nodes) pathLayer.circle(n.x, n.y, 38).fill(SAND);
  for (const e of ROADS.edges) stroke(e.pts, e.width * 0.45, SAND_LIGHT, 0.7);
  for (const e of ROADS.edges) {
    for (const p of e.pts) {
      for (let k = 0; k < 2; k++) {
        const ox = (rnd() - 0.5) * e.width * 0.9, oy = (rnd() - 0.5) * e.width * 0.9;
        pathLayer.circle(p.x + ox, p.y + oy, 1.2 + rnd() * 2.2).fill({ color: rnd() > 0.5 ? 0xb9a073 : 0xfff3d6, alpha: 0.7 });
      }
    }
  }
  // Great Shell fountain
  pathLayer.circle(P.x + 6, P.y + 8, P.fountain + 10).fill({ color: SHADOW, alpha: 0.2 });
  pathLayer.circle(P.x, P.y, P.fountain + 10).fill(0x5fd0d8).stroke({ width: 6, color: MARBLE_SHADE });
  pathLayer.circle(P.x, P.y, 62).fill(0xfbe7d0).stroke({ width: 4, color: 0xd59b7a });
  let rr = 58;
  pathLayer.moveTo(P.x + rr, P.y);
  for (let ang = 0; ang < Math.PI * 7; ang += 0.2) {
    rr = 58 * (1 - ang / (Math.PI * 7.4));
    pathLayer.lineTo(P.x + Math.cos(ang) * rr, P.y + Math.sin(ang) * rr);
  }
  pathLayer.stroke({ width: 4, color: 0xd59b7a, alpha: 0.85 });
  for (let k = 0; k < 10; k++) {
    const bub = new Graphics().circle(0, 0, 3 + rnd() * 4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });
    fxLayer.addChild(bub);
    const ang = rnd() * Math.PI * 2;
    anim.bubbles.push({ g: bub, x: P.x + Math.cos(ang) * 30, y: P.y + Math.sin(ang) * 30, phase: rnd() * 6, rise: 70 });
  }

  // ---- buildings (interactive)
  const hoverBox = new Graphics();
  const selectBox = new Graphics();
  fxLayer.addChild(hoverBox, selectBox);
  const occupied: Rect[] = [];
  for (const b of BUILDINGS) {
    const art = drawBuilding(b, buildingLayer, glowLayer, opts.dot, anim);
    occupied.push(b.kind === "plaza" ? { x: P.x - P.radius, y: P.y - P.radius, w: P.radius * 2, h: P.radius * 2 } : b.lot);
    for (const r of b.rects) {
      const hit = new Container();
      hit.hitArea = new Rectangle(r.x, r.y, r.w, r.h);
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", (e: FederatedPointerEvent) => opts.onTap(b.id, e));
      hit.on("pointerover", () => {
        art.tint = 0xfff4d6;
        outline(hoverBox, b, 0xffffff, 3);
      });
      hit.on("pointerout", () => {
        art.tint = 0xffffff;
        hoverBox.clear();
      });
      buildingLayer.addChild(hit);
    }
  }

  // ---- nature in every gap: verges between paths and buildings, and the open sea around the city
  const inside = (x: number, y: number) => occupied.some((r) => x > r.x - 4 && x < r.x + r.w + 4 && y > r.y - 4 && y < r.y + r.h + 4);
  const abyss = (x: number, y: number) => x > 1500 && x < 2700 && y > 2640;
  for (let gy = 20; gy < WORLD_SIZE.h; gy += 34) {
    for (let gx = 20; gx < WORLD_SIZE.w; gx += 34) {
      const x = gx + (rnd() - 0.5) * 26, y = gy + (rnd() - 0.5) * 26;
      if (inside(x, y) || abyss(x, y)) continue;
      const clear = distanceToPaths(x, y);
      if (clear < 6) continue;
      const roll = rnd();
      const size = Math.min(1, (clear - 6) / 40);
      if (roll < 0.22) kelpTree(decoLayer, x, y, 9 + size * 16 + rnd() * 6, rnd);
      else if (roll < 0.34) coralBush(decoLayer, x, y, 7 + size * 8, rnd);
      else if (roll < 0.42) rock(decoLayer, x, y, 6 + size * 9, rnd);
      else if (roll < 0.6) decoLayer.circle(x, y, 2 + rnd() * 3).fill({ color: rnd() > 0.5 ? 0x7cc496 : 0x5a9a78, alpha: 0.7 });
    }
  }

  // Lanterns beside some crossings
  for (const n of ROADS.nodes) {
    if (rnd() > 0.55 || Math.hypot(n.x - P.x, n.y - P.y) < P.radius + 30) continue;
    const ang = rnd() * Math.PI * 2;
    const lx = n.x + Math.cos(ang) * 58, ly = n.y + Math.sin(ang) * 58;
    if (distanceToPaths(lx, ly) < 2 || inside(lx, ly)) continue;
    decoLayer.circle(lx + 3, ly + 4, 7).fill({ color: SHADOW, alpha: 0.25 });
    decoLayer.circle(lx, ly, 7).fill(0x7f9599).stroke({ width: 2, color: 0x5d7176 });
    decoLayer.circle(lx, ly, 3.5).fill(0xe9ffff);
    addGlow(glowLayer, opts.dot, anim, lx, ly, 40, GLOW, 0.25, 0.12);
  }

  // ---- names: district plates always, landmark names when zoomed in
  const plate = (text: string, x: number, y: number, size: number, alpha: number) => {
    const label = new BitmapText({ text, style: { fontFamily: opts.fontFamily, fontSize: size, fill: 0xffffff, fontWeight: "600" } });
    label.anchor.set(0.5);
    const bg = new Graphics()
      .roundRect(-label.width / 2 - size * 0.6, -size * 0.8, label.width + size * 1.2, size * 1.6, size * 0.8)
      .fill({ color: 0x053845, alpha })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    const c = new Container();
    c.addChild(bg, label);
    c.position.set(x, y);
    labelLayer.addChild(c);
    return c;
  };
  for (const z of ZONES) plate(z.name, z.label.x, z.label.y, 34, 0.55);
  const landmarkPlates = BUILDINGS.filter((b) => b.landmark).map((b) => {
    const r = b.rects[0];
    return plate(b.name, r.x + r.w / 2, b.kind === "plaza" ? r.y + r.h + 30 : r.y + r.h - 24, 20, 0.5);
  });

  function outline(g: Graphics, b: Building | null, color: number, width: number) {
    g.clear();
    if (!b) return;
    for (const r of b.rects) g.roundRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, 18).stroke({ width, color, alpha: 0.95 });
  }
  let selected: string | null = null;

  return {
    root,
    setSelected(id) {
      selected = id;
      outline(selectBox, id ? BUILDINGS.find((b) => b.id === id) ?? null : null, 0xffe07a, 6);
    },
    centerOf(id) {
      const b = BUILDINGS.find((x) => x.id === id);
      if (!b) return null;
      const xs = b.rects.flatMap((r) => [r.x, r.x + r.w]), ys = b.rects.flatMap((r) => [r.y, r.y + r.h]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    },
    animate(t, zoom) {
      for (const s of anim.sway) s.c.rotation = Math.sin(t * 0.8 + s.phase) * s.amp;
      for (const gl of anim.glows) gl.s.alpha = gl.base + Math.sin(t * 1.6 + gl.phase) * gl.amp;
      for (const ch of anim.chevrons) {
        const ang = (ch.t + t * 0.04) * Math.PI * 2;
        ch.g.position.set(ch.cx + Math.cos(ang) * ch.rx, ch.cy + Math.sin(ang) * ch.ry);
        ch.g.rotation = Math.atan2(Math.cos(ang) * ch.ry, -Math.sin(ang) * ch.rx);
      }
      for (const b of anim.bubbles) {
        const p = (((t * 0.25 + b.phase) % 1) + 1) % 1;
        b.g.position.set(b.x + Math.sin(t * 2 + b.phase) * 6, b.y - p * b.rise);
        b.g.alpha = 1 - p;
      }
      const showLandmarks = zoom >= 0.55;
      for (const p of landmarkPlates) p.visible = showLandmarks;
      selectBox.alpha = selected ? 0.65 + Math.sin(t * 4) * 0.35 : 0;
    },
  };
}
