"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP } from "@/config/app";
import { WORLD } from "@/config/balance";
import type { WorldPayload } from "@/lib/world";
import { display } from "@/app/fonts";
import type { ReefController } from "@/render/reef";
import { BuildingPanel } from "./BuildingPanel";
import { CreaturePanel } from "./CreaturePanel";
import { DataAsOf } from "./DataAsOf";
import { FeedPanel } from "./FeedPanel";
import { SearchBox } from "./SearchBox";
import { SiteHeader } from "./SiteHeader";

type Selection = { kind: "creature"; id: string } | { kind: "building"; id: string } | null;

export function ReefApp({ initialWorld }: { initialWorld: WorldPayload | null }) {
  const [world, setWorld] = useState<WorldPayload | null>(initialWorld);
  const [selection, setSelection] = useState<Selection>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const reefRef = useRef<ReefController | null>(null);
  const worldRef = useRef(world);
  worldRef.current = world;

  // Mount the Pixi renderer once (client only; survives React StrictMode double-mount).
  useEffect(() => {
    let cancelled = false;
    let ctrl: ReefController | null = null;
    import("@/render/reef")
      .then(({ createReef }) =>
        createReef(
          canvasRef.current!,
          {
            // Taps on the map: highlight in place, no camera move.
            onSelect: (id) => {
              setSelection(id ? { kind: "creature", id } : null);
              reefRef.current?.select(id, false);
            },
            onSelectBuilding: (id) => {
              setSelection({ kind: "building", id });
              reefRef.current?.selectBuilding(id, false);
            },
          },
          { fontFamily: display.style.fontFamily },
        ),
      )
      .then((c) => {
        if (cancelled) return c.destroy();
        ctrl = c;
        reefRef.current = c;
        if (worldRef.current) c.setCreatures(worldRef.current.creatures);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setRenderError("Your browser couldn't start the city renderer (WebGL is required).");
      });
    return () => {
      cancelled = true;
      ctrl?.destroy();
      reefRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (world) reefRef.current?.setCreatures(world.creatures);
  }, [world]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/world", { cache: "no-store" });
      if (r.ok) setWorld(await r.json());
    } catch {
      // Keep showing the last world we had; the data-as-of chip tells the player how old it is.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, WORLD.worldRefreshMs);
    return () => clearInterval(id);
  }, [refresh]);

  /** Select from the UI (search, feed, panels): move the camera to it. */
  const focusCreature = useCallback((id: string | null) => {
    setSelection(id ? { kind: "creature", id } : null);
    reefRef.current?.selectBuilding(null);
    reefRef.current?.select(id, true);
  }, []);
  const creaturesNear = useCallback((buildingId: string) => reefRef.current?.creaturesNear(buildingId) ?? [], []);
  const clear = useCallback(() => {
    setSelection(null);
    reefRef.current?.select(null);
    reefRef.current?.selectBuilding(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  const creatures = world?.creatures ?? [];
  const empty = creatures.length === 0;

  return (
    <main className={`reef-app ${selection ? "has-panel" : ""}`}>
      <SiteHeader network={world?.network} />
      <div className="reef-canvas" ref={canvasRef} aria-label="City map: drag to pan, scroll or pinch to zoom, click buildings and creatures" />

      <div className="topbar">
        <SearchBox creatures={creatures} onPick={(id) => focusCreature(id)} />
        {world && <DataAsOf world={world} />}
      </div>

      <FeedPanel
        open={feedOpen}
        onToggle={() => setFeedOpen((o) => !o)}
        onPickCoin={(id) => {
          if (creatures.some((c) => c.id === id)) focusCreature(id);
        }}
        onNews={refresh}
      />

      <div className="zoom-controls glass" role="group" aria-label="Map zoom">
        <button onClick={() => reefRef.current?.zoomBy(1.35)} aria-label="Zoom in">+</button>
        <button onClick={() => reefRef.current?.zoomBy(1 / 1.35)} aria-label="Zoom out">−</button>
        <button onClick={() => reefRef.current?.showAll()} aria-label="Show the whole city">⤢</button>
      </div>

      {selection?.kind === "creature" && <CreaturePanel id={selection.id} onClose={clear} />}
      {selection?.kind === "building" && (
        <BuildingPanel id={selection.id} creatures={creatures} creaturesNear={creaturesNear} onPickCreature={focusCreature} onClose={clear} />
      )}

      {renderError ? (
        <div className="empty-state glass" role="alert">
          <p>{renderError}</p>
        </div>
      ) : (
        empty && !selection && (
          <div className="empty-banner glass" role="status">
            <span>🥚 The city is waiting for its first creature. Explore the buildings, or be the first to hatch one.</span>
            <Link className="btn-primary" href="/hatchery">Hatch a creature</Link>
          </div>
        )
      )}

      <footer className="disclaimer">
        {APP.disclaimer} <span className="credit">· {APP.dataCredit}</span>
      </footer>
    </main>
  );
}
