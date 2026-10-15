"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CoinDetail } from "@/lib/world";
import { CreatureDetails, CreatureHeader } from "./CreatureDetails";

/** Side panel (bottom sheet on phones) for the creature selected on the reef. */
export function CreaturePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(false);
    const load = () =>
      fetch(`/api/coins/${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => alive && setDetail(d))
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  return (
    <section className={`panel glass ${expanded ? "expanded" : ""}`} aria-label="Creature details">
      <button className="sheet-handle show-sm" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? "Collapse panel" : "Expand panel"} />
      <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
      {!detail && !error && <p className="muted pad">Surfacing creature data…</p>}
      {error && <p className="muted pad">This creature swam out of reach.</p>}
      {detail && (
        <div className="panel-body">
          <CreatureHeader detail={detail} compact />
          <Link className="btn-secondary" href={`/creature/${id}`}>Open creature page →</Link>
          <CreatureDetails detail={detail} />
        </div>
      )}
    </section>
  );
}
