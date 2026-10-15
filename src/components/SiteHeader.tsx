"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP } from "@/config/app";
import type { SolanaNetwork } from "@/config/data";
import { OfficialLinks } from "./OfficialLinks";

const LINKS = [
  { href: "/", label: "City", icon: "🏛️" },
  { href: "/rankings", label: "Rankings", icon: "🏆" },
  { href: "/hatchery", label: "Hatchery", icon: "🥚" },
];

/** Full-width top bar shown on every page. */
export function SiteHeader({ network }: { network?: SolanaNetwork }) {
  const path = usePathname();
  const onHatchery = path.startsWith("/hatchery");
  return (
    <header className="site-header">
      <Link href="/" className="header-brand" aria-label={`${APP.name} home`}>
        <span className="brand-mark" aria-hidden>🪸</span>
        <span className="brand-name">{APP.name}</span>
      </Link>
      <nav aria-label="Main" className="header-nav">
        <ul>
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""}>
                  <span aria-hidden className="nav-icon">{l.icon}</span>
                  <span className="nav-label">{l.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="header-right">
        <OfficialLinks />
        {network === "devnet" && <span className="net-badge" title="Test network: tokens have no value">devnet</span>}
        {!onHatchery && (
          <Link href="/hatchery" className="btn-primary header-cta">
            🥚 Hatch a creature
          </Link>
        )}
      </div>
    </header>
  );
}
