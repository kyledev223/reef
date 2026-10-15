"use client";

import { useEffect, useRef, useState } from "react";
import { WORLD } from "@/config/balance";
import type { FeedItem } from "@/lib/world";
import { fmtAgo } from "@/lib/format";

export function FeedPanel({
  open,
  onToggle,
  onPickCoin,
  onNews,
}: {
  open: boolean;
  onToggle: () => void;
  onPickCoin: (id: string) => void;
  onNews: () => void;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [fresh, setFresh] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = lastId.current ? `?after=${lastId.current}` : "";
        const r = await fetch(`/api/feed${q}`, { cache: "no-store" });
        if (!r.ok || !alive) return;
        const { items: got } = (await r.json()) as { items: FeedItem[] };
        if (got.length) {
          const hadAny = lastId.current != null;
          lastId.current = got[0].id;
          setItems((prev) => [...got, ...prev].slice(0, WORLD.feedLimit));
          if (hadAny) {
            setFresh((n) => n + got.length);
            onNews();
          }
        }
      } catch {
        // offline: try again next tick
      }
    };
    load();
    const id = setInterval(load, WORLD.feedPollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [onNews]);

  useEffect(() => {
    if (open) setFresh(0);
  }, [open]);

  return (
    <>
      <button className="feed-toggle glass" onClick={onToggle} aria-expanded={open} aria-controls="world-feed">
        📣 Reef news{fresh > 0 && !open ? <span className="badge">{fresh}</span> : null}
      </button>
      <aside id="world-feed" className={`feed glass ${open ? "open" : ""} ${minimized ? "minimized" : ""}`} aria-label="World feed">
        <div className="feed-head">
          <h2>Reef news</h2>
          <button className="icon-btn show-sm" onClick={onToggle} aria-label="Close feed">✕</button>
          <button
            className="icon-btn hide-sm"
            onClick={() => setMinimized((m) => !m)}
            aria-expanded={!minimized}
            aria-label={minimized ? "Show reef news" : "Hide reef news"}
          >
            {minimized ? "▸" : "▾"}
          </button>
        </div>
        {minimized ? null : items.length === 0 ? (
          <p className="muted small">Quiet waters. Mood changes, arrivals and departures will show up here.</p>
        ) : (
          <ol>
            {items.map((e) => (
              <li key={e.id}>
                {e.coinId ? (
                  <button className="feed-item" onClick={() => onPickCoin(e.coinId!)}>
                    {e.message}
                  </button>
                ) : (
                  <span className="feed-item">{e.message}</span>
                )}
                <time className="muted small" dateTime={e.at}>{fmtAgo(e.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </>
  );
}
