/**
 * The city world renderer (PixiJS v8 + pixi-viewport).
 * React owns the DOM UI; this module owns the canvas and talks back via callbacks.
 * Creatures walk only on the sand paths: they route between crossings, keep to the right-hand
 * lane, queue behind slower creatures and pause now and then at crossings.
 */
import {
  Application, BitmapText, Circle, Container, CullerPlugin, Graphics, Sprite,
  Texture, TilingSprite, extensions, type FederatedPointerEvent,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { WORLD } from "@/config/balance";
import { BUILDINGS, PLAZA, ROADS, edgeLength, edgeWidth, nodesIn, pointAlong, route } from "@/lib/city";
import type { WorldCreature } from "@/lib/world";
import { WORLD_SIZE, ZONES, type ZoneId } from "@/lib/zones";
import { buildCity } from "./city";
import { drawCreature } from "./creatures";
import { causticTexture, paintBackdrop, softDotTexture, vignetteTexture } from "./scenery";

extensions.add(CullerPlugin);

export interface ReefCallbacks {
  onSelect(id: string | null): void;
  onSelectBuilding(id: string): void;
}

export interface ReefController {
  setCreatures(list: WorldCreature[]): void;
  select(id: string | null, focus?: boolean): void;
  selectBuilding(id: string | null, focus?: boolean): void;
  /** Creatures currently walking near a building (ids, nearest first). */
  creaturesNear(buildingId: string): string[];
  zoomBy(factor: number): void;
  showAll(): void;
  destroy(): void;
}

/** Base walking speed (world px / s) per family before market and mood modifiers. */
const BASE_SPEED: Record<WorldCreature["family"], number> = {
  fish: 70, eel: 56, octopus: 48, turtle: 40, crab: 38, jelly: 30,
};
/** Side-to-side swim wobble (radians) per family. */
const WOBBLE: Record<WorldCreature["family"], number> = {
  fish: 0.12, eel: 0.2, octopus: 0.05, turtle: 0.05, crab: 0, jelly: 0,
};
const ART_SCALE = 0.55;

interface Species {
  texture: Texture;
  /** Art origin (0,0) as a fraction of the texture, so sprites rotate around the body. */
  anchor: { x: number; y: number };
  /** Key of the inputs the texture was baked from; rebake when it changes. */
  bakedKey: string;
  radius: number;
}

interface Walker {
  id: string;
  /** 0 = leader; school members trail their leader's footsteps. */
  member: number;
  data: WorldCreature;
  sprite: Sprite;
  shadow: Sprite;
  aura: Sprite | null;
  label: BitmapText | null;
  // Road position: on the edge from `from` to `to`, `t` of the way along.
  from: number;
  to: number;
  t: number;
  path: number[];
  /** Distance to keep to the right of the road's centre line (px). */
  lane: number;
  pause: number;
  /** District currently being visited, and how many more stops before choosing the next district. */
  dest: ZoneId;
  stops: number;
  /** Rendered position (eases toward the road position) and heading. */
  x: number;
  y: number;
  heading: number;
  speedNow: number;
  /** Leader's recent positions, for school members to follow. */
  trail: { x: number; y: number }[];
  phase: number;
  fade: number;
  removing: boolean;
}

const node = (id: number) => ROADS.nodes[id];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Next district to visit: usually home, sometimes a trip elsewhere (more often in a Frenzy). */
function pickDistrict(c: WorldCreature): ZoneId {
  const roam = c.mood === "FRENZY" ? WORLD.roamChanceFrenzy : WORLD.roamChance;
  if (Math.random() >= roam) return c.zone;
  return pick(ZONES.filter((z) => z.id !== c.zone)).id;
}

const angleLerp = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export async function createReef(
  el: HTMLElement,
  cb: ReefCallbacks,
  opts: { fontFamily?: string } = {},
): Promise<ReefController> {
  const fontFamily = opts.fontFamily ?? "system-ui, sans-serif";
  const app = new Application();
  await app.init({
    resizeTo: el,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    background: 0x1aa6b8,
    preference: "webgl",
  });
  el.appendChild(app.canvas);
  app.canvas.style.touchAction = "none";
  await document.fonts?.ready;

  const viewport = new Viewport({
    screenWidth: el.clientWidth,
    screenHeight: el.clientHeight,
    worldWidth: WORLD_SIZE.w,
    worldHeight: WORLD_SIZE.h,
    events: app.renderer.events,
    passiveWheel: false,
  });
  /** Smallest zoom that still fills the screen (no empty bands around the city). */
  const minScale = () => Math.max(el.clientWidth / WORLD_SIZE.w, el.clientHeight / WORLD_SIZE.h);
  viewport
    .drag()
    .pinch()
    .wheel({ smooth: 4 })
    .decelerate({ friction: 0.93 })
    .clampZoom({ minScale: minScale(), maxScale: 2.6 })
    .clamp({ direction: "all", underflow: "center" });
  app.stage.addChild(viewport);

  const dot = softDotTexture();
  let pointerDown: { x: number; y: number } | null = null;
  const wasDrag = (e: FederatedPointerEvent) => !!pointerDown && Math.hypot(e.global.x - pointerDown.x, e.global.y - pointerDown.y) > 10;

  // World layers
  viewport.addChild(paintBackdrop());
  const city = buildCity({
    fontFamily,
    dot,
    onTap: (id, e) => {
      if (!wasDrag(e)) cb.onSelectBuilding(id);
    },
  });
  viewport.addChild(city.root);
  const shadowLayer = new Container();
  const auraLayer = new Container();
  const creatureLayer = new Container();
  const fxLayer = new Container();
  shadowLayer.interactiveChildren = false;
  auraLayer.interactiveChildren = false;
  fxLayer.interactiveChildren = false;
  viewport.addChild(shadowLayer, auraLayer, creatureLayer, fxLayer);

  // Screen-space light
  const causticTex = causticTexture();
  const causticA = new TilingSprite({ texture: causticTex, width: app.screen.width, height: app.screen.height });
  const causticB = new TilingSprite({ texture: causticTex, width: app.screen.width, height: app.screen.height });
  for (const c of [causticA, causticB]) {
    c.blendMode = "add";
    c.eventMode = "none";
    app.stage.addChild(c);
  }
  causticA.alpha = 0.09;
  causticB.alpha = 0.06;
  causticA.tileScale.set(1.5);
  causticB.tileScale.set(2.4);

  const particles: { s: Sprite; depth: number; vx: number; vy: number; ph: number }[] = [];
  const particleLayer = new Container();
  particleLayer.eventMode = "none";
  app.stage.addChild(particleLayer);
  for (let i = 0; i < 120; i++) {
    const s = new Sprite(dot);
    s.anchor.set(0.5);
    const depth = 0.4 + Math.random() * 1.2;
    s.scale.set(0.05 + depth * 0.06);
    s.alpha = 0.18 + Math.random() * 0.3;
    s.position.set(Math.random() * app.screen.width, Math.random() * app.screen.height);
    particleLayer.addChild(s);
    particles.push({ s, depth, vx: 6 + Math.random() * 10, vy: -3 + Math.random() * 6, ph: Math.random() * 6 });
  }
  const vignette = new Sprite(vignetteTexture());
  vignette.eventMode = "none";
  app.stage.addChild(vignette);

  const fitScreen = () => {
    const { width, height } = app.screen;
    for (const c of [causticA, causticB]) { c.width = width; c.height = height; }
    vignette.width = width;
    vignette.height = height;
  };
  fitScreen();
  app.renderer.on("resize", (w: number, h: number) => {
    viewport.resize(w, h, WORLD_SIZE.w, WORLD_SIZE.h);
    viewport.plugins.get("clamp-zoom")?.destroy();
    viewport.clampZoom({ minScale: minScale(), maxScale: 2.6 });
    fitScreen();
  });

  // Start centred on Shell Plaza with the neighbouring districts in view.
  viewport.setZoom(Math.max(minScale(), Math.min(1, el.clientWidth / 2400)), true);
  viewport.moveCenter(PLAZA.x, PLAZA.y);

  // Selection ring
  const ring = new Graphics().circle(0, 0, 1).stroke({ width: 0.06, color: 0xffffff, alpha: 0.95 });
  ring.visible = false;
  fxLayer.addChild(ring);

  const species = new Map<string, Species>();
  const logos = new Map<string, Texture | "loading" | "failed">();
  const walkers = new Map<string, Walker[]>();
  let selected: string | null = null;
  let destroyed = false;

  app.stage.eventMode = "static";
  app.stage.on("pointerdown", (e: FederatedPointerEvent) => (pointerDown = { x: e.global.x, y: e.global.y }));
  viewport.on("drag-start", () => viewport.plugins.remove("follow"));

  const bakedKey = (c: WorldCreature, logo: boolean) =>
    `${c.family}:${c.variantIndex}:${c.palette.join(",")}:${c.hue}:${logo ? 1 : 0}`;

  function bake(c: WorldCreature): Species {
    const logoTex = logos.get(c.id);
    const hasLogo = logoTex instanceof Texture;
    const key = bakedKey(c, hasLogo);
    const existing = species.get(c.id);
    if (existing && existing.bakedKey === key) return existing;

    const art = drawCreature(c);
    if (hasLogo) {
      const { x, y, r } = art.emblem;
      const back = new Graphics().circle(x, y, r + 2.5).fill({ color: 0xffffff, alpha: 0.92 });
      const s = new Sprite(logoTex);
      s.anchor.set(0.5);
      s.width = s.height = r * 2;
      s.position.set(x, y);
      art.root.addChild(back, s);
    }
    const b = art.root.getLocalBounds();
    const texture = app.renderer.generateTexture({ target: art.root, resolution: 2, antialias: true });
    const anchor = { x: -b.x / b.width, y: -b.y / b.height };
    art.root.destroy({ children: true });
    const sp: Species = { texture, anchor, bakedKey: key, radius: Math.max(b.width, b.height) * 0.42 };
    if (existing) {
      // Swap in the new texture for every sprite of this species
      for (const s of walkers.get(c.id) ?? []) {
        s.sprite.texture = texture;
        s.sprite.anchor.set(anchor.x, anchor.y);
        s.sprite.hitArea = new Circle(0, 0, sp.radius);
      }
      existing.texture.destroy(true);
    }
    species.set(c.id, sp);
    return sp;
  }

  // Logos load with limited concurrency, then the species is rebaked with its emblem.
  const logoQueue: WorldCreature[] = [];
  let logoActive = 0;
  function queueLogo(c: WorldCreature) {
    if (!c.hasLogo || logos.has(c.id)) return;
    logos.set(c.id, "loading");
    logoQueue.push(c);
    pumpLogos();
  }
  function pumpLogos() {
    while (logoActive < 6 && logoQueue.length) {
      const c = logoQueue.shift()!;
      logoActive++;
      fetch(`/api/logo/${c.id}`)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => createImageBitmap(b))
        .then((bmp) => {
          if (destroyed) return;
          logos.set(c.id, Texture.from(bmp));
          bake(walkers.get(c.id)?.[0]?.data ?? c);
        })
        .catch(() => logos.set(c.id, "failed"))
        .finally(() => {
          logoActive--;
          if (!destroyed) pumpLogos();
        });
    }
  }

  // ---------------------------------------------------------------- walking

  /** Plan the next leg: a few stops around the current district, then maybe a trip elsewhere. */
  function plan(w: Walker) {
    if (w.stops <= 0) {
      w.dest = pickDistrict(w.data);
      w.stops = 2 + Math.floor(Math.random() * 3);
    }
    w.stops--;
    const choices = nodesIn(w.dest).filter((n) => n !== w.to);
    const target = choices.length ? pick(choices) : pick(ROADS.adj[w.to]);
    w.path = route(w.to, target);
    if (!w.path.length) w.path = [pick(ROADS.adj[w.to])];
    // Linger at the crossing now and then, as if visiting a building.
    if (node(w.to).zone === w.dest && Math.random() < 0.35) w.pause = 0.8 + Math.random() * 2.8;
  }

  /** Where a walker is on its winding path, offset into its lane. */
  function roadPoint(w: Walker) {
    const len = edgeLength(w.from, w.to);
    const p = pointAlong(w.from, w.to, w.t * len);
    // Keep right: offset to the right of the direction of travel.
    return { x: p.x - p.uy * w.lane, y: p.y + p.ux * w.lane, ux: p.ux, uy: p.uy, len };
  }

  function makeWalker(c: WorldCreature, member: number, justHatched: boolean): Walker {
    const sp = bake(c);
    const sprite = new Sprite(sp.texture);
    sprite.anchor.set(sp.anchor.x, sp.anchor.y);
    sprite.cullable = true;
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.hitArea = new Circle(0, 0, sp.radius);
    sprite.on("pointertap", (e: FederatedPointerEvent) => {
      if (!wasDrag(e)) cb.onSelect(c.id);
    });
    sprite.on("pointerover", () => setLabel(c.id, true));
    sprite.on("pointerout", () => setLabel(c.id, false));
    const shadow = new Sprite(dot);
    shadow.anchor.set(0.5);
    shadow.tint = 0x002a3a;
    shadow.alpha = 0.22;
    shadow.cullable = true;

    // Start somewhere on the streets of the home district (new hatches start at the fountain).
    let from: number, to: number, t: number;
    if (justHatched) {
      to = pick(ROADS.plazaRing);
      from = pick(ROADS.adj[to]);
      t = 1;
    } else {
      from = pick(nodesIn(c.zone));
      to = pick(ROADS.adj[from]);
      t = Math.random();
    }
    const width = edgeWidth(from, to);
    const w: Walker = {
      id: c.id, member, data: c, sprite, shadow, aura: null, label: null,
      from, to, t, path: [], lane: width * (0.12 + Math.random() * 0.24), pause: 0,
      dest: c.zone, stops: 0, x: 0, y: 0, heading: 0, speedNow: 0, trail: [],
      phase: Math.random() * 10, fade: justHatched ? 0 : 1, removing: false,
    };
    const p = roadPoint(w);
    w.x = justHatched ? PLAZA.x : p.x;
    w.y = justHatched ? PLAZA.y : p.y;
    w.heading = Math.atan2(p.uy, p.ux);
    plan(w);
    shadowLayer.addChild(shadow);
    creatureLayer.addChild(sprite);
    applyLook(w);
    return w;
  }

  /** Mood visuals that don't need a rebake. */
  function applyLook(w: Walker) {
    const c = w.data;
    w.sprite.tint = c.mood === "SULKING" ? 0xb4c2d4 : 0xffffff;
    const wantsAura = c.mood === "FRENZY" || c.newArrival;
    if (wantsAura && !w.aura) {
      w.aura = new Sprite(dot);
      w.aura.anchor.set(0.5);
      w.aura.blendMode = "add";
      w.aura.cullable = true;
      auraLayer.addChild(w.aura);
    } else if (!wantsAura && w.aura) {
      w.aura.destroy();
      w.aura = null;
    }
    if (w.aura) w.aura.tint = c.mood === "FRENZY" ? 0xff7043 : 0xffe07a;
  }

  function setLabel(id: string, on: boolean) {
    const lead = walkers.get(id)?.[0];
    if (!lead) return;
    if (on && !lead.label) {
      lead.label = new BitmapText({
        text: `$${lead.data.ticker}`,
        style: { fontFamily, fontSize: 22, fill: 0xffffff, fontWeight: "600", stroke: { color: 0x053845, width: 5 } },
      });
      lead.label.anchor.set(0.5, 1);
      fxLayer.addChild(lead.label);
    }
    if (lead.label) lead.label.visible = on || id === selected;
  }

  function removeWalker(w: Walker) {
    w.sprite.destroy();
    w.shadow.destroy();
    w.aura?.destroy();
    w.label?.destroy();
  }

  let initialised = false;
  function setCreatures(list: WorldCreature[]) {
    const ids = new Set(list.map((c) => c.id));
    for (const [id, group] of walkers) if (!ids.has(id)) for (const w of group) w.removing = true;
    for (const c of list) {
      const group = walkers.get(c.id) ?? [];
      const isNew = group.length === 0;
      group.forEach((w, i) => {
        const homeChanged = w.data.zone !== c.zone;
        w.data = c;
        w.removing = i >= c.schoolSize; // extra school members fade out, then the ticker removes them
        if (homeChanged) w.stops = 0; // head for the new home district at the next crossing
        applyLook(w);
      });
      if (group.length) bake(c);
      while (group.length < c.schoolSize) group.push(makeWalker(c, group.length, initialised && isNew));
      walkers.set(c.id, group);
      queueLogo(c);
    }
    initialised = true;
  }

  /** Spatial grid of leaders, for queueing behind slower creatures. */
  const CELL = 200;
  const grid = new Map<number, Walker[]>();
  function rebuildGrid() {
    grid.clear();
    for (const group of walkers.values()) {
      const w = group[0];
      if (!w) continue;
      const k = Math.floor(w.x / CELL) * 4096 + Math.floor(w.y / CELL);
      const cell = grid.get(k);
      if (cell) cell.push(w);
      else grid.set(k, [w]);
    }
  }
  /** True if another creature is just ahead in the same lane. */
  function blocked(w: Walker, ux: number, uy: number): boolean {
    const cx = Math.floor(w.x / CELL), cy = Math.floor(w.y / CELL);
    const space = WORLD.personalSpace * w.data.scale;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const o of grid.get(gx * 4096 + gy) ?? []) {
          if (o === w) continue;
          // Only queue behind creatures going the same way (or standing still), never oncoming traffic.
          const sameWay = o.speedNow < 1 || Math.cos(o.heading - Math.atan2(uy, ux)) > 0.3;
          if (!sameWay) continue;
          const dx = o.x - w.x, dy = o.y - w.y;
          const ahead = dx * ux + dy * uy;
          const side = Math.abs(-dx * uy + dy * ux);
          if (ahead > 0 && ahead < space && side < 26) return true;
        }
      }
    }
    return false;
  }

  function stepLeader(w: Walker, dt: number) {
    const c = w.data;
    if (w.pause > 0) {
      w.pause -= dt;
      w.speedNow = 0;
      return;
    }
    const mood = c.mood === "FRENZY" ? 1.45 : c.mood === "SULKING" ? 0.65 : 1;
    let speed = BASE_SPEED[c.family] * c.spd * mood * (1.12 - c.scale * 0.15);
    const p = roadPoint(w);
    if (blocked(w, p.ux, p.uy)) speed *= 0.2;
    w.speedNow += (speed - w.speedNow) * Math.min(1, dt * 3);
    w.t += (w.speedNow * dt) / p.len;
    while (w.t >= 1) {
      const over = (w.t - 1) * p.len;
      w.from = w.to;
      if (!w.path.length) plan(w);
      w.to = w.path.shift()!;
      w.t = over / (edgeLength(w.from, w.to) || 1);
      // Lane follows the road width (avenues are wider than streets).
      const width = edgeWidth(w.from, w.to);
      w.lane = Math.min(w.lane, width * 0.38);
      if (w.pause > 0) break;
    }
  }

  let t = 0;
  let trailClock = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    t += dt;
    city.animate(t, viewport.scale.x);

    // Screen-space light follows the camera a little (parallax)
    const vx = viewport.left, vy = viewport.top, sc = viewport.scale.x;
    causticA.tilePosition.set(-vx * sc * 0.6 + t * 7, -vy * sc * 0.6 + t * 4);
    causticB.tilePosition.set(-vx * sc * 0.8 - t * 5, -vy * sc * 0.8 + t * 6);
    const W = app.screen.width, H = app.screen.height;
    for (const p of particles) {
      p.s.x += p.vx * dt * p.depth;
      p.s.y += (p.vy + Math.sin(t + p.ph) * 4) * dt * p.depth;
      if (p.s.x > W + 10) p.s.x = -10;
      if (p.s.y > H + 10) p.s.y = -10;
      if (p.s.y < -10) p.s.y = H + 10;
    }

    rebuildGrid();
    trailClock += dt;
    const recordTrail = trailClock >= 0.08;
    if (recordTrail) trailClock = 0;

    for (const [id, group] of walkers) {
      for (let i = group.length - 1; i >= 0; i--) {
        const w = group[i];
        const c = w.data;
        w.fade += ((w.removing ? 0 : 1) - w.fade) * Math.min(1, dt * 1.5);
        if (w.removing && w.fade < 0.02) {
          removeWalker(w);
          group.splice(i, 1);
          continue;
        }

        let tx: number, ty: number;
        const lead = group[0];
        if (w.member > 0 && lead && lead !== w) {
          // Follow the leader's footsteps, a little behind and off to the side.
          const back = w.member * 9;
          const tr = lead.trail;
          const pt = tr[Math.max(0, tr.length - 1 - back)] ?? { x: lead.x, y: lead.y };
          const side = (w.member % 2 ? 1 : -1) * 16;
          tx = pt.x - Math.sin(lead.heading) * side;
          ty = pt.y + Math.cos(lead.heading) * side;
        } else {
          stepLeader(w, dt);
          const p = roadPoint(w);
          tx = p.x;
          ty = p.y;
        }
        // Ease toward the road position (smooths corners and the walk out of the fountain).
        const ease = Math.min(1, dt * (w.fade < 0.9 && w.member === 0 ? 2 : 9));
        const ox = w.x, oy = w.y;
        w.x += (tx - w.x) * ease;
        w.y += (ty - w.y) * ease;
        const moved = Math.hypot(w.x - ox, w.y - oy);
        if (moved > 0.05) w.heading = angleLerp(w.heading, Math.atan2(w.y - oy, w.x - ox), Math.min(1, dt * 6));
        if (recordTrail && w.member === 0) {
          w.trail.push({ x: w.x, y: w.y });
          if (w.trail.length > 40) w.trail.shift();
        }

        const speed = moved / dt;
        const base = ART_SCALE * c.scale * (w.member ? 0.78 : 1);
        const sw = Math.sin(t * (c.mood === "FRENZY" ? 9 : 5.5) + w.phase);
        let rot = w.heading + sw * WOBBLE[c.family] * Math.min(1, speed / 20 + 0.2);
        if (c.family === "crab") rot = w.heading - Math.PI / 2; // crabs scuttle sideways
        w.sprite.position.set(w.x, w.y);
        w.sprite.rotation = rot;
        if (c.family === "jelly") {
          const p = Math.sin(t * 2.4 + w.phase);
          w.sprite.scale.set(base * (1 + p * 0.05), base * (1 - p * 0.07));
        } else {
          w.sprite.scale.set(base);
        }
        w.sprite.alpha = w.fade;
        w.shadow.position.set(w.x + 10 * c.scale, w.y + 14 * c.scale);
        w.shadow.scale.set(base * 1.5, base * 1.0);
        w.shadow.alpha = 0.22 * w.fade;
        if (w.aura) {
          w.aura.position.set(w.x, w.y);
          w.aura.scale.set(base * 3 * (1 + Math.sin(t * 3 + w.phase) * 0.08));
          w.aura.alpha = (c.mood === "FRENZY" ? 0.55 : 0.45) * w.fade;
        }
        if (w.label) {
          w.label.position.set(w.x, w.y - (species.get(w.id)?.radius ?? 40) * ART_SCALE * c.scale * 1.15 - 4);
          w.label.scale.set(1 / Math.max(0.6, viewport.scale.x));
        }
      }
      if (group.length === 0) {
        walkers.delete(id);
        species.get(id)?.texture.destroy(true);
        species.delete(id);
      }
    }

    // Selection ring follows the lead creature
    const lead = selected ? walkers.get(selected)?.[0] : null;
    if (lead) {
      ring.visible = true;
      ring.position.set(lead.x, lead.y);
      ring.scale.set((species.get(lead.id)?.radius ?? 40) * ART_SCALE * lead.data.scale * (1.15 + Math.sin(t * 4) * 0.04));
    } else {
      ring.visible = false;
    }
  });

  /** On phones the details sheet covers the lower half: keep the focus point in the upper half. */
  const sheetOffset = (scale: number) => (el.clientWidth < 760 ? (el.clientHeight * 0.25) / scale : 0);

  function select(id: string | null, focus = false) {
    const prev = selected;
    selected = id;
    if (prev && prev !== id) setLabel(prev, false);
    viewport.plugins.remove("follow");
    if (!id) return;
    city.setSelected(null);
    setLabel(id, true);
    const lead = walkers.get(id)?.[0];
    if (lead && focus) {
      const scale = Math.max(viewport.scale.x, 1.1);
      viewport.animate({
        position: { x: lead.x, y: lead.y + sheetOffset(scale) },
        scale,
        time: 700,
        ease: "easeInOutSine",
        callbackOnComplete: () => {
          if (selected === id && !destroyed) viewport.follow(lead.sprite, { radius: Math.min(el.clientWidth, el.clientHeight) / 4 });
        },
      });
    }
  }

  function selectBuilding(id: string | null, focus = false) {
    city.setSelected(id);
    if (!id) return;
    if (selected) select(null);
    const at = city.centerOf(id);
    if (at && focus) {
      const scale = Math.max(viewport.scale.x, 0.7);
      viewport.animate({ position: { x: at.x, y: at.y + sheetOffset(scale) }, scale, time: 700, ease: "easeInOutSine" });
    }
  }

  function creaturesNear(buildingId: string): string[] {
    const b = BUILDINGS.find((x) => x.id === buildingId);
    if (!b) return [];
    const reach = 140;
    const found: { id: string; d: number }[] = [];
    for (const [id, group] of walkers) {
      const w = group[0];
      if (!w || w.removing) continue;
      let best = Infinity;
      for (const r of b.rects) {
        const dx = Math.max(r.x - w.x, 0, w.x - (r.x + r.w)), dy = Math.max(r.y - w.y, 0, w.y - (r.y + r.h));
        best = Math.min(best, Math.hypot(dx, dy));
      }
      if (best <= reach) found.push({ id, d: best });
    }
    return found.sort((p, q) => p.d - q.d).map((f) => f.id);
  }

  return {
    setCreatures,
    select,
    selectBuilding,
    creaturesNear,
    zoomBy(f) {
      viewport.animate({ scale: Math.max(minScale(), Math.min(2.6, viewport.scale.x * f)), time: 250, ease: "easeOutSine" });
    },
    showAll() {
      viewport.plugins.remove("follow");
      viewport.animate({ position: { x: WORLD_SIZE.w / 2, y: WORLD_SIZE.h / 2 }, scale: minScale(), time: 600, ease: "easeInOutSine" });
    },
    destroy() {
      destroyed = true;
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    },
  };
}
