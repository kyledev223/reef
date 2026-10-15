import { describe, expect, it } from "vitest";
import { BUILDINGS, PLAZA, ROADS, blockArea, nodesIn, pointAlong, route } from "./city";
import { ZONES } from "./zones";

describe("city layout", () => {
  it("has one connected path network", () => {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) for (const n of ROADS.adj[stack.pop()!]) if (!seen.has(n)) (seen.add(n), stack.push(n));
    expect(seen.size).toBe(ROADS.nodes.length);
  });

  it("gives every district paths to walk and something to click", () => {
    for (const z of ZONES) {
      expect(nodesIn(z.id).length, z.id).toBeGreaterThanOrEqual(2);
      expect(BUILDINGS.some((b) => b.zone === z.id), z.id).toBe(true);
    }
  });

  it("isn't a plain grid: crossings are off-grid and paths wander", () => {
    const offGrid = ROADS.nodes.filter((n) => n.x % 600 !== 300 || n.y % 600 !== 300).length;
    expect(offGrid).toBeGreaterThan(ROADS.nodes.length * 0.8);
    // How far each path strays from the straight line between its ends.
    const wandering = ROADS.edges.filter((e) => {
      const a = e.pts[0], b = e.pts[e.pts.length - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const stray = Math.max(...e.pts.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len));
      return stray > 5;
    }).length;
    expect(wandering).toBeGreaterThan(ROADS.edges.length * 0.7);
  });

  it("never puts a building on a path or in the plaza", () => {
    const hits: string[] = [];
    for (const bd of BUILDINGS) {
      if (bd.kind === "plaza") continue;
      for (const r of bd.rects) {
        for (const e of ROADS.edges) {
          for (const p of e.pts) {
            const cx = Math.max(r.x, Math.min(p.x, r.x + r.w)), cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
            if (Math.hypot(p.x - cx, p.y - cy) < e.width / 2) hits.push(`${bd.name} on a path at ${Math.round(p.x)},${Math.round(p.y)}`);
          }
        }
        const cx = Math.max(r.x, Math.min(PLAZA.x, r.x + r.w)), cy = Math.max(r.y, Math.min(PLAZA.y, r.y + r.h));
        if (Math.hypot(PLAZA.x - cx, PLAZA.y - cy) < PLAZA.radius) hits.push(`${bd.name} in the plaza`);
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  });

  it("leaves real room to build in every block", () => {
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 4; r++) {
        const a = blockArea(c, r);
        expect(a.w * a.h, `block ${c},${r}`).toBeGreaterThan(200 * 200);
      }
    }
  });

  it("routes along existing paths, and walking follows the path's curve", () => {
    const from = 0, to = ROADS.nodes.length - 1;
    const path = route(from, to);
    expect(path.at(-1)).toBe(to);
    let prev = from;
    for (const step of path) {
      expect(ROADS.adj[prev]).toContain(step);
      prev = step;
    }
    const [a, b] = [0, ROADS.adj[0][0]];
    expect(pointAlong(a, b, 0).x).toBeCloseTo(ROADS.nodes[a].x, 5);
    const e = ROADS.edges[ROADS.edgeOf.get(`${a}-${b}`)!];
    const end = pointAlong(a, b, e.cum[e.cum.length - 1]);
    expect(Math.hypot(end.x - ROADS.nodes[b].x, end.y - ROADS.nodes[b].y)).toBeLessThan(0.01);
  });

  it("gives buildings unique ids and names, and every building something to say", () => {
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
    expect(new Set(BUILDINGS.map((b) => b.name)).size).toBe(BUILDINGS.length);
    for (const b of BUILDINGS) {
      expect(b.lore.length, b.name).toBeGreaterThan(40);
      expect(b.features.length, b.name).toBeGreaterThanOrEqual(2);
      expect(b.facts.length, b.name).toBeGreaterThanOrEqual(2);
    }
  });
});
