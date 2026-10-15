"use client";

import { useState } from "react";

/** A token's contract address (CA), shown in full with a copy button. */
export function CopyAddress({ address, explorer }: { address: string; explorer?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the address stays selectable.
    }
  };
  return (
    <div className="ca-row">
      <span className="ca-row-label">CA</span>
      <code className="ca-row-address mono" title={address}>{address}</code>
      <button type="button" className="ca-row-btn" onClick={copy} aria-label="Copy contract address">
        <span aria-live="polite">{copied ? "Copied ✓" : "Copy"}</span>
      </button>
      {explorer && (
        <a className="ca-row-btn" href={explorer} target="_blank" rel="noopener noreferrer" aria-label="View token on Solscan">
          Solscan ↗
        </a>
      )}
    </div>
  );
}
