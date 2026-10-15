/**
 * Procedural top-down sea creatures. Each species is drawn once into a Container,
 * then baked to a texture by the reef renderer. All art faces +x, centred on (0,0).
 */
import { Container, Graphics } from "pixi.js";
import type { FamilyId } from "@/lib/market/species";
import { creatureColors, darken, lighten, mulberry32, type CreatureColors } from "./color";

export interface CreatureArt {
  root: Container;
  /** Where the coin-logo emblem sits, in art coordinates. */
  emblem: { x: number; y: number; r: number };
}

export interface ArtSpec {
  family: FamilyId;
  variantIndex: number;
  palette: string[];
  hue: number;
  patternSeed: number;
}

const OUTLINE = 2;

function eye(g: Graphics, x: number, y: number, r = 4) {
  g.circle(x, y, r).fill(0xffffff).stroke({ width: 1, color: 0x0b2530, alpha: 0.5 });
  g.circle(x + r * 0.25, y, r * 0.55).fill(0x0b1a22);
  g.circle(x + r * 0.45, y - r * 0.3, r * 0.2).fill(0xffffff);
}

/** Ellipse rotated by `rot` radians, as its own child so the parent stays simple. */
function rotEllipse(root: Container, x: number, y: number, rx: number, ry: number, rot: number, color: number, outline?: number) {
  const g = new Graphics().ellipse(0, 0, rx, ry).fill(color);
  if (outline != null) g.stroke({ width: OUTLINE, color: outline, alpha: 0.5 });
  g.position.set(x, y);
  g.rotation = rot;
  root.addChild(g);
  return g;
}

/** Soft top-left sheen so bodies read as painted volumes. */
function sheen(g: Graphics, x: number, y: number, rx: number, ry: number, c: CreatureColors) {
  g.ellipse(x - rx * 0.2, y - ry * 0.35, rx * 0.55, ry * 0.3).fill({ color: c.highlight, alpha: 0.35 });
}

/** Vertical band clipped to an ellipse body (no masks needed). */
function band(g: Graphics, cx: number, rx: number, ry: number, x: number, w: number, color: number, alpha = 1) {
  const t = (x - cx) / rx;
  if (Math.abs(t) >= 0.98) return;
  const h = ry * Math.sqrt(1 - t * t) * 0.96;
  g.ellipse(x, 0, w, h).fill({ color, alpha });
}

// ---------------------------------------------------------------- fish

function fish(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const L = [44, 32, 42, 58][v];
  const W = [24, 29, 18, 12][v];
  const g = new Graphics();
  // Tail
  g.moveTo(-L + 6, 0).lineTo(-L - 24, -W * 0.95).quadraticCurveTo(-L - 12, 0, -L - 24, W * 0.95).closePath()
    .fill(c.accent).stroke({ width: OUTLINE, color: c.outline, alpha: 0.4 });
  root.addChild(g);
  // Pectoral fins
  const finL = v === 0 ? 20 : 13;
  rotEllipse(root, -2, -W * 0.85, finL, 6, -0.5, c.accent, c.outline);
  rotEllipse(root, -2, W * 0.85, finL, 6, 0.5, c.accent, c.outline);
  // Lionfish spines
  if (v === 2) {
    const s = new Graphics();
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.25 + (i / 13) * 1.5);
      const r0 = 14, r1 = 40 + rnd() * 10;
      s.moveTo(Math.cos(a) * r0 - 8, Math.sin(a) * r0).lineTo(Math.cos(a) * r1 - 8, Math.sin(a) * r1 * 1.1)
        .stroke({ width: 2.5, color: i % 2 ? c.pattern : c.accent, alpha: 0.9 });
    }
    root.addChild(s);
  }
  const b = new Graphics();
  // Sailfish bill
  if (v === 3) b.moveTo(L - 4, 0).lineTo(L + 30, 0).stroke({ width: 3, color: c.outline, alpha: 0.8 });
  // Pufferfish spikes
  if (v === 1) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.cos(a) * L, y = Math.sin(a) * W;
      b.moveTo(x, y).lineTo(x * 1.22, y * 1.22).stroke({ width: 2, color: c.outline, alpha: 0.7 });
    }
  }
  b.ellipse(0, 0, L, W).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
  if (v === 0) {
    for (const x of [-L * 0.45, 0, L * 0.42]) band(b, 0, L, W, x, 5, c.pattern);
  } else if (v === 1) {
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.75;
      b.circle(Math.cos(a) * L * r, Math.sin(a) * W * r, 2.5).fill({ color: c.pattern, alpha: 0.9 });
    }
  } else if (v === 2) {
    for (let x = -L * 0.7; x < L * 0.7; x += 9) band(b, 0, L, W, x, 2.5, c.pattern, 0.9);
  } else {
    b.moveTo(-L * 0.8, 0).lineTo(L * 0.7, 0).stroke({ width: 4, color: c.accent, alpha: 0.8 });
  }
  sheen(b, 0, 0, L, W, c);
  eye(b, L * 0.62, -W * 0.5, v === 1 ? 5 : 4);
  eye(b, L * 0.62, W * 0.5, v === 1 ? 5 : 4);
  root.addChild(b);
  return { x: -L * 0.15, y: 0, r: Math.min(W * 0.62, 15) };
}

