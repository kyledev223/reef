"use client";

import { MARKET_CAP } from "@/config/balance";
import { fmtAge, fmtAgo, fmtMod, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import type { CoinDetail, StatField } from "@/lib/world";
import { ZONES } from "@/lib/zones";
import { FAMILY_ICON, MOOD_ICON, MOOD_LABEL } from "./icons";
import { Missing } from "./Missing";
import { Sparkline } from "./Sparkline";

function Stat({ label, field, fmt, hint }: { label: string; field: StatField; fmt: (v: never) => string; hint?: string }) {
  return (
    <div className="stat">
      <dt>
        {label}
        {hint && <span className="muted small"> {hint}</span>}
      </dt>
      <dd>{field.value == null ? <Missing reason={field.missing ?? "Not available yet."} /> : fmt(field.value as never)}</dd>
    </div>
  );
}

const STAT_ROWS = [
  ["hp", "HP"],
  ["atk", "Attack"],
  ["def", "Defense"],
  ["spd", "Speed"],
] as const;

const fmtSol = (v: number) => `${v >= 100 ? v.toFixed(0) : v.toFixed(2)} SOL`;

export function CreatureHeader({ detail, compact = false }: { detail: CoinDetail; compact?: boolean }) {
  const c = detail.creature;
  return (
    <>
      <header className="panel-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="emblem" src={`/api/logo/${c.id}`} alt="" width={52} height={52} />
        <div>
          {compact ? <h2>${c.ticker}</h2> : <h1>${c.ticker}</h1>}
          <p className="muted">
            {detail.name} · <span className="chip">{detail.networkLabel}</span>
          </p>
        </div>
      </header>
      <div className="badges">
        <span className={`badge mood-${c.mood.toLowerCase()}`}>
          {MOOD_ICON[c.mood]} {MOOD_LABEL[c.mood]}
          {detail.stats.change24hPct.value != null && <> ({fmtPct(detail.stats.change24hPct.value as number)} 24h)</>}
        </span>
        {detail.species.tierLabel && <span className="badge">{detail.species.tierLabel}</span>}
        <span className={`badge rarity-${c.rarity}`}>{detail.species.rarityLabel}</span>
        {c.newArrival && <span className="badge gold">🥚 Hatched today</span>}
        {c.graduated && <span className="badge">🎓 Graduated</span>}
      </div>
    </>
  );
}

export function CreatureDetails({ detail }: { detail: CoinDetail }) {
  const c = detail.creature;
  return (
    <>
      <div className="card">
        <h3>
          {FAMILY_ICON[c.family]} {detail.species.variant} <span className="muted small">· {detail.species.familyLabel} family</span>
        </h3>
        <p className="small">{detail.species.blurb}</p>
        <p className="small">
          Strong vs <strong>{detail.species.strongVs}</strong> · Weak vs <strong>{detail.species.weakVs}</strong> · Home:{" "}
          <strong>{ZONES.find((z) => z.id === detail.species.habitat)?.name}</strong>
        </p>
      </div>

      <div className="card">
        <h3>Origin story</h3>
        <p className="small story">{detail.description}</p>
        <p className="small muted">
          Hatched {fmtAgo(detail.hatchedAt)} by keeper{" "}
          <a href={detail.explorer.creator} target="_blank" rel="noopener noreferrer">{detail.creatorShort}</a>
        </p>
        {(detail.links.twitter || detail.links.telegram || detail.links.website) && (
          <p className="small links">
            {detail.links.twitter && <a href={detail.links.twitter} target="_blank" rel="noopener noreferrer nofollow ugc">𝕏 / Twitter</a>}
            {detail.links.telegram && <a href={detail.links.telegram} target="_blank" rel="noopener noreferrer nofollow ugc">Telegram</a>}
            {detail.links.website && <a href={detail.links.website} target="_blank" rel="noopener noreferrer nofollow ugc">Website</a>}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Today’s market effects</h3>
        <table className="mods">
          <tbody>
            {STAT_ROWS.map(([k, label]) => {
              const v = detail.market[k] - 1;
              const parts = detail.market.parts[k];
              return (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td className={v > 0.001 ? "up" : v < -0.001 ? "down" : "flat"}>{fmtMod(v)}</td>
                  <td className="muted small">{parts.length ? parts.map((p) => `${p.label} ${fmtMod(p.value)}`).join(" · ") : "no effect"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">
          Capped at {fmtMod(MARKET_CAP.min - 1)} / {fmtMod(MARKET_CAP.max - 1)} per stat. Level and training matter more in battle.
        </p>
      </div>

      <div className="card">
        <h3>Live token data</h3>
        <dl className="stats">
          <Stat label="Market cap" field={detail.stats.marketCapUsd} fmt={fmtUsd} />
          <Stat label="Market cap (SOL)" field={detail.stats.marketCapSol} fmt={fmtSol} />
          <Stat label="24h change" field={detail.stats.change24hPct} fmt={(v: number) => fmtPct(v)} />
          <Stat label="Price" field={detail.stats.priceUsd} fmt={fmtPrice} />
          <Stat label="DEX liquidity" field={detail.stats.liquidityUsd} fmt={fmtUsd} />
          <Stat label="DEX volume 24h" field={detail.stats.dexVolume24hUsd} fmt={fmtUsd} />
          <Stat label="Size rank" field={detail.stats.trackedRank} fmt={(v: number) => `#${v} on the reef`} />
          <div className="stat">
            <dt>Age</dt>
            <dd>{fmtAge(detail.hatchedAt)}</dd>
          </div>
        </dl>
        <Sparkline points={detail.history} />
        <p className="muted small">
          Source: pump.fun bonding curve on {detail.networkLabel}
          {detail.change24hSource === "dexscreener" ? " · 24h change from DexScreener" : detail.change24hSource === "snapshots" ? " · 24h change from our snapshots" : ""}
          {detail.updated.curve && <> · read {fmtAgo(detail.updated.curve)}</>}
        </p>
        <p className="small links">
          <a href={detail.explorer.token} target="_blank" rel="noopener noreferrer">Token on Solscan</a>
          <a href={detail.explorer.launchTx} target="_blank" rel="noopener noreferrer">Hatch transaction</a>
        </p>
      </div>

      {detail.events.length > 0 && (
        <div className="card">
          <h3>Recent news</h3>
          <ul className="mini-feed">
            {detail.events.map((e) => (
              <li key={e.id}>
                {e.message} <span className="muted small">{fmtAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
