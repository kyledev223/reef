"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletNotReadyError, WalletReadyState, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import type { SolanaNetwork } from "@/config/data";
import { OkxWalletAdapter } from "./okxAdapter";
import "@solana/wallet-adapter-react-ui/styles.css";

function browserName(): string {
  if (typeof navigator === "undefined") return "this browser";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return (navigator as Navigator & { brave?: unknown }).brave ? "Brave" : "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "this browser";
}

/**
 * Wallet connection for the Hatchery. OKX Wallet, Phantom and Solflare are always listed; any other
 * Wallet Standard wallet the browser has is detected automatically. When the chosen wallet isn't
 * installed in this browser we explain what to do instead of silently opening a download page.
 * The connection endpoint is only used by the wallet UI; transactions go through our server.
 */
export function SolanaProviders({ network, children }: { network: SolanaNetwork; children: React.ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [new OkxWalletAdapter(), new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  const [missing, setMissing] = useState<{ name: string; url: string; icon: string } | null>(null);

  const onError = useCallback((error: WalletError, adapter?: Adapter) => {
    if (error instanceof WalletNotReadyError && adapter) {
      setMissing({ name: adapter.name, url: adapter.url, icon: adapter.icon });
      return;
    }
    console.error(error, adapter);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect localStorageKey="reefworld-wallet" onError={onError}>
        <WalletModalProvider>
          {children}
          <NotInstalledWatcher onMissing={(a) => setMissing({ name: a.name, url: a.url, icon: a.icon })} />
          {missing && <MissingWallet wallet={missing} onClose={() => setMissing(null)} />}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/** Picking a wallet that isn't installed explains what to do right away (and un-selects it). */
function NotInstalledWatcher({ onMissing }: { onMissing: (adapter: Adapter) => void }) {
  const { wallet, select } = useWallet();
  useEffect(() => {
    if (wallet && wallet.readyState === WalletReadyState.NotDetected) {
      onMissing(wallet.adapter);
      select(null);
    }
  }, [wallet, select, onMissing]);
  return null;
}

function MissingWallet({ wallet, onClose }: { wallet: { name: string; url: string; icon: string }; onClose: () => void }) {
  const browser = browserName();
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="missing-wallet-title" onClick={onClose}>
      <div className="modal card glass missing-wallet" onClick={(e) => e.stopPropagation()}>
        <div className="missing-wallet-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallet.icon} alt="" width={44} height={44} />
          <h2 id="missing-wallet-title">{wallet.name} isn’t installed in {browser}</h2>
        </div>
        <p className="small">
          Wallet extensions only exist in the browser you installed them in. If you already have {wallet.name} in another
          browser (for example Edge or Chrome), open this page there instead.
        </p>
        <ol className="steps">
          <li>
            Install {wallet.name} for {browser} from its{" "}
            <a href={wallet.url} target="_blank" rel="noopener noreferrer">official download page</a>.
          </li>
          <li>Come back and reload this page.</li>
          <li>
            Click <strong>Select Wallet</strong> → <strong>{wallet.name}</strong>. If the wallet is new, it opens its own setup
            page where you create or import a wallet, then asks you to connect.
          </li>
        </ol>
        <div className="hatch-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <a className="btn-primary" href={wallet.url} target="_blank" rel="noopener noreferrer">Get {wallet.name}</a>
        </div>
      </div>
    </div>
  );
}
