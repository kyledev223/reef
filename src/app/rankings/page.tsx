import type { Metadata } from "next";
import Link from "next/link";
import { APP } from "@/config/app";
import { NETWORK_LABEL } from "@/config/data";
import { FAMILY_ICON, MOOD_ICON, MOOD_LABEL } from "@/components/icons";
import { SiteHeader } from "@/components/SiteHeader";
import { fmtAge, fmtPct, fmtUsd } from "@/lib/format";
import { solanaNetwork } from "@/lib/solana/server";
import { RANK_SORTS, getRankings, type RankSort } from "@/lib/world";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Rankings · ${APP.name}` };

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: raw } = await searchParams;
  const sort: RankSort = RANK_SORTS.some((s) => s.id === raw) ? (raw as RankSort) : "mcap";
  const rows = await getRankings(sort);
  const network = solanaNetwork();

  return (
    <div className="page">
      <SiteHeader network={network} />
      <main className="page-main">
        <section className="page-hero">
          <h1>Reef rankings</h1>
          <p className="muted">
            Every creature hatched on {NETWORK_LABEL[network]}, ranked by live token data. Keeper rankings (battles, races and raids) arrive
            with those game modes.
          </p>
        </section>

        <nav className="tabs glass" aria-label="Sort rankings">
          {RANK_SORTS.map((s) => (
            <Link key={s.id} href={`/rankings?sort=${s.id}`} aria-current={s.id === sort ? "page" : undefined} className={s.id === sort ? "active" : ""}>
              {s.label}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <div className="card glass center">
            <p>No creatures yet.</p>
            <Link className="btn-primary" href="/hatchery">🥚 Hatch the first one</Link>
          </div>
        ) : (
          <div className="table-wrap glass">
            <table className="rank-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Creature</th>
                  <th scope="col" className="hide-sm">Size</th>
                  <th scope="col" className="num">Market cap</th>
                  <th scope="col" className="num">24h</th>
                  <th scope="col" className="hide-sm">Mood</th>
                  <th scope="col" className="hide-sm num">Age</th>
                  <th scope="col" className="hide-sm">Keeper</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <Link href={`/creature/${r.id}`} className="who">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/logo/${r.id}`} alt="" width={32} height={32} className="mini-emblem" />
                        <span>
                          <strong>${r.ticker}</strong>
                          <span className="muted small block">
                            {FAMILY_ICON[r.family]} {r.variant} · {r.name}
                            {r.graduated ? " · 🎓" : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hide-sm">{r.tierLabel ?? "—"}</td>
                    <td className="num">{fmtUsd(r.marketCapUsd)}</td>
                    <td className={`num ${r.change24hPct == null ? "muted" : r.change24hPct >= 0 ? "up" : "down"}`}>{fmtPct(r.change24hPct)}</td>
                    <td className="hide-sm">{MOOD_ICON[r.mood]} {MOOD_LABEL[r.mood]}</td>
                    <td className="hide-sm num">{fmtAge(r.hatchedAt)}</td>
                    <td className="hide-sm mono">{r.creatorShort}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <footer className="page-footer">{APP.disclaimer} · {APP.dataCredit}</footer>
    </div>
  );
}
