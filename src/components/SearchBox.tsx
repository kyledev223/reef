"use client";

import { useMemo, useState } from "react";
import type { WorldCreature } from "@/lib/world";
import { FAMILY_ICON } from "./icons";

export function SearchBox({ creatures, onPick }: { creatures: WorldCreature[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^\$/, "");
    if (!s) return [];
    const scored: [number, WorldCreature][] = [];
    for (const c of creatures) {
      const t = c.ticker.toLowerCase(), n = c.name.toLowerCase();
      const score = t === s ? 0 : t.startsWith(s) ? 1 : n.startsWith(s) ? 2 : t.includes(s) ? 3 : n.includes(s) ? 4 : -1;
      if (score >= 0) scored.push([score, c]);
    }
    return scored.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
  }, [q, creatures]);

  const pick = (c: WorldCreature) => {
    onPick(c.id);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="search glass">
      <span aria-hidden className="search-icon">⌕</span>
      <input
        type="search"
        placeholder="Find a creature by name or $TICKER"
        aria-label="Search creatures by coin name or ticker"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && results[active]) pick(results[active]);
          if (e.key === "Escape") { setQ(""); setOpen(false); }
        }}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
      />
      {open && q && (
        <ul className="search-results glass" id="search-results" role="listbox">
          {results.length === 0 && <li className="muted">No creature matches “{q}”.</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setActive(i)}
            >
              <span aria-hidden>{FAMILY_ICON[c.family]}</span>
              <strong>${c.ticker}</strong>
              <span className="muted ellipsis">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
