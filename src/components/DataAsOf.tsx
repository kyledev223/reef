"use client";

import { useEffect, useState } from "react";
import { NETWORK_LABEL } from "@/config/data";
import type { SourceAsOf, WorldPayload } from "@/lib/world";
import { fmtAgo, fmtClock } from "@/lib/format";

/** "Data as of" chip. Turns amber when the cache is stale (e.g. an API is down). */
export function DataAsOf({ world }: { world: WorldPayload }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const [open, setOpen] = useState(false);
  const { sources, network } = world;
  const hasCreatures = world.creatures.length > 0;
  const asOf = sources.chain.lastSuccessAt;
  const stale = hasCreatures && (sources.chain.stale || sources.solPrice.stale);
  const rows: [string, SourceAsOf][] = [
    ["Bonding curves (Solana)", sources.chain],
    ["SOL/USD price (CoinGecko)", sources.solPrice],
    ...(sources.dex ? ([["DEX data (DexScreener)", sources.dex]] as [string, SourceAsOf][]) : []),
  ];
  return (
    <div className="asof-wrap">
      <button className={`asof glass ${stale ? "stale" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Data freshness details">
        <span className="dot" aria-hidden />
        {network === "devnet" && <span className="net-badge">devnet</span>}
        {asOf && hasCreatures ? <>Data as of {fmtClock(asOf)}</> : <>Live data</>}
        <span className="muted hide-sm"> · {world.creatures.length} creatures</span>
      </button>
      {open && (
        <div className="asof-pop glass" role="dialog" aria-label="Data sources">
          <p className="pop-title">Live data on {NETWORK_LABEL[network]}, cached by our server</p>
          <ul>
            {rows.map(([label, s]) => (
              <li key={label}>
                <span className={`dot ${s.stale ? "stale" : ""}`} aria-hidden />
                <span>{label}</span>
                <span className="muted">
                  {s.lastSuccessAt ? fmtAgo(s.lastSuccessAt) : "not yet"}
                  {s.failing ? " · retrying" : ""}
                </span>
              </li>
            ))}
          </ul>
          {network === "devnet" && <p className="muted small">Test network: devnet tokens have no monetary value.</p>}
          {stale && <p className="muted small">A source hasn’t refreshed recently. The reef keeps showing the last real data it received.</p>}
        </div>
      )}
    </div>
  );
}
