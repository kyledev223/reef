"use client";

import { MARKET_CAP } from "@/config/balance";
import { fmtAge, fmtAgo, fmtMod, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import type { CoinDetail, StatField } from "@/lib/world";
import { ZONES } from "@/lib/zones";
import { CopyAddress } from "./CopyAddress";
import { FAMILY_ICON, MOOD_ICON, MOOD_LABEL } from "./icons";
import { Missing } from "./Missing";
import { Sparkline } from "./Sparkline";

function Value({ field, fmt }: { field: StatField; fmt: (v: never) => string }) {
  return field.value == null ? <Missing reason={field.missing ?? "Not available yet."} /> : <>{fmt(field.value as never)}</>;
}

function Stat({ label, field, fmt, hint }: { label: string; field: StatField; fmt: (v: never) => string; hint?: string }) {
  return (
    <div className="stat">
      <dt>
        {label}
        {hint && <span className="muted small"> {hint}</span>}
      </dt>
      <dd>
        <Value field={field} fmt={fmt} />
      </dd>
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
const changeClass = (v: unknown) => (typeof v === "number" ? (v > 0 ? "up" : v < 0 ? "down" : "") : "");

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

/** The four headline numbers across the bottom of the creature page hero. */
export function HeadlineStats({ detail }: { detail: CoinDetail }) {
  const s = detail.stats;
  return (
    <dl className="headline-stats">
      <div className="headline-stat">
        <dt>Market cap</dt>
        <dd>
          <Value field={s.marketCapUsd} fmt={fmtUsd} />
        </dd>
        {s.marketCapSol.value != null && <span className="headline-sub">{fmtSol(s.marketCapSol.value as number)}</span>}
      </div>
      <div className="headline-stat">
        <dt>Price</dt>
        <dd>
          <Value field={s.priceUsd} fmt={fmtPrice} />
        </dd>
      </div>
      <div className="headline-stat">
        <dt>24h change</dt>
        <dd className={changeClass(s.change24hPct.value)}>
          <Value field={s.change24hPct} fmt={(v: number) => fmtPct(v)} />
        </dd>
      </div>
      <div className="headline-stat">
        <dt>Age</dt>
        <dd>{fmtAge(detail.hatchedAt)}</dd>
        <span className="headline-sub">since hatching</span>
      </div>
    </dl>
  );
}

export function LinksRow({ detail }: { detail: CoinDetail }) {
  const { twitter, telegram, website } = detail.links;
  if (!twitter && !telegram && !website) return null;
  return (
    <p className="social-row">
      {twitter && <a className="social-chip" href={twitter} target="_blank" rel="noopener noreferrer nofollow ugc">𝕏 Twitter</a>}
      {telegram && <a className="social-chip" href={telegram} target="_blank" rel="noopener noreferrer nofollow ugc">✈️ Telegram</a>}
      {website && <a className="social-chip" href={website} target="_blank" rel="noopener noreferrer nofollow ugc">🌐 Website</a>}
    </p>
  );
}

export function SpeciesCard({ detail }: { detail: CoinDetail }) {
  const c = detail.creature;
  const home = ZONES.find((z) => z.id === detail.species.habitat)?.name;
  return (
    <div className="card">
      <h3>
        {FAMILY_ICON[c.family]} {detail.species.variant} <span className="muted small">· {detail.species.familyLabel} family</span>
      </h3>
      <p className="small">{detail.species.blurb}</p>
      <dl className="species-facts">
        <div><dt>Strong vs</dt><dd>{detail.species.strongVs}</dd></div>
        <div><dt>Weak vs</dt><dd>{detail.species.weakVs}</dd></div>
        <div><dt>Home</dt><dd>{home}</dd></div>
      </dl>
    </div>
  );
}

export function OriginCard({ detail, showLinks = true }: { detail: CoinDetail; showLinks?: boolean }) {
  return (
    <div className="card">
      <h3>📜 Origin story</h3>
      <p className="small story">{detail.description}</p>
      <p className="small muted">
        Hatched {fmtAgo(detail.hatchedAt)} by keeper{" "}
        <a href={detail.explorer.creator} target="_blank" rel="noopener noreferrer">{detail.creatorShort}</a>
        {" · "}
        <a href={detail.explorer.launchTx} target="_blank" rel="noopener noreferrer">hatch transaction</a>
      </p>
      {showLinks && <LinksRow detail={detail} />}
    </div>
  );
}

export function EffectsCard({ detail }: { detail: CoinDetail }) {
  const span = Math.max(MARKET_CAP.max - 1, 1 - MARKET_CAP.min);
  return (
    <div className="card">
      <h3>⚡ Today’s market effects</h3>
      <ul className="effects">
        {STAT_ROWS.map(([k, label]) => {
          const v = detail.market[k] - 1;
          const parts = detail.market.parts[k];
          const cls = v > 0.001 ? "up" : v < -0.001 ? "down" : "flat";
          const w = Math.min(50, (Math.abs(v) / span) * 50);
          return (
            <li key={k}>
              <span className="effect-label">{label}</span>
              <span className="effect-bar" aria-hidden>
                <span className={`effect-fill ${cls}`} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
              </span>
              <span className={`effect-value ${cls}`}>{fmtMod(v)}</span>
              {parts.length > 0 && <span className="effect-parts muted small">{parts.map((p) => `${p.label} ${fmtMod(p.value)}`).join(" · ")}</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Moves with the market, capped at {fmtMod(MARKET_CAP.min - 1)} / {fmtMod(MARKET_CAP.max - 1)} per stat. Level and training matter more in battle.
      </p>
    </div>
  );
}

/** Market data. On the creature page the headline numbers sit in the hero, so `page` shows the rest. */
export function MarketCard({ detail, page = false }: { detail: CoinDetail; page?: boolean }) {
  const s = detail.stats;
  return (
    <div className="card">
      <h3>📈 Live token data</h3>
      <Sparkline points={detail.history} />
      <dl className="stats">
        {!page && (
          <>
            <Stat label="Market cap" field={s.marketCapUsd} fmt={fmtUsd} />
            <Stat label="24h change" field={s.change24hPct} fmt={(v: number) => fmtPct(v)} />
            <Stat label="Price" field={s.priceUsd} fmt={fmtPrice} />
          </>
        )}
        <Stat label="DEX liquidity" field={s.liquidityUsd} fmt={fmtUsd} />
        <Stat label="DEX volume 24h" field={s.dexVolume24hUsd} fmt={fmtUsd} />
        <Stat label="Size rank" field={s.trackedRank} fmt={(v: number) => `#${v} on the reef`} />
        {page ? (
          <div className="stat">
            <dt>Bonding curve</dt>
            <dd>{detail.curveComplete ? "🎓 Complete" : "Active"}</dd>
          </div>
        ) : (
          <div className="stat">
            <dt>Age</dt>
            <dd>{fmtAge(detail.hatchedAt)}</dd>
          </div>
        )}
      </dl>
      <p className="muted small">
        Source: pump.fun bonding curve on {detail.networkLabel}
        {detail.change24hSource === "dexscreener" ? " · 24h change from DexScreener" : detail.change24hSource === "snapshots" ? " · 24h change from our snapshots" : ""}
        {detail.updated.curve && <> · read {fmtAgo(detail.updated.curve)}</>}
      </p>
    </div>
  );
}

export function NewsCard({ detail }: { detail: CoinDetail }) {
  if (detail.events.length === 0) return null;
  return (
    <div className="card">
      <h3>📰 Recent news</h3>
      <ul className="news">
        {detail.events.map((e) => (
          <li key={e.id}>
            <span>{e.message}</span>
            <span className="muted small">{fmtAgo(e.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everything below the header, stacked: used by the side panel on the city map. */
export function CreatureDetails({ detail }: { detail: CoinDetail }) {
  return (
    <>
      <CopyAddress address={detail.mint} />
      <MarketCard detail={detail} />
      <SpeciesCard detail={detail} />
      <OriginCard detail={detail} />
      <EffectsCard detail={detail} />
      <NewsCard detail={detail} />
    </>
  );
}
