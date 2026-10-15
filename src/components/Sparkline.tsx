"use client";

import { useMemo, useRef, useState } from "react";
import { fmtUsd } from "@/lib/format";

const W = 300, H = 64, PAD = 4;

/** Market cap over the last 48h: one 2px line, crosshair + tooltip on hover/touch. */
export function Sparkline({ points }: { points: { t: number; mcap: number | null }[] }) {
  const data = useMemo(() => points.filter((p): p is { t: number; mcap: number } => p.mcap != null), [points]);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const t0 = data[0].t, t1 = data[data.length - 1].t;
    let lo = Infinity, hi = -Infinity;
    for (const p of data) { lo = Math.min(lo, p.mcap); hi = Math.max(hi, p.mcap); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const x = (t: number) => PAD + ((t - t0) / (t1 - t0 || 1)) * (W - PAD * 2);
    const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
    const line = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.mcap).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${H}L${x(t0).toFixed(1)},${H}Z`;
    return { x, y, line, area, t0, t1 };
  }, [data]);

  if (!geo) return <p className="muted small">History builds up as snapshots are taken every few minutes.</p>;

  const onMove = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = geo.t0 + ((clientX - r.left) / r.width) * (geo.t1 - geo.t0);
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i].t - t) < Math.abs(data[best].t - t)) best = i;
    setHover(best);
  };
  const hp = hover != null ? data[hover] : null;
  const span = (geo.t1 - geo.t0) / 3_600_000;

  return (
    <figure className="spark">
      <figcaption>
        <span>Market cap · last {span >= 1.5 ? `${Math.round(span)}h` : `${Math.max(1, Math.round(span * 60))} min`}</span>
        <span className="muted">{hp ? `${fmtUsd(hp.mcap)} · ${new Date(hp.t).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}` : fmtUsd(data[data.length - 1].mcap)}</span>
      </figcaption>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Market cap from ${fmtUsd(data[0].mcap)} to ${fmtUsd(data[data.length - 1].mcap)}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <path d={geo.area} className="spark-area" />
        <path d={geo.line} className="spark-line" vectorEffect="non-scaling-stroke" />
        {hp && (
          <>
            <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={0} y2={H} className="spark-cross" vectorEffect="non-scaling-stroke" />
            <circle cx={geo.x(hp.t)} cy={geo.y(hp.mcap)} r={3.5} className="spark-dot" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    </figure>
  );
}
