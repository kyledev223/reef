"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildingById, type BuildingKind } from "@/lib/city";
import type { WorldCreature } from "@/lib/world";
import { ZONES } from "@/lib/zones";
import { FAMILY_ICON, MOOD_ICON } from "./icons";

const KIND_ICON: Record<BuildingKind, string> = {
  palace: "🏛️", plaza: "🐚", hall: "📜", temple: "🥚", archive: "📚", vents: "♨️", market: "🛍️",
  beacon: "🗼", racetrack: "🏟️", gardens: "🌿", docks: "⚓", gate: "🌀",
  villa: "🏡", domehouse: "🏠", tower: "🗼", cottage: "🛖", shrine: "⛩️", workshop: "🔨", grotto: "🪨", grove: "🌳",
};
const KIND_LABEL: Record<BuildingKind, string> = {
  palace: "Palace", plaza: "Fountain", hall: "Hall", temple: "Temple", archive: "Library", vents: "Bathhouse", market: "Market",
  beacon: "Lighthouse", racetrack: "Hippodrome", gardens: "Gardens", docks: "Harbour", gate: "Gate",
  villa: "Villa", domehouse: "Domed house", tower: "Tower", cottage: "Cottage", shrine: "Shrine", workshop: "Workshop", grotto: "Grotto", grove: "Grove",
};

function CreatureChip({ c, onPick }: { c: WorldCreature; onPick: (id: string) => void }) {
  return (
    <li>
      <button onClick={() => onPick(c.id)} title={`${c.name}: open creature`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/logo/${c.id}`} alt="" width={28} height={28} className="mini-emblem" />
        <strong>${c.ticker}</strong>
        <span className="muted small">{FAMILY_ICON[c.family]}</span>
      </button>
    </li>
  );
}

/** Side panel (bottom sheet on phones) for a building that was clicked on the map. */
export function BuildingPanel({
  id,
  creatures,
  creaturesNear,
  onPickCreature,
  onClose,
}: {
  id: string;
  creatures: WorldCreature[];
  creaturesNear: (buildingId: string) => string[];
  onPickCreature: (id: string) => void;
  onClose: () => void;
}) {
  const b = buildingById(id);
  const [near, setNear] = useState<string[]>([]);

  // Who is walking past right now (live from the map).
  useEffect(() => {
    const tick = () => setNear(creaturesNear(id));
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [id, creaturesNear]);

  if (!b) return null;
  const district = ZONES.find((z) => z.id === b.zone)!;
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const passing = near.map((n) => byId.get(n)).filter((c): c is WorldCreature => !!c);
  const residents = creatures.filter((c) => c.zone === b.zone);
  const moods = { FRENZY: 0, CALM: 0, SULKING: 0 };
  for (const c of residents) moods[c.mood]++;
  const biggest = residents[0]; // the world list is sorted by market cap
  const hatchedToday = creatures.filter((c) => c.newArrival).length;

  return (
    <section className="panel glass building-panel" aria-label={`${b.name} details`}>
      <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
      <div className="panel-body">
        <header className="panel-head">
          <span className="emblem fallback building-icon" aria-hidden>{KIND_ICON[b.kind]}</span>
          <div>
            <h2 className="building-name">{b.name}</h2>
            <p className="muted">
              {b.landmark ? "Landmark" : KIND_LABEL[b.kind]} · <span className="chip">{district.name}</span>
            </p>
          </div>
        </header>

        <div className="card">
          <p className="building-lead">{b.description}</p>
          <p className="building-text">{b.lore}</p>
          {b.kind === "plaza" && (
            <p className="small">
              <strong>{hatchedToday}</strong> creature{hatchedToday === 1 ? "" : "s"} hatched in the last 24 hours.
            </p>
          )}
          {b.link && (
            <Link className="btn-primary building-link" href={b.link.href}>
              {b.link.label} →
            </Link>
          )}
        </div>

        <div className="card">
          <h3>At a glance</h3>
          <dl className="facts">
            <div>
              <dt>Type</dt>
              <dd>{KIND_LABEL[b.kind]}</dd>
            </div>
            {b.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card">
          <h3>What’s here</h3>
          <ul className="features">
            {b.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {b.detail && <p className="small muted coming">🔜 {b.detail}</p>}
        </div>

        <div className="card">
          <h3>
            Around here right now <span className="live-dot" aria-hidden />
          </h3>
          {passing.length === 0 ? (
            <p className="small muted">Nobody is passing by at the moment. Creatures wander the paths, so check back in a bit.</p>
          ) : (
            <ul className="resident-list">
              {passing.slice(0, 8).map((c) => (
                <CreatureChip key={c.id} c={c} onPick={onPickCreature} />
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>{district.name}</h3>
          <p className="small">{district.blurb}</p>
          <p className="small muted">Who lives here: {district.habitat}</p>
          <div className="mood-row" aria-label="Moods of the district's residents">
            <span className="badge mood-frenzy">{MOOD_ICON.FRENZY} {moods.FRENZY} in a Frenzy</span>
            <span className="badge mood-calm">{MOOD_ICON.CALM} {moods.CALM} Calm</span>
            <span className="badge mood-sulking">{MOOD_ICON.SULKING} {moods.SULKING} Sulking</span>
          </div>
          {biggest && (
            <p className="small">
              Largest resident:{" "}
              <button className="link-btn" onClick={() => onPickCreature(biggest.id)}>
                ${biggest.ticker}
              </button>
            </p>
          )}
          {residents.length === 0 ? (
            <p className="small muted">No creatures call this district home yet.</p>
          ) : (
            <>
              <p className="small muted">
                {residents.length} resident{residents.length === 1 ? "" : "s"}:
              </p>
              <ul className="resident-list">
                {residents.slice(0, 12).map((c) => (
                  <CreatureChip key={c.id} c={c} onPick={onPickCreature} />
                ))}
              </ul>
              {residents.length > 12 && <p className="small muted">…and {residents.length - 12} more.</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
