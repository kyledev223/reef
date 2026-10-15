// End-to-end devnet hatch through the real API, acting as the player's wallet with a throwaway keypair.
// Needs the dev server running (npm run dev) with SOLANA_NETWORK=devnet, and ~0.05 devnet SOL in the wallet.
// Usage: node scripts/e2e-devnet-hatch.cjs [keypairFile=.devnet-test-wallet.json] [baseUrl=http://localhost:3000]
//        DRY=1 node scripts/e2e-devnet-hatch.cjs   # stop before sending the transaction
const fs = require("fs");
const req = require;
const { Keypair, Connection, LAMPORTS_PER_SOL, Transaction, SystemProgram } = req("@solana/web3.js");
const { ed25519 } = req("@noble/curves/ed25519");
const sharp = req("sharp");
const base = process.argv[3] || "http://localhost:3000";

(async () => {
  const kpFile = process.argv[2] || ".devnet-test-wallet.json";
  let payer;
  if (fs.existsSync(kpFile)) payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpFile, "utf8"))));
  else { payer = Keypair.generate(); fs.writeFileSync(kpFile, JSON.stringify([...payer.secretKey])); }
  const wallet = payer.publicKey.toBase58();
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  let bal = await conn.getBalance(payer.publicKey);
  console.log("wallet", wallet, "balance", bal / LAMPORTS_PER_SOL);
  if (bal < 0.1 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      bal = await conn.getBalance(payer.publicKey);
      console.log("airdropped, balance", bal / LAMPORTS_PER_SOL);
    } catch (e) {
      console.log("AIRDROP FAILED:", e.message.slice(0, 200));
      console.log("Fund this wallet with devnet SOL (faucet.solana.com) and re-run:", wallet);
      if (!process.env.DRY) process.exit(2);
    }
  }

  let cookie = "";
  const call = async (method, url, body, isForm) => {
    const r = await fetch(base + url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  };

  // 1. Sign in
  const n = await call("POST", "/api/auth/nonce", { wallet });
  console.log("nonce:", n.status, n.data.message?.split("\n")[0]);
  const sig = ed25519.sign(new TextEncoder().encode(n.data.message), payer.secretKey.slice(0, 32));
  const v = await call("POST", "/api/auth/verify", { wallet, nonce: n.data.nonce, signature: Buffer.from(sig).toString("base64") });
  console.log("verify:", v.status, JSON.stringify(v.data));

  // Negative check: a bad signature must be rejected
  const n2 = await call("POST", "/api/auth/nonce", { wallet });
  const bad = await fetch(base + "/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, nonce: n2.data.nonce, signature: Buffer.alloc(64, 7).toString("base64") }) });
  console.log("bad signature rejected:", bad.status === 401);

  // 2. Prepare
  const mint = Keypair.generate();
  const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 255, g: 120, b: 80, alpha: 1 } } })
    .composite([{ input: Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="80" fill="#1aa6b8"/><circle cx="150" cy="110" r="18" fill="#fff"/></svg>') }])
    .png().toBuffer();
  const form = new FormData();
  form.append("name", "Reef Test Bubbles");
  form.append("ticker", "RTB" + Math.floor(Math.random() * 900 + 100));
  form.append("description", "A test creature hatched on devnet by the end-to-end check.");
  form.append("website", "example.com");
  form.append("mint", mint.publicKey.toBase58());
  form.append("image", new Blob([png], { type: "image/png" }), "bubbles.png");
  const p = await call("POST", "/api/hatch", form, true);
  console.log("prepare:", p.status, JSON.stringify(p.data));
  if (!p.data.launchId) process.exit(1);
  // ipfs.io no longer serves plain HTTP clients; read the same IPFS content through a public gateway that does
  const metaUrl = p.data.metadataUri.replace("https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/");
  const meta = await fetch(metaUrl).then((r) => r.json());
  console.log("metadata served:", JSON.stringify(meta));

  // 3. Build
  const b = await call("POST", `/api/hatch/${p.data.launchId}/build`);
  console.log("build:", b.status, "cost", b.data.estimatedCostSol, "simError", b.data.simulationError, b.data.error ?? "");
  if (!b.data.tx) process.exit(1);
  const tx = Transaction.from(Buffer.from(b.data.tx, "base64"));

  // Negative check: a transaction with an extra instruction (here: a transfer out) must be refused
  const evil = Transaction.from(Buffer.from(b.data.tx, "base64"));
  evil.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
  evil.sign(payer, mint);
  const ev = await call("POST", `/api/hatch/${p.data.launchId}/submit`, { tx: evil.serialize().toString("base64") });
  console.log("tampered tx refused:", ev.status === 400, ev.data.error);

  // Negative check: missing the token key's signature
  const half = Transaction.from(Buffer.from(b.data.tx, "base64"));
  half.partialSign(payer);
  const hv = await call("POST", `/api/hatch/${p.data.launchId}/submit`, { tx: half.serialize({ requireAllSignatures: false }).toString("base64") });
  console.log("unsigned token key refused:", hv.status === 400, hv.data.error);

  // 4. Sign (wallet first, then the token key, as the browser does) and submit
  tx.partialSign(payer);
  tx.partialSign(mint);
  const s = await call("POST", `/api/hatch/${p.data.launchId}/submit`, { tx: tx.serialize().toString("base64") });
  if (process.env.DRY) { console.log("DRY submit (expected to fail at Solana without funds, after passing our checks):", s.status, JSON.stringify(s.data)); return; }
  console.log("submit:", s.status, JSON.stringify(s.data));
  if (!s.data.signature) process.exit(1);

  // 5. Wait for the hatch
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const st = await call("GET", `/api/hatch/${p.data.launchId}`);
    process.stdout.write(`${st.data.status} `);
    if (st.data.status === "CONFIRMED" || st.data.status === "FAILED") {
      console.log("\nfinal:", JSON.stringify(st.data));
      const after = await conn.getBalance(payer.publicKey);
      console.log("spent SOL:", (bal - after) / LAMPORTS_PER_SOL, "(estimate was", b.data.estimatedCostSol, ")");
      if (st.data.coinId) {
        const d = await call("GET", `/api/coins/${st.data.coinId}`);
        console.log("coin:", d.status, d.data.creature?.ticker, d.data.creature?.family, d.data.species?.variant, "mcapSol", d.data.stats?.marketCapSol?.value, "creator", d.data.creatorShort);
      }
      return;
    }
  }
  console.log("\ntimed out waiting");
})().catch((e) => { console.error(e); process.exit(1); });