// ---------------------------------------------------------------- octopus

function octopus(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const arms = new Graphics();
  const n = v === 2 ? 10 : 8;
  const reach = v === 1 ? 30 : 52;
  for (let i = 0; i < n; i++) {
    const spread = (i / (n - 1) - 0.5) * 1.6;
    const wob = (rnd() - 0.5) * 14;
    const ex = -reach - rnd() * 10, ey = spread * 30 + wob;
    arms.moveTo(0, spread * 12).bezierCurveTo(-reach * 0.4, spread * 26 - wob, -reach * 0.7, ey + wob, ex, ey)
      .stroke({ width: v === 2 ? 3 : 6, color: c.accent, cap: "round" });
    arms.moveTo(-reach * 0.5, spread * 24).lineTo(ex, ey).stroke({ width: 2.5, color: darken(c.accent, 0.2), alpha: 0.5, cap: "round" });
  }
  root.addChild(arms);
  const b = new Graphics();
  if (v === 2) {
    // Nautilus: coiled shell
    b.circle(10, 0, 30).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.moveTo(10, 0).lineTo(10 + Math.cos(a) * 29, Math.sin(a) * 29).stroke({ width: 4, color: c.pattern, alpha: 0.75 });
    }
    b.circle(10, 0, 9).fill(c.accent);
    sheen(b, 10, 0, 30, 30, c);
    eye(b, 30, -18, 4);
    eye(b, 30, 18, 4);
    root.addChild(b);
    return { x: 10, y: 0, r: 14 };
  }
  const mx = v === 1 ? 12 : 16, rx = v === 1 ? 36 : 28, ry = v === 1 ? 22 : 24;
  if (v === 1) b.ellipse(mx, 0, rx + 5, ry + 5).fill({ color: c.accent, alpha: 0.85 });
  b.ellipse(mx, 0, rx, ry).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.75;
    b.circle(mx + Math.cos(a) * rx * r, Math.sin(a) * ry * r, 1.5 + rnd() * 2.5).fill({ color: c.pattern, alpha: 0.7 });
  }
  sheen(b, mx, 0, rx, ry, c);
  eye(b, mx - rx * 0.55, -ry * 0.75, 5);
  eye(b, mx - rx * 0.55, ry * 0.75, 5);
  root.addChild(b);
  return { x: mx + 4, y: 0, r: Math.min(ry * 0.62, 15) };
}

// ---------------------------------------------------------------- crab

