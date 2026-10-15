/**
 * The sunken city: winding sand paths creatures walk on, and the buildings between them.
 * The street plan is a grid underneath, but crossings are nudged off the grid and every path
 * meanders, so it reads as an old, grown city. Pure data, shared by the renderer (drawing,
 * walking) and the UI (building panels). Deterministic: same layout for every visitor.
 */
import { zoneAt, type ZoneId } from "@/lib/zones";

// ---------------------------------------------------------------- helpers

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- paths

export const GRID_X = [300, 900, 1500, 2100, 2700, 3300, 3900] as const;
export const GRID_Y = [300, 900, 1500, 2100, 2700] as const;
/** Path widths (world px). */
export const ROAD = { avenue: 104, street: 72 } as const;
/** How far crossings are nudged from the grid, and how much paths wander between them. */
const JITTER = 46;
const MEANDER = 30;
/** Clearance between a path's edge and a building. */
const MARGIN = 12;
/** Shell Plaza: a round sand ring around the Great Shell fountain. */
export const PLAZA = { x: 2100, y: 1500, ring: 170, radius: 245, fountain: 92 } as const;

export interface RoadNode extends Pt {
  id: number;
  zone: ZoneId;
}
export interface RoadEdge {
  a: number;
  b: number;
  width: number;
  /** Polyline from node a to node b. */
  pts: Pt[];
  /** Cumulative length at each point; cum[cum.length - 1] is the path length. */
  cum: number[];
}

/** Grid segments with no path (a large building spans them). Given as "col,row-col,row". */
const MISSING = new Set(["3,0-3,1", "5,2-5,3", "1,3-1,4", "3,3-3,4"]);

