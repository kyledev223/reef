import type { Metadata } from "next";
import { APP } from "@/config/app";
import { HatcheryClient } from "@/components/hatchery/HatcheryClient";
import { SiteHeader } from "@/components/SiteHeader";
import { hatchConfig } from "@/lib/solana/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Hatchery · ${APP.name}` };

export default function HatcheryPage() {
  const config = hatchConfig();
  return (
    <div className="page">
      <SiteHeader network={config.network} />
      <main className="page-main">
        <section className="page-hero">
          <h1>The Hatchery</h1>
          <p className="muted">
            Hatch a new creature for the city. It is born as a real token on pump.fun, and its look comes from your
            token image and its address.
          </p>
        </section>
        <HatcheryClient config={config} />
      </main>
      <footer className="page-footer">{APP.disclaimer} · {APP.dataCredit}</footer>
    </div>
  );
}