function crab(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const legs = new Graphics();
  const legLen = v === 1 ? 44 : 26;
  const bodyRx = v === 2 ? 40 : v === 3 ? 26 : v === 1 ? 16 : 22;
  const bodyRy = v === 2 ? 12 : v === 3 ? 18 : v === 1 ? 16 : 28;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x0 = -bodyRx * 0.5 + i * (bodyRx * 0.33);
      const y0 = side * bodyRy * 0.8;
      const kx = x0 - 6 + i * 2, ky = side * (bodyRy + legLen * 0.55);
      legs.moveTo(x0, y0).lineTo(kx, ky).lineTo(kx - 10 + i * 3, side * (bodyRy + legLen))
        .stroke({ width: 3.5, color: c.accent, cap: "round", join: "round" });
    }
  }
  root.addChild(legs);
  // Claws
  const claws = new Graphics();
  const big = v === 3 ? 1.4 : v === 2 ? 0.7 : 1;
  for (const side of [-1, 1]) {
    const ax = bodyRx * 0.6, ay = side * bodyRy * 0.6;
    const cx = bodyRx + 18 * big, cy = side * (bodyRy * 0.6 + 12 * big);
    claws.moveTo(ax, ay).lineTo(cx - 8, cy).stroke({ width: 5, color: c.accent, cap: "round" });
    claws.ellipse(cx, cy, 13 * big, 8 * big).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
    claws.moveTo(cx + 2, cy).lineTo(cx + 14 * big, cy - side * 3).stroke({ width: 3, color: c.outline, alpha: 0.7 });
  }
  if (v === 3) {
    // Lobster antennae
    for (const side of [-1, 1]) {
      claws.moveTo(bodyRx, side * 5).quadraticCurveTo(bodyRx + 50, side * 25, bodyRx + 70, side * 45)
        .stroke({ width: 1.5, color: c.outline, alpha: 0.6 });
    }
  }
  root.addChild(claws);
  const b = new Graphics();
  if (v === 0) {
    // Hermit crab shell behind the body
    b.circle(-bodyRx - 8, 0, 24).fill(c.pattern).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
    let r = 22;
    b.moveTo(-bodyRx - 8 + r, 0);
    for (let a = 0; a < Math.PI * 5; a += 0.3) {
      r = 22 * (1 - a / (Math.PI * 5.5));
      b.lineTo(-bodyRx - 8 + Math.cos(a) * r, Math.sin(a) * r);
    }
    b.stroke({ width: 2.5, color: darken(c.pattern, 0.35), alpha: 0.8 });
  }
  if (v === 2 || v === 3) {
    // Segmented tail (mantis shrimp / lobster)
    for (let i = 0; i < 5; i++) {
      const x = -bodyRx - 6 - i * 11;
      b.ellipse(x, 0, 8, bodyRy * (1 - i * 0.12)).fill(i % 2 ? c.body : lighten(c.body, 0.12))
        .stroke({ width: 1.5, color: c.outline, alpha: 0.5 });
    }
    b.moveTo(-bodyRx - 60, 0).lineTo(-bodyRx - 74, -12).lineTo(-bodyRx - 74, 12).closePath().fill(c.accent);
  }
  b.ellipse(0, 0, bodyRx, bodyRy).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.7;
    b.circle(Math.cos(a) * bodyRx * r, Math.sin(a) * bodyRy * r, 2 + rnd() * 2).fill({ color: c.pattern, alpha: 0.6 });
  }
  sheen(b, 0, 0, bodyRx, bodyRy, c);
  eye(b, bodyRx * 0.85, -6, 3.5);
  eye(b, bodyRx * 0.85, 6, 3.5);
  root.addChild(b);
  return { x: -bodyRx * 0.1, y: 0, r: Math.min(bodyRx, bodyRy) * 0.62 };
}

// ---------------------------------------------------------------- turtle