function polyline(pts: Pt[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return cum;
}

function wavyPath(a: Pt, b: Pt, rnd: () => number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const o1 = (rnd() * 2 - 1) * MEANDER, o2 = (rnd() * 2 - 1) * MEANDER;
  const c1 = { x: a.x + dx / 3 + nx * o1, y: a.y + dy / 3 + ny * o1 };
  const c2 = { x: a.x + (2 * dx) / 3 + nx * o2, y: a.y + (2 * dy) / 3 + ny * o2 };
  const pts: Pt[] = [];
  const steps = Math.max(8, Math.round(len / 25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}

function arcPath(from: number, to: number, r: number): Pt[] {
  const pts: Pt[] = [];
  let end = to;
  if (end < from) end += Math.PI * 2;
  for (let i = 0; i <= 10; i++) {
    const a = from + ((end - from) * i) / 10;
    pts.push({ x: PLAZA.x + Math.cos(a) * r, y: PLAZA.y + Math.sin(a) * r });
  }
  return pts;
}

function buildRoads() {
  const rnd = mulberry32(73021);
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const grid = new Map<string, number>();
  const add = (x: number, y: number) => {
    const id = nodes.length;
    nodes.push({ id, x, y, zone: zoneAt(x, y) });
    return id;
  };
  GRID_X.forEach((x, i) =>
    GRID_Y.forEach((y, j) => {
      if (x === PLAZA.x && y === PLAZA.y) return; // the plaza replaces this crossing
      grid.set(`${i},${j}`, add(x + (rnd() * 2 - 1) * JITTER, y + (rnd() * 2 - 1) * JITTER));
    }),
  );
  const link = (a: number, b: number, width: number, pts?: Pt[]) => {
    const p = pts ?? wavyPath(nodes[a], nodes[b], rnd);
    edges.push({ a, b, width, pts: p, cum: polyline(p) });
  };

  GRID_X.forEach((x, i) =>
    GRID_Y.forEach((y, j) => {
      const here = grid.get(`${i},${j}`);
      if (here == null) return;
      const right = grid.get(`${i + 1},${j}`);
      const down = grid.get(`${i},${j + 1}`);
      if (right != null && !MISSING.has(`${i},${j}-${i + 1},${j}`)) link(here, right, y === PLAZA.y ? ROAD.avenue : ROAD.street);
      if (down != null && !MISSING.has(`${i},${j}-${i},${j + 1}`)) link(here, down, x === PLAZA.x ? ROAD.avenue : ROAD.street);
    }),
  );

  // Plaza ring: eight stops on a circle around the fountain, joined by arcs.
  const ring: number[] = [];
  const angle = (k: number) => -Math.PI / 2 + (k * Math.PI) / 4;
  for (let k = 0; k < 8; k++) ring.push(add(PLAZA.x + Math.cos(angle(k)) * PLAZA.ring, PLAZA.y + Math.sin(angle(k)) * PLAZA.ring));
  for (let k = 0; k < 8; k++) link(ring[k], ring[(k + 1) % 8], ROAD.street, arcPath(angle(k), angle(k + 1), PLAZA.ring));
  // Avenues meet the ring at north, east, south and west.
  link(grid.get("3,1")!, ring[0], ROAD.avenue);
  link(grid.get("4,2")!, ring[2], ROAD.avenue);
  link(grid.get("3,3")!, ring[4], ROAD.avenue);
  link(grid.get("2,2")!, ring[6], ROAD.avenue);

  const adj: number[][] = nodes.map(() => []);
  const edgeOf = new Map<string, number>();
  edges.forEach((e, i) => {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
    edgeOf.set(`${e.a}-${e.b}`, i);
    edgeOf.set(`${e.b}-${e.a}`, i);
  });
  return { nodes, edges, adj, edgeOf, plazaRing: ring, grid };
}

export const ROADS = buildRoads();

export function edgeBetween(a: number, b: number): RoadEdge {
  return ROADS.edges[ROADS.edgeOf.get(`${a}-${b}`)!];
}
export const edgeWidth = (a: number, b: number) => edgeBetween(a, b)?.width ?? ROAD.street;
export const edgeLength = (a: number, b: number) => {
  const e = edgeBetween(a, b);
  return e.cum[e.cum.length - 1];
};

/** Point and unit direction at distance `s` along the path from node `from` toward node `to`. */
export function pointAlong(from: number, to: number, s: number): { x: number; y: number; ux: number; uy: number } {
  const e = edgeBetween(from, to);
  const len = e.cum[e.cum.length - 1];
  const forward = e.a === from;
  const d = Math.max(0, Math.min(len, forward ? s : len - s));
  let lo = 0, hi = e.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (e.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const p = e.pts[lo], q = e.pts[hi];
  const seg = e.cum[hi] - e.cum[lo] || 1;
  const k = (d - e.cum[lo]) / seg;
  let ux = (q.x - p.x) / seg, uy = (q.y - p.y) / seg;
  if (!forward) (ux = -ux), (uy = -uy);
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, ux, uy };
}

/** Shortest route (fewest crossings) between two nodes, excluding the start. */
export function route(from: number, to: number): number[] {
  if (from === to) return [];
  const prev = new Int32Array(ROADS.nodes.length).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === to) break;
    for (const nb of ROADS.adj[cur]) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (prev[to] === -1) return [];
  const path: number[] = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c);
  return path.reverse();
}

export const nodesIn = (zone: ZoneId) => ROADS.nodes.filter((n) => n.zone === zone).map((n) => n.id);

const ringSet = new Set(ROADS.plazaRing);
const isRingArc = (e: RoadEdge) => ringSet.has(e.a) && ringSet.has(e.b);

/**
 * The buildable area of the blocks between grid columns c0..c1 and rows r0..r1: the grid cell,
 * with each side pushed in past the winding path that runs along it, and clear of the plaza.
 */
export function blockArea(c0: number, r0: number, c1 = c0, r1 = r0): Rect {
  const X0 = GRID_X[c0], X1 = GRID_X[c1 + 1], Y0 = GRID_Y[r0], Y1 = GRID_Y[r1 + 1];
  let x0: number = X0, x1: number = X1, y0: number = Y0, y1: number = Y1;
  const pad = 90;
  for (const e of ROADS.edges) {
    if (isRingArc(e)) continue; // inside the plaza disc, handled below
    const r = e.width / 2 + MARGIN;
    for (const p of e.pts) {
      if (p.x < X0 - pad || p.x > X1 + pad || p.y < Y0 - pad || p.y > Y1 + pad) continue;
      // Each path point only constrains the side of the cell it runs along.
      const d = [Math.abs(p.x - X0), Math.abs(p.x - X1), Math.abs(p.y - Y0), Math.abs(p.y - Y1)];
      const side = d.indexOf(Math.min(...d));
      if (side === 0) x0 = Math.max(x0, p.x + r);
      else if (side === 1) x1 = Math.min(x1, p.x - r);
      else if (side === 2) y0 = Math.max(y0, p.y + r);
      else y1 = Math.min(y1, p.y - r);
    }
  }
  // The plaza disc: give up whichever side costs least.
  const R = PLAZA.radius + MARGIN;
  const nx = Math.max(x0, Math.min(PLAZA.x, x1)), ny = Math.max(y0, Math.min(PLAZA.y, y1));
  if (Math.hypot(PLAZA.x - nx, PLAZA.y - ny) < R) {
    const moves = [PLAZA.x + R - x0, x1 - (PLAZA.x - R), PLAZA.y + R - y0, y1 - (PLAZA.y - R)];
    const m = Math.min(...moves);
    const side = moves.indexOf(m);
    if (side === 0) x0 += m;
    else if (side === 1) x1 -= m;
    else if (side === 2) y0 += m;
    else y1 -= m;
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Distance from a point to the nearest path edge (negative = on a path). */
export function distanceToPaths(x: number, y: number): number {
  let best = Infinity;
  for (const e of ROADS.edges) for (const p of e.pts) best = Math.min(best, Math.hypot(p.x - x, p.y - y) - e.width / 2);
  return best;
}

// ---------------------------------------------------------------- buildings

export type BuildingKind =
  | "palace" | "plaza" | "hall" | "temple" | "archive" | "vents" | "market" | "beacon"
  | "racetrack" | "gardens" | "docks" | "gate"
  | "villa" | "domehouse" | "tower" | "cottage" | "shrine" | "workshop" | "grotto" | "grove";

export interface Fact {
  label: string;
  value: string;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  zone: ZoneId;
  /** Footprint(s), axis-aligned; also the click area. */
  rects: Rect[];
  /** The ground this building sits on (its yard). */
  lot: Rect;
  landmark: boolean;
  /** One-line summary. */
  description: string;
  /** A paragraph of history. */
  lore: string;
  /** What you'd find inside or around it. */
  features: string[];
  facts: Fact[];
  /** What happens here in the game (now or planned). */
  detail?: string;
  link?: { href: string; label: string };
  seed: number;
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });

interface LandmarkDef extends Omit<Building, "zone" | "seed" | "rects" | "lot" | "landmark"> {
  block: [number, number, number?, number?];
}

const LANDMARKS: LandmarkDef[] = [
  {
    id: "palace", kind: "palace", name: "Palace of Tides", block: [2, 0, 3, 0],
    description: "The great domed palace at the head of the avenue, seat of the Reef Council.",
    lore: "Built before the Sinking as a summer court, the palace kept its air-filled dome for a century after the waves closed over it. Today its tide-bells ring whenever a creature's mood turns, and heralds carry the news from its balconies to every district.",
    features: ["The Great Dome, glazed with sea-glass", "Twin reflecting pools in the inner court", "Four gilded watchtower domes", "The tide-bell loggia over the avenue"],
    facts: [{ label: "Built", value: "Before the Sinking" }, { label: "Rooms", value: "212" }, { label: "Open", value: "Courtyards always; halls by invitation" }],
    detail: "The daily Leviathan raid will be called from here in a later update.",
  },
  {
    id: "hall", kind: "hall", name: "Hall of Records", block: [3, 1],
    description: "Marble tablets list every creature in the city, from the biggest to the newest.",
    lore: "The record-keepers re-carve the tablets every tide. Scholars say the oldest stone, from the city's founding, lists only three names, and one of them is still unreadable.",
    features: ["The Tablet Gallery, ranked by size", "A long colonnade facing Shell Plaza", "The scriptorium where new names are carved"],
    facts: [{ label: "Built", value: "Year 12 after the Sinking" }, { label: "Keepers", value: "Nine scribes in rotation" }, { label: "Updated", value: "Live" }],
    link: { href: "/rankings", label: "Open the rankings" },
  },
  {
    id: "temple", kind: "temple", name: "Temple of First Light", block: [2, 2],
    description: "Keepers come here to hatch new creatures.",
    lore: "Legend says the first light that ever reached the sunken city fell on this courtyard. Every egg in the cloister glows with a little of it. A keeper brings a name, a story and a face, and the temple does the rest.",
    features: ["The Egg Cloister, lit from within", "A courtyard garden of pearl-white anemones", "The Naming Stone, where every token begins"],
    facts: [{ label: "Built", value: "Year 1 after the Sinking" }, { label: "Eggs waiting", value: "Always one more" }, { label: "Network", value: "pump.fun on Solana" }],
    link: { href: "/hatchery", label: "Go to the Hatchery" },
  },
  {
    id: "archive", kind: "archive", name: "Pearl Archive", block: [2, 1],
    description: "A library of pearl-domed reading rooms where scholars catalogue every species.",
    lore: "Each dome holds the notes on one creature family: eels, octopuses, crabs, turtles, jellies and fish. The archivists argue endlessly about whether the Nautilus belongs with the octopuses.",
    features: ["Six family reading rooms under pearl domes", "The Map Room, with a model of the whole city", "A quiet garden for reading"],
    facts: [{ label: "Built", value: "Year 40 after the Sinking" }, { label: "Volumes", value: "Uncounted" }, { label: "Silence", value: "Strictly kept" }],
    detail: "The Reefdex collection will be kept here in a later update.",
  },
  {
    id: "vents", kind: "vents", name: "Vent Springs", block: [3, 2],
    description: "Bathhouses over warm volcanic vents, where tired creatures soak between journeys.",
    lore: "The vents were here long before the city. The founders built the baths around them, and the bathhouse keepers still guard the recipe for the mineral salts that turn the pools that shade of blue.",
    features: ["Three warm pools fed by deep vents", "Steam gardens of heat-loving coral", "Massage stones polished by centuries of use"],
    facts: [{ label: "Built", value: "Around the vents, year 3" }, { label: "Water", value: "Warm, mineral-rich" }, { label: "Busiest", value: "After long expeditions" }],
  },
  {
    id: "market", kind: "market", name: "Coral Market Arcade", block: [4, 0],
    description: "Rows of striped coral awnings where traders swap pearls, shells and gossip.",
    lore: "No one owns the market: stalls pass from trader to trader by a custom older than the city's laws. The gossip here travels faster than the tide-bells, especially about which creatures are growing fastest.",
    features: ["Over forty stalls under striped awnings", "The Shell Fountain at the heart of the market", "The Gossip Steps, where news is traded"],
    facts: [{ label: "Built", value: "Grew over generations" }, { label: "Stalls", value: "40+" }, { label: "Currency", value: "Pearls (earned in play)" }],
    detail: "Gear and decorations will be sold here for Pearls (earned in play only) in a later update.",
  },
  {
    id: "beacon", kind: "beacon", name: "Beacon of the Deep", block: [5, 1],
    description: "A lighthouse in reverse: its lamp shines down so travellers can find the city.",
    lore: "The beacon's lamp burns a glowing plankton the keepers farm in its cellar. On the darkest nights you can see its beam from the edge of the open sea, and new creatures arriving from far away often swim straight for it.",
    features: ["The lamp gallery and its plankton flame", "A rock garden of luminous coral", "Lookout ledges over the eastern districts"],
    facts: [{ label: "Built", value: "Year 77 after the Sinking" }, { label: "Height", value: "Tallest in the city" }, { label: "Lamp", value: "Never once gone dark" }],
  },
  {
    id: "racetrack", kind: "racetrack", name: "Current Racetrack", block: [4, 2, 5, 2],
    description: "A hippodrome built around a racing current.",
    lore: "Engineers channelled a natural current into an oval so fast that a jellyfish can lap it in a heartbeat. Frenzied and fast-trading creatures gather on the stands here, and the roar carries across the whole east side.",
    features: ["The Current Oval, a loop of fast water", "Tiered marble stands for spectators", "The Spina, with its golden turning posts"],
    facts: [{ label: "Built", value: "Year 90 after the Sinking" }, { label: "Laps", value: "Three per race" }, { label: "Record", value: "Not yet set" }],
    detail: "Current Races (a skill minigame) will open here in a later update.",
  },
  {
    id: "gardens", kind: "gardens", name: "Kelp Gardens", block: [0, 0],
    description: "Terraces of kelp tended since the city sank, where adult creatures settle.",
    lore: "The first gardeners planted these terraces to feed the city. The kelp has long since grown wild in places, and settled adult creatures like to graze and rest in its shade.",
    features: ["Terraced kelp beds", "The Old Well, a spring of cold clear water", "Shaded groves for resting"],
    facts: [{ label: "Planted", value: "Year 2 after the Sinking" }, { label: "Kelp", value: "Taller every season" }, { label: "Residents", value: "Mostly Adults" }],
  },
  {
    id: "gardens-east", kind: "gardens", name: "Upper Kelp Terraces", block: [1, 0],
    description: "Higher terraces of the Kelp Gardens, quieter and greener.",
    lore: "These terraces catch the most light in the city. Gardeners say the kelp here grows a hand's breadth a day in summer.",
    features: ["Sunlit kelp terraces", "Stone benches carved from old columns", "A view down to the plaza"],
    facts: [{ label: "Planted", value: "Year 5 after the Sinking" }, { label: "Light", value: "The best in the city" }],
  },
  {
    id: "gardens-south", kind: "gardens", name: "Lower Kelp Terraces", block: [0, 1],
    description: "The oldest, wildest part of the Kelp Gardens.",
    lore: "Nobody has tended these beds for a long time. The kelp grows in tangles here and creatures who want peace and quiet come to hide in it.",
    features: ["Wild, tangled kelp", "Moss-covered founders' stones", "Hidden hollows for resting"],
    facts: [{ label: "Planted", value: "Year 2 after the Sinking" }, { label: "Tended", value: "Rarely" }],
  },
  {
    id: "docks", kind: "docks", name: "Sunken Ship Docks", block: [0, 3, 1, 3],
    description: "An old harbour basin around the wreck that brought the first settlers.",
    lore: "The ship that carried the founders still lies in the basin where it came to rest. Its hold became a hiding place, and creatures in a sulk still swim into it to wait for their mood to lift.",
    features: ["The founders' wreck and its open hold", "Wooden piers and mooring posts", "Barnacle-crusted cargo barrels"],
    facts: [{ label: "Sank", value: "The year of the Sinking" }, { label: "Basin", value: "Deepest water in the city" }, { label: "Residents", value: "Mostly Sulking creatures" }],
  },
  {
    id: "gate", kind: "gate", name: "Trench Gate", block: [2, 3, 3, 3],
    description: "A great arch over the abyss at the city's edge, where the giants gather.",
    lore: "The gate marks the edge of the known city. Beyond it the trench drops further than anyone has measured. Elders and Leviathans gather on its terraces, and some say something even bigger watches from below.",
    features: ["The Great Arch over the abyss", "Stepped terraces for the city's giants", "Glowing motes rising from the deep"],
    facts: [{ label: "Built", value: "Unknown: older than the city" }, { label: "Depth below", value: "Unmeasured" }, { label: "Residents", value: "Elders and Leviathans" }],
    detail: "The daily raid boss will rise from the trench in a later update.",
  },
];

const HOUSE_KINDS = ["villa", "domehouse", "tower", "cottage", "shrine", "workshop", "grotto"] as const;
type HouseKind = (typeof HOUSE_KINDS)[number];
const HOUSE_TEXT: Record<HouseKind, { noun: string; text: string; features: string[] }> = {
  villa: { noun: "Villa", text: "A tiled villa with a walled garden.", features: ["A hip roof of glazed coral tiles", "A walled courtyard garden", "Wide windows facing the light"] },
  domehouse: { noun: "Dome", text: "A glass-domed home where a family watches the light ripple overhead.", features: ["A sea-glass dome", "A flat terrace roof", "A round sitting room under the dome"] },
  tower: { noun: "Tower", text: "A slender coral tower with a view over the whole district.", features: ["A conical shell roof", "A spiral stair inside", "A lookout at the top"] },
  cottage: { noun: "Cottage", text: "A snug shell cottage with an anemone garden.", features: ["A steep tiled roof", "A chimney for the hearth-vent", "An anemone garden"] },
  shrine: { noun: "Shrine", text: "A small shrine where creatures leave pearls for luck before a journey.", features: ["A glowing offering stone", "A ring of old columns", "Pearls left by travellers"] },
  workshop: { noun: "Workshop", text: "Artisans carve shell, polish pearls and mend gear here.", features: ["Skylights over the workbenches", "Smoke vents from the kilns", "A yard full of crates"] },
  grotto: { noun: "Grotto", text: "A cool grotto of stacked stone, popular with creatures that like the dark.", features: ["Stacked boulder walls", "A dark, cool entrance", "Moss gardens in the crevices"] },
};
const ADJECTIVES = [
  "Seaglass", "Glimmer", "Pearl", "Tidewater", "Anemone", "Lantern", "Moonshell", "Driftwood", "Barnacle", "Saltlight",
  "Coralbloom", "Nautilus", "Brine", "Starfish", "Urchin", "Kelpwhisper", "Abalone", "Sandglow", "Ripple", "Mistral",
  "Silverfin", "Bluewater", "Shellcrest", "Lowtide", "Highwater", "Foamline", "Deepglow", "Sunken", "Mussel", "Opal",
];
const OWNERS = ["the Shellwright family", "a retired racer", "two old archivists", "a pearl merchant", "the Brinewood twins", "a kelp gardener", "a beacon keeper", "a family of turtles", "a travelling scholar", "nobody anyone remembers"];
const ERAS = ["Year 18 after the Sinking", "Year 64 after the Sinking", "Year 101 after the Sinking", "the Age of Pearls", "the Long Calm", "just last season"];
const DISTRICT_FLAVOUR: Record<ZoneId, string> = {
  plaza: "It looks out over the busy central avenues.",
  kelp: "Kelp fronds brush its walls.",
  market: "Traders' chatter drifts in from the arcades.",
  racetrack: "You can hear the roar of the racing current from here.",
  ship: "It smells faintly of old rope and salt.",
  trench: "The dark of the trench is just a few streets away.",
};

/** Blocks without a landmark get houses. [col, row] of the block's top-left crossing. */
const HOUSE_BLOCKS: [number, number][] = [[1, 1], [4, 1], [5, 0], [0, 2], [1, 2], [4, 3], [5, 3]];

/** Split a block into lots in one of a few patterns, so neighbourhoods don't look stamped. */
function lots(area: Rect, rnd: () => number): Rect[] {
  const g = 16;
  const { x, y, w, h } = area;
  const mx = x + w * (0.42 + rnd() * 0.16), my = y + h * (0.42 + rnd() * 0.16);
  const R = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  switch (Math.floor(rnd() * 4)) {
    case 0: // quad
      return [R(x, y, mx - g / 2, my - g / 2), R(mx + g / 2, y, x + w, my - g / 2), R(x, my + g / 2, mx - g / 2, y + h), R(mx + g / 2, my + g / 2, x + w, y + h)];
    case 1: // one wide lot on top, two below
      return [R(x, y, x + w, my - g / 2), R(x, my + g / 2, mx - g / 2, y + h), R(mx + g / 2, my + g / 2, x + w, y + h)];
    case 2: // one tall lot on the left, two on the right
      return [R(x, y, mx - g / 2, y + h), R(mx + g / 2, y, x + w, my - g / 2), R(mx + g / 2, my + g / 2, x + w, y + h)];
    default: { // three strips
      const a = x + w / 3, b = x + (2 * w) / 3;
      return [R(x, y, a - g / 2, y + h), R(a + g / 2, y, b - g / 2, y + h), R(b + g / 2, y, x + w, y + h)];
    }
  }
}

function buildBuildings(): Building[] {
  const out: Building[] = LANDMARKS.map(({ block, ...b }, i) => {
    const area = blockArea(block[0], block[1], block[2] ?? block[0], block[3] ?? block[1]);
    return { ...b, rects: [inset(area, 4)], lot: area, landmark: true, zone: zoneAt(area.x + area.w / 2, area.y + area.h / 2), seed: 1000 + i };
  });
  out.push({
    id: "plaza", kind: "plaza", name: "Great Shell Fountain", landmark: true,
    rects: [{ x: PLAZA.x - PLAZA.fountain, y: PLAZA.y - PLAZA.fountain, w: PLAZA.fountain * 2, h: PLAZA.fountain * 2 }],
    lot: { x: PLAZA.x - PLAZA.radius, y: PLAZA.y - PLAZA.radius, w: PLAZA.radius * 2, h: PLAZA.radius * 2 },
    zone: "plaza",
    description: "A spiral shell the size of a house, pouring bubbles into Shell Plaza.",
    lore: "Every creature hatched in the city first emerges from this shell. Nobody knows who carved the fountain, or whether it was carved at all: some say the shell simply grew here, and the city was built around it.",
    features: ["The Great Shell, still growing", "A ring of sand walkways around it", "Bubbles that rise all the way to the surface"],
    facts: [{ label: "Built", value: "Unknown" }, { label: "Bubbles", value: "Never stop" }],
    seed: 999,
  });

  const rnd = mulberry32(20261014);
  const usedNames = new Set(out.map((b) => b.name));
  let n = 0;
  for (const [c, r] of HOUSE_BLOCKS) {
    const area = blockArea(c, r);
    for (const lot of lots(area, rnd)) {
      const grove = rnd() < 0.1;
      const kind: BuildingKind = grove ? "grove" : HOUSE_KINDS[Math.floor(rnd() * HOUSE_KINDS.length)];
      // Fill most of the lot; the yard ring around it gets paving or garden.
      const fp = inset(lot, 8 + rnd() * 10);
      if (kind === "tower") {
        const s = Math.min(fp.w, fp.h);
        Object.assign(fp, { x: fp.x + (fp.w - s) / 2, y: fp.y + (fp.h - s) / 2, w: s, h: s });
      }
      const zone = zoneAt(fp.x + fp.w / 2, fp.y + fp.h / 2);
      const pickOf = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
      if (kind === "grove") {
        let name = "";
        for (let tries = 0; tries < 30 && (!name || usedNames.has(name)); tries++) name = `${pickOf(ADJECTIVES)} Grove`;
        usedNames.add(name);
        out.push({
          id: `house-${n++}`, kind, name, zone, rects: [fp], lot, landmark: false,
          description: "A small grove of kelp trees and coral, left wild between the houses.",
          lore: `The neighbours have argued for years about building here, but the grove keeps growing. ${DISTRICT_FLAVOUR[zone]}`,
          features: ["Kelp trees with wide canopies", "Coral shrubs", "A mossy stone bench"],
          facts: [{ label: "Planted", value: pickOf(ERAS) }, { label: "Tended by", value: pickOf(OWNERS) }],
          seed: Math.floor(rnd() * 1e9),
        });
        continue;
      }
      const t = HOUSE_TEXT[kind as HouseKind];
      let name = "";
      for (let tries = 0; tries < 30 && (!name || usedNames.has(name)); tries++) name = `${pickOf(ADJECTIVES)} ${t.noun}`;
      usedNames.add(name);
      const floors = kind === "tower" ? 4 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * 3);
      out.push({
        id: `house-${n++}`, kind, name, zone, rects: [fp], lot, landmark: false,
        description: t.text,
        lore: `Home to ${pickOf(OWNERS)}. ${DISTRICT_FLAVOUR[zone]}`,
        features: t.features,
        facts: [
          { label: "Built", value: pickOf(ERAS) },
          { label: "Floors", value: String(floors) },
          { label: "Footprint", value: `${Math.round(fp.w / 10)} × ${Math.round(fp.h / 10)} strides` },
        ],
        seed: Math.floor(rnd() * 1e9),
      });
    }
  }
  return out;
}

export const BUILDINGS = buildBuildings();
export const buildingById = (id: string) => BUILDINGS.find((b) => b.id === id) ?? null;
