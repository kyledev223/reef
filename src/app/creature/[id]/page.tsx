import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP } from "@/config/app";
import { CopyAddress } from "@/components/CopyAddress";
import {
  CreatureHeader, EffectsCard, HeadlineStats, LinksRow, MarketCard, NewsCard, OriginCard, SpeciesCard,
} from "@/components/CreatureDetails";
import { CreaturePortrait } from "@/components/CreaturePortrait";
import { SiteHeader } from "@/components/SiteHeader";
import { solanaNetwork } from "@/lib/solana/server";
import { getCoinDetail } from "@/lib/world";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await getCoinDetail((await params).id);
  return { title: d ? `$${d.creature.ticker} · ${APP.name}` : APP.name, description: d?.description.slice(0, 160) };
}

export default async function CreaturePage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await getCoinDetail((await params).id);
  if (!detail) notFound();
  const c = detail.creature;
  return (
    <div className="page">
      <SiteHeader network={solanaNetwork()} />
      <main className="page-main creature-page">
        <section className="profile-hero glass">
          <div className="profile-portrait">
            <CreaturePortrait
              spec={{ family: c.family, variantIndex: c.variantIndex, palette: c.palette, hue: c.hue, patternSeed: c.patternSeed }}
              logoUrl={`/api/logo/${c.id}`}
              size={250}
              label={`${detail.species.variant} creature for $${c.ticker}`}
            />
            <span className="profile-species">{detail.species.variant}</span>
          </div>
          <div className="profile-main">
            <CreatureHeader detail={detail} />
            <CopyAddress address={detail.mint} explorer={detail.explorer.token} />
            <div className="profile-actions">
              <LinksRow detail={detail} />
              <Link className="btn-secondary" href="/">← Back to the city</Link>
            </div>
          </div>
          <HeadlineStats detail={detail} />
        </section>
        <div className="profile-grid">
          <div className="profile-col">
            <MarketCard detail={detail} page />
            <OriginCard detail={detail} showLinks={false} />
          </div>
          <div className="profile-col">
            <SpeciesCard detail={detail} />
            <EffectsCard detail={detail} />
            <NewsCard detail={detail} />
          </div>
        </div>
      </main>
      <footer className="page-footer">{APP.disclaimer} · {APP.dataCredit}</footer>
    </div>
  );
}