function turtle(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const skin = c.accent;
  const RX = v === 2 ? 40 : 34, RY = v === 2 ? 27 : 29;
  rotEllipse(root, 18, -RY - 4, 24, 8, -0.6, skin, darken(skin, 0.5));
  rotEllipse(root, 18, RY + 4, 24, 8, 0.6, skin, darken(skin, 0.5));
  rotEllipse(root, -RX + 4, -RY + 6, 12, 6, 0.6, skin, darken(skin, 0.5));
  rotEllipse(root, -RX + 4, RY - 6, 12, 6, -0.6, skin, darken(skin, 0.5));
  const b = new Graphics();
  b.ellipse(RX + 8, 0, 13, 10).fill(skin).stroke({ width: OUTLINE, color: darken(skin, 0.5), alpha: 0.5 });
  eye(b, RX + 14, -6, 3);
  eye(b, RX + 14, 6, 3);
  b.ellipse(0, 0, RX, RY).fill(c.body).stroke({ width: OUTLINE + 1, color: c.outline, alpha: 0.6 });
  if (v === 2) {
    for (const y of [-RY * 0.55, 0, RY * 0.55]) {
      b.moveTo(-RX * 0.85, y * 0.85).quadraticCurveTo(0, y * 1.08, RX * 0.85, y * 0.85)
        .stroke({ width: 2.5, color: c.pattern, alpha: 0.8 });
    }
  } else {
    // Scutes: a central row plus two side rows
    const sc = (x: number, y: number, r: number) => {
      const pts: number[] = [];
      for (let k = 0; k < 6; k++) pts.push(x + Math.cos((k / 6) * Math.PI * 2) * r, y + Math.sin((k / 6) * Math.PI * 2) * r * 0.85);
      b.poly(pts).fill({ color: v === 1 ? lighten(c.pattern, rnd() * 0.3) : c.pattern, alpha: 0.75 })
        .stroke({ width: 1.5, color: c.outline, alpha: 0.5 });
    };
    for (const x of [-RX * 0.5, 0, RX * 0.5]) sc(x, 0, 9);
    for (const x of [-RX * 0.28, RX * 0.28]) { sc(x, -RY * 0.55, 7.5); sc(x, RY * 0.55, 7.5); }
  }
  sheen(b, 0, 0, RX, RY, c);
  root.addChild(b);
  return { x: 0, y: 0, r: Math.min(RY * 0.5, 14) };
}

// ---------------------------------------------------------------- jellyfish

function jelly(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const R = v === 2 ? 30 : 27;
  const t = new Graphics();
  const n = v === 2 ? 16 : 8;
  for (let i = 0; i < n; i++) {
    const y0 = (i / (n - 1) - 0.5) * R * 1.4;
    const len = (v === 2 ? 70 : 50) + rnd() * 20;
    const w = 6 + rnd() * 6;
    t.moveTo(-R * 0.6, y0)
      .bezierCurveTo(-R - len * 0.3, y0 + w, -R - len * 0.6, y0 - w, -R - len, y0 + w * 0.5)
      .stroke({ width: v === 2 ? 1.5 : 2.5, color: c.accent, alpha: 0.7, cap: "round" });
  }
  // Oral arms
  for (const y of [-6, 6]) {
    t.moveTo(-R * 0.4, y).bezierCurveTo(-R - 10, y * 3, -R - 20, -y * 2, -R - 34, y)
      .stroke({ width: 6, color: c.pattern, alpha: 0.55, cap: "round" });
  }
  root.addChild(t);
  const b = new Graphics();
  if (v === 1) b.roundRect(-R, -R, R * 2, R * 2, R * 0.45).fill({ color: c.body, alpha: 0.88 });
  else b.circle(0, 0, R).fill({ color: c.body, alpha: 0.88 });
  b.stroke({ width: OUTLINE, color: c.outline, alpha: 0.45 });
  b.circle(0, 0, R * 0.82).stroke({ width: 3, color: c.highlight, alpha: 0.35 });
  if (v === 0) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      b.circle(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.2).stroke({ width: 3, color: c.pattern, alpha: 0.85 });
    }
  } else {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.moveTo(0, 0).lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92).stroke({ width: 1.5, color: c.pattern, alpha: 0.6 });
    }
  }
  sheen(b, 0, 0, R, R, c);
  root.addChild(b);
  return { x: 0, y: 0, r: R * 0.5 };
}

