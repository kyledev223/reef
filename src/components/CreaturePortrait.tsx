"use client";

import { useEffect, useRef } from "react";
import type { ArtSpec } from "@/render/creatures";

/** A single creature, gently swimming in place. Used for the Hatchery preview and creature pages. */
export function CreaturePortrait({ spec, logoUrl, size = 220, label }: { spec: ArtSpec; logoUrl?: string | null; size?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${spec.family}:${spec.variantIndex}:${spec.palette.join(",")}:${spec.hue}:${spec.patternSeed}:${logoUrl ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      const PIXI = await import("pixi.js");
      const { drawCreature } = await import("@/render/creatures");
      const app = new PIXI.Application();
      await app.init({ width: size, height: size, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: "webgl" });
      if (cancelled) return app.destroy(true);
      ref.current?.appendChild(app.canvas);
      destroy = () => app.destroy({ removeView: true }, { children: true, texture: true });

      const art = drawCreature(spec);
      if (logoUrl) {
        try {
          const bmp = await createImageBitmap(await (await fetch(logoUrl)).blob());
          const { x, y, r } = art.emblem;
          const back = new PIXI.Graphics().circle(x, y, r + 2.5).fill({ color: 0xffffff, alpha: 0.92 });
          const mask = new PIXI.Graphics().circle(x, y, r).fill(0xffffff);
          const logo = new PIXI.Sprite(PIXI.Texture.from(bmp));
          logo.anchor.set(0.5);
          logo.width = logo.height = r * 2;
          logo.position.set(x, y);
          logo.mask = mask;
          art.root.addChild(back, logo, mask);
        } catch {
          // Emblem is decoration; the creature still renders without it.
        }
      }
      if (cancelled) return;
      const holder = new PIXI.Container();
      holder.addChild(art.root);
      const b = art.root.getLocalBounds();
      const fit = (size * 0.78) / Math.max(b.width, b.height);
      holder.scale.set(fit);
      holder.position.set(size / 2 - (b.x + b.width / 2) * fit, size / 2 - (b.y + b.height / 2) * fit);
      app.stage.addChild(holder);
      let t = 0;
      const baseY = holder.y;
      app.ticker.add((tk) => {
        t += tk.deltaMS / 1000;
        holder.y = baseY + Math.sin(t * 1.6) * 4;
        holder.rotation = Math.sin(t * 2.2) * 0.03;
      });
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size]);

  return <div className="portrait" ref={ref} style={{ width: size, height: size }} role="img" aria-label={label} />;
}
