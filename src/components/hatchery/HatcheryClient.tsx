"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair, Transaction } from "@solana/web3.js";
import { APP } from "@/config/app";
import { HATCH } from "@/config/balance";
import { NETWORK_LABEL, explorerUrl } from "@/config/data";
import { speciesFor } from "@/lib/market/species";
import { paletteFromRgba } from "@/lib/palette";
import type { HatchConfig } from "@/lib/solana/server";
import { CreaturePortrait } from "../CreaturePortrait";
import { FAMILY_ICON } from "../icons";
import { SolanaProviders } from "./SolanaProviders";

type Phase =
  | { k: "form" }
  | { k: "working"; label: string }
  | { k: "review"; launchId: string; tx: string; cost: number | null; simError: string | null }
  | { k: "confirming"; launchId: string; signature: string }
  | { k: "done"; coinId: string; mint: string; signature: string }
  | { k: "failed"; message: string };

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function postJson<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T };
}

/** Palette from a chosen image, computed in the browser the same way the server does it. */
async function paletteOf(file: File): Promise<string[]> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = c.height = 40;
  const ctx = c.getContext("2d")!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 40, 40);
  return paletteFromRgba(ctx.getImageData(0, 0, 40, 40).data);
}

export function HatcheryClient({ config }: { config: HatchConfig }) {
  return (
    <SolanaProviders network={config.network}>
      <HatcheryForm config={config} />
    </SolanaProviders>
  );
}

