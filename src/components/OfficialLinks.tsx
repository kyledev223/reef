"use client";

import { useState } from "react";
import { OFFICIAL, officialPumpFunUrl } from "@/config/app";

/** The project's token address (with copy), its pump.fun page and its X account. Hidden until configured. */
export function OfficialLinks() {
  const [copied, setCopied] = useState(false);
  const pump = officialPumpFunUrl();
  if (!OFFICIAL.mint && !OFFICIAL.twitter) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(OFFICIAL.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the full address is in the tooltip.
    }
  };

  return (
    <div className="official-links">
      {OFFICIAL.mint && (
        <button className="ca-chip" onClick={copy} title={`Official token address: ${OFFICIAL.mint} (click to copy)`}>
          <span className="ca-label">CA</span>
          <span className="mono">{OFFICIAL.mint.slice(0, 4)}…{OFFICIAL.mint.slice(-4)}</span>
          <span aria-live="polite" className="ca-copy">{copied ? "Copied" : "Copy"}</span>
        </button>
      )}
      {pump && (
        <a className="icon-link" href={pump} target="_blank" rel="noopener noreferrer" aria-label="Official token on pump.fun" title="Official token on pump.fun">
          {/* simple pill mark */}
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <g transform="rotate(-45 12 12)">
              <rect x="3" y="8" width="18" height="8" rx="4" fill="#ffffff" />
              <path d="M12 8h5a4 4 0 0 1 0 8h-5z" fill="#5fd37f" />
              <rect x="3" y="8" width="18" height="8" rx="4" fill="none" stroke="#053845" strokeWidth="1.4" />
            </g>
          </svg>
          <span className="icon-link-label">pump.fun</span>
        </a>
      )}
      {OFFICIAL.twitter && (
        <a className="icon-link" href={OFFICIAL.twitter} target="_blank" rel="noopener noreferrer" aria-label="Follow on X" title="Follow on X">
          <span aria-hidden className="x-mark">𝕏</span>
        </a>
      )}
    </div>
  );
}