// ---------------------------------------------------------------- eel

function eel(root: Container, c: CreatureColors, v: number, rnd: () => number): CreatureArt["emblem"] {
  const W = [11, 6, 10][v];
  const len = [110, 120, 105][v];
  const phase = rnd() * Math.PI * 2;
  const steps = 26;
  const spine: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -len * 0.7 + t * len;
    spine.push([x, Math.sin(t * Math.PI * 2.2 + phase) * 10 * (1 - t * 0.7)]);
  }
  const width = (t: number) => W * (0.25 + 0.75 * Math.min(1, t * 1.6)) * (t > 0.92 ? 0.85 : 1);
  // Outline: walk the spine forward on the left side, back on the right side.
  const offset = (i: number, side: 1 | -1): [number, number] => {
    const [x, y] = spine[i];
    const [nx, ny] = spine[Math.min(steps, i + 1)];
    const [px, py] = spine[Math.max(0, i - 1)];
    const dx = nx - px, dy = ny - py, d = Math.hypot(dx, dy) || 1;
    const w = width(i / steps) * side;
    return [x - (dy / d) * w, y + (dx / d) * w];
  };
  const left: number[] = [];
  const rightPts: number[] = [];
  for (let i = 0; i <= steps; i++) left.push(...offset(i, 1));
  for (let i = steps; i >= 0; i--) rightPts.push(...offset(i, -1));
  const g = new Graphics();
  if (v === 1) {
    // Ribbon eel fin fringe
    const fl: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const [x, y] = spine[i];
      fl.push(x, y - width(i / steps) - 3);
    }
    for (let i = steps; i >= 0; i--) {
      const [x, y] = spine[i];
      fl.push(x, y + width(i / steps) + 3);
    }
    g.poly(fl).fill({ color: c.pattern, alpha: 0.9 });
  }
  g.poly([...left, ...rightPts]).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
  if (v === 0) {
    for (let i = 0; i < 16; i++) {
      const [x, y] = spine[2 + Math.floor(rnd() * (steps - 4))];
      g.circle(x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * W, 1.5 + rnd() * 1.8).fill({ color: c.pattern, alpha: 0.8 });
    }
  } else if (v === 2) {
    for (let i = 3; i < steps - 2; i += 3) {
      const [x, y] = spine[i];
      g.moveTo(x - 4, y - W * 0.6).lineTo(x + 2, y).lineTo(x - 2, y).lineTo(x + 4, y + W * 0.6)
        .stroke({ width: 2, color: c.pattern, alpha: 0.9 });
    }
  }
  const [hx, hy] = spine[steps];
  g.ellipse(hx + 2, hy, W * 1.25, W * 1.05).fill(c.body).stroke({ width: OUTLINE, color: c.outline, alpha: 0.6 });
  eye(g, hx + 5, hy - W * 0.55, 3);
  eye(g, hx + 5, hy + W * 0.55, 3);
  root.addChild(g);
  const [ex, ey] = spine[Math.floor(steps * 0.68)];
  return { x: ex, y: ey, r: Math.max(7, W * 0.9) };
}

const DRAW: Record<FamilyId, (root: Container, c: CreatureColors, v: number, rnd: () => number) => CreatureArt["emblem"]> = {
  fish, octopus, crab, turtle, jelly, eel,
};

export function drawCreature(spec: ArtSpec): CreatureArt {
  const root = new Container();
  const colors = creatureColors(spec.palette, spec.hue);
  const rnd = mulberry32(spec.patternSeed);
  const emblem = DRAW[spec.family](root, colors, spec.variantIndex, rnd);
  return { root, emblem };
}