function HatcheryForm({ config }: { config: HatchConfig }) {
  const { publicKey, signMessage, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [mint, setMint] = useState<Keypair | null>(null);
  const [fields, setFields] = useState({ name: "", ticker: "", description: "", twitter: "", telegram: "", website: "" });
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ k: "form" });
  const [acknowledged, setAcknowledged] = useState(false);
  const pendingSubmit = useRef(false);

  // The mint keypair is created here, in the browser, and never leaves it. Its address seeds the species.
  useEffect(() => setMint(Keypair.generate()), []);
  const species = useMemo(() => (mint ? speciesFor(`${config.network}:${mint.publicKey.toBase58()}`) : null), [mint, config.network]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const onImage = async (file: File | undefined) => {
    setErrors((e) => ({ ...e, image: "" }));
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setErrors((e) => ({ ...e, image: "Use a PNG, JPEG or WebP image." }));
    if (file.size > HATCH.imageMaxBytes) return setErrors((e) => ({ ...e, image: "Image is larger than 2 MB." }));
    setImage(file);
    setImageUrl(URL.createObjectURL(file));
    setPalette(await paletteOf(file).catch(() => []));
  };

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: "" }));
  };

  const ensureSignedIn = useCallback(async () => {
    const wallet = publicKey!.toBase58();
    const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    if (me.wallet === wallet) return;
    if (!signMessage) throw new Error("This wallet can't sign messages. Try Phantom or Solflare.");
    const n = await postJson<{ nonce: string; message: string; error?: string }>("/api/auth/nonce", { wallet });
    if (!n.ok) throw new Error(n.data.error ?? "Couldn't start sign-in.");
    const sig = await signMessage(new TextEncoder().encode(n.data.message));
    const v = await postJson<{ error?: string }>("/api/auth/verify", { wallet, nonce: n.data.nonce, signature: toB64(sig) });
    if (!v.ok) throw new Error(v.data.error ?? "Sign-in failed.");
  }, [publicKey, signMessage]);

  const build = useCallback(async (launchId: string) => {
    setPhase({ k: "working", label: "Preparing the transaction…" });
    const b = await postJson<{ tx: string; estimatedCostSol: number | null; simulationError: string | null; error?: string; code?: string }>(`/api/hatch/${launchId}/build`);
    if (!b.ok) throw new Error(`${b.data.error ?? "Couldn't prepare the transaction."}${b.data.code ? ` (error code: ${b.data.code})` : ""}`);
    setPhase({ k: "review", launchId, tx: b.data.tx, cost: b.data.estimatedCostSol, simError: b.data.simulationError });
  }, []);

  const start = useCallback(async () => {
    if (!publicKey || !mint) return;
    if (!image) return setErrors((e) => ({ ...e, image: "Add an image for your creature." }));
    try {
      setPhase({ k: "working", label: "Check your wallet to sign in (free, no transaction)…" });
      await ensureSignedIn();
      setPhase({ k: "working", label: "Storing your token image and details…" });
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append("mint", mint.publicKey.toBase58());
      form.append("image", image);
      const r = await fetch("/api/hatch", { method: "POST", body: form });
      const data = (await r.json().catch(() => ({}))) as { launchId?: string; error?: string; errors?: Record<string, string> };
      if (data.errors) {
        setErrors(data.errors);
        setPhase({ k: "form" });
        return;
      }
      if (!r.ok || !data.launchId) throw new Error(data.error ?? "Couldn't start hatching.");
      await build(data.launchId);
    } catch (err) {
      setPhase({ k: "failed", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, [publicKey, mint, image, fields, ensureSignedIn, build]);

  // If the player clicked "Hatch" before connecting, continue once the wallet connects.
  useEffect(() => {
    if (connected && pendingSubmit.current) {
      pendingSubmit.current = false;
      start();
    }
  }, [connected, start]);

  const approve = async (p: Extract<Phase, { k: "review" }>) => {
    if (!signTransaction || !mint) return;
    try {
      setPhase({ k: "working", label: "Approve the transaction in your wallet…" });
      // The wallet signs first, then the token key (the order wallets recommend, in case the
      // wallet adjusts fee settings before signing).
      const tx = Transaction.from(fromB64(p.tx));
      const signed = await signTransaction(tx);
      signed.partialSign(mint);
      setPhase({ k: "working", label: "Sending to Solana…" });
      const s = await postJson<{ signature?: string; error?: string; retry?: boolean }>(`/api/hatch/${p.launchId}/submit`, { tx: toB64(signed.serialize()) });
      if (!s.ok || !s.data.signature) {
        if (s.data.retry) return build(p.launchId);
        throw new Error(s.data.error ?? "Solana rejected the transaction.");
      }
      setPhase({ k: "confirming", launchId: p.launchId, signature: s.data.signature });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/reject|cancel|declin/i.test(msg)) return setPhase(p); // player said no in the wallet: back to review
      setPhase({ k: "failed", message: msg });
    }
  };

  // Poll until the token is confirmed on-chain and the creature hatches.
  useEffect(() => {
    if (phase.k !== "confirming") return;
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/hatch/${phase.launchId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (!alive || !r) return;
      if (r.status === "CONFIRMED" && r.coinId) setPhase({ k: "done", coinId: r.coinId, mint: r.mint, signature: r.signature });
      else if (r.status === "FAILED") setPhase({ k: "failed", message: r.error ?? "The launch failed." });
    };
    const id = setInterval(tick, 2500);
    tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acknowledged) return setErrors((er) => ({ ...er, ack: "Please confirm you understand what hatching does." }));
    if (!connected) {
      pendingSubmit.current = true;
      setVisible(true);
      return;
    }
    start();
  };

  const reset = () => {
    setMint(Keypair.generate());
    setPhase({ k: "form" });
  };

  const mainnet = config.network === "mainnet-beta";
  const busy = phase.k === "working";

  if (phase.k === "done") {
    return (
      <div className="hatch-done card glass center">
        {species && <CreaturePortrait spec={{ ...species, palette }} logoUrl={imageUrl} size={200} label="Your new creature" />}
        <h2>🥚 ${fields.ticker.replace(/^\$/, "").toUpperCase()} hatched!</h2>
        <p>Your {species?.variant} is swimming in Shell Plaza.</p>
        <p className="links">
          <Link className="btn-primary" href={`/creature/${phase.coinId}`}>See your creature</Link>
          <Link className="btn-secondary" href="/">Visit the reef</Link>
        </p>
        <p className="small">
          <a href={explorerUrl(config.network, "token", phase.mint)} target="_blank" rel="noopener noreferrer">Token on Solscan</a>
          {" · "}
          <a href={explorerUrl(config.network, "tx", phase.signature)} target="_blank" rel="noopener noreferrer">Transaction</a>
        </p>
      </div>
    );
  }

  return (
    <div className="hatch-layout">
      <form className="hatch-form card glass" onSubmit={onSubmit} noValidate>
        {!config.enabled && <p className="notice warn">{config.disabledReason}</p>}
        {!mainnet && (
          <p className="notice">
            🧪 Test mode: hatching happens on <strong>Solana devnet</strong>. Devnet tokens have no value. Get free devnet SOL at{" "}
            <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">faucet.solana.com</a>.
          </p>
        )}

        <fieldset disabled={busy}>
          <legend>1 · Name your creature</legend>
          <label>
            <span>Name <span className="muted small">({fields.name.length}/{HATCH.nameMax})</span></span>
            <input value={fields.name} onChange={set("name")} maxLength={HATCH.nameMax} required placeholder="Captain Bubbles" />
          </label>
          {errors.name && <p className="field-error">{errors.name}</p>}
          <label>
            Ticker
            <input value={fields.ticker} onChange={set("ticker")} maxLength={HATCH.tickerMax + 1} required placeholder="BUBBLE" className="mono" />
          </label>
          {errors.ticker && <p className="field-error">{errors.ticker}</p>}
          <label>
            <span>Origin story <span className="muted small">({fields.description.length}/{HATCH.descriptionMax})</span></span>
            <textarea value={fields.description} onChange={set("description")} maxLength={HATCH.descriptionMax} rows={4} required placeholder="Where did this creature come from?" />
          </label>
          {errors.description && <p className="field-error">{errors.description}</p>}
        </fieldset>

        <fieldset disabled={busy}>
          <legend>2 · Give it a look</legend>
          <label className="drop">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onImage(e.target.files?.[0])} />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Your token image" />
            ) : (
              <span>Choose a token image<br /><span className="muted small">PNG, JPEG or WebP · up to 2 MB · square works best</span></span>
            )}
          </label>
          {errors.image && <p className="field-error">{errors.image}</p>}
          <p className="small muted">The image becomes your token’s picture and the emblem on your creature; its colours paint the creature.</p>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>3 · Links <span className="muted small">(optional)</span></legend>
          <label>𝕏 / Twitter<input value={fields.twitter} onChange={set("twitter")} placeholder="https://x.com/…" inputMode="url" /></label>
          {errors.twitter && <p className="field-error">{errors.twitter}</p>}
          <label>Telegram<input value={fields.telegram} onChange={set("telegram")} placeholder="https://t.me/…" inputMode="url" /></label>
          {errors.telegram && <p className="field-error">{errors.telegram}</p>}
          <label>Website<input value={fields.website} onChange={set("website")} placeholder="https://…" inputMode="url" /></label>
          {errors.website && <p className="field-error">{errors.website}</p>}
        </fieldset>

        <fieldset disabled={busy}>
          <legend>4 · Hatch</legend>
          <div className="disclosure">
            <p>
              Hatching creates a <strong>real token on {NETWORK_LABEL[config.network]}</strong> through pump.fun, with your wallet as its
              creator. Your wallet pays the network fee and the cost of the new token accounts; you’ll see the estimate here and the exact
              amount in your wallet before approving.
            </p>
            <p>
              {APP.name} never holds your keys or funds and doesn’t buy any of the token for you. A created token can’t be
              deleted or edited.
            </p>
          </div>
          <label className="check">
            <input type="checkbox" checked={acknowledged} onChange={(e) => { setAcknowledged(e.target.checked); setErrors((er) => ({ ...er, ack: "" })); }} />
            <span>I understand this creates a real, permanent token{mainnet ? " and costs SOL" : " on devnet"}.</span>
          </label>
          {errors.ack && <p className="field-error">{errors.ack}</p>}
          {errors.form && <p className="field-error">{errors.form}</p>}
          <div className="hatch-actions">
            <WalletMultiButton />
            <button type="submit" className="btn-primary" disabled={!config.enabled || busy || !mint}>
              🥚 Hatch creature
            </button>
          </div>
          {busy && <p className="working" role="status">{phase.label}</p>}
        </fieldset>
      </form>

      <aside className="hatch-preview card glass" aria-label="Preview">
        <h2>Your creature</h2>
        {species ? (
          <>
            <CreaturePortrait spec={{ ...species, palette }} logoUrl={imageUrl} size={240} label={`Preview: ${species.variant}`} />
            <p className="preview-name">
              {FAMILY_ICON[species.family]} <strong>{species.variant}</strong> <span className="muted">· {species.familyLabel} family</span>
            </p>
            <p className="small muted">
              {fields.name || "Unnamed"} {fields.ticker && <span className="mono">${fields.ticker.replace(/^\$/, "").toUpperCase()}</span>}
            </p>
            <button type="button" className="btn-secondary" onClick={() => setMint(Keypair.generate())} disabled={phase.k !== "form"}>
              🔀 Different species
            </button>
            <p className="small muted">The species comes from your token’s address, so a new address means a new creature.</p>
          </>
        ) : (
          <p className="muted">Preparing…</p>
        )}
      </aside>

      {phase.k === "review" && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="modal card glass">
            <h2 id="review-title">Ready to hatch ${fields.ticker.replace(/^\$/, "").toUpperCase()}</h2>
            <ul className="review-list">
              <li><span>Network</span><strong>{NETWORK_LABEL[config.network]}</strong></li>
              <li><span>What happens</span><strong>Creates the token on pump.fun (no purchase)</strong></li>
              <li><span>Estimated cost</span><strong>{phase.cost != null ? `≈ ${phase.cost.toFixed(4)} SOL` : "shown in your wallet"}</strong></li>
              <li><span>Token address</span><strong className="mono small">{mint?.publicKey.toBase58()}</strong></li>
            </ul>
            {phase.simError && <p className="notice warn">{phase.simError}</p>}
            <div className="hatch-actions">
              <button className="btn-secondary" onClick={() => setPhase({ k: "form" })}>Cancel</button>
              <button className="btn-primary" onClick={() => approve(phase)} disabled={!!phase.simError}>Approve in wallet</button>
            </div>
          </div>
        </div>
      )}

      {phase.k === "confirming" && (
        <div className="modal-backdrop" role="status">
          <div className="modal card glass center">
            <div className="egg" aria-hidden>🥚</div>
            <h2>Hatching…</h2>
            <p>Waiting for Solana to confirm your token.</p>
            <p className="small">
              <a href={explorerUrl(config.network, "tx", phase.signature)} target="_blank" rel="noopener noreferrer">View transaction</a>
            </p>
          </div>
        </div>
      )}

      {phase.k === "failed" && (
        <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="fail-title">
          <div className="modal card glass">
            <h2 id="fail-title">The egg didn’t hatch</h2>
            <p>{phase.message}</p>
            <div className="hatch-actions">
              <button className="btn-primary" onClick={reset}>Try again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

