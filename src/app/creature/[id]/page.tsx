import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP } from "@/config/app";
import { CreatureDetails, CreatureHeader } from "@/components/CreatureDetails";
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
        <section className="creature-hero glass">
          <CreaturePortrait
            spec={{ family: c.family, variantIndex: c.variantIndex, palette: c.palette, hue: c.hue, patternSeed: c.patternSeed }}
            logoUrl={`/api/logo/${c.id}`}
            size={240}
            label={`${detail.species.variant} creature for $${c.ticker}`}
          />
          <div className="creature-hero-text">
            <CreatureHeader detail={detail} />
            <Link className="btn-secondary" href="/">← Back to the city</Link>
          </div>
        </section>
        <div className="creature-grid">
          <CreatureDetails detail={detail} />
        </div>
      </main>
      <footer className="page-footer">{APP.disclaimer} · {APP.dataCredit}</footer>
    </div>
  );
}
