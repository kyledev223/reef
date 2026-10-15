# Reefworld

A sunken city where every creature was hatched by a player as a real token on pump.fun. Each
creature's look comes from its token image and address, and its size, mood and speed follow the token's
live on-chain data.

> Market data is for gameplay only. Not financial advice.

Design: [docs/DESIGN.md](docs/DESIGN.md). Deploying: see [Deploy on Vercel](#deploy-on-vercel).

## Run it locally

Requirements: Node 20+, Docker (for Postgres), and a Solana wallet extension (Phantom or Solflare) to hatch creatures.

```bash
npm install
cp .env.example .env          # defaults to Solana devnet (free test tokens)
npm run db:up                 # Postgres on localhost:5433
npm run db:deploy             # apply migrations
npm run dev                   # web on http://localhost:3000 + the data worker
```

Pages: **City** `/` (the living map), **Rankings** `/rankings`, **Hatchery** `/hatchery` (create a creature),
and a page per creature at `/creature/<id>`.

### Hatching on devnet
1. Switch your wallet to devnet and get free devnet SOL at https://faucet.solana.com.
2. Open the Hatchery, fill in the form, connect your wallet, sign in (free message signature), and approve
   the transaction. The creature appears in Shell Plaza once Solana confirms the token.

`node scripts/e2e-devnet-hatch.cjs` runs the whole flow against the local server with a throwaway wallet
(fund the address it prints with ~0.05 devnet SOL first).

### Wallets
OKX Wallet, Phantom and Solflare are listed in the wallet picker (with install links if missing), and other
Wallet Standard wallets are detected automatically. OKX only supports Solana mainnet.

### Mainnet
Set `SOLANA_NETWORK="mainnet-beta"` (and, for real traffic, a dedicated `SOLANA_RPC_URL`). Token images and
metadata go to pump.fun's IPFS upload, so no other setup is needed. On mainnet, hatching creates real tokens
and costs real SOL (the network fee plus the new token accounts' rent), paid by the player's wallet. The site
never holds keys or funds and never buys tokens.

## Deploy on Vercel

1. **Database:** create a Postgres database. The simplest is Vercel's Storage tab: add **Neon** (free tier) to
   the project, which sets `DATABASE_URL` for you. Supabase or any hosted Postgres also works.
2. **Import the repo** in Vercel (Add New → Project). Framework: Next.js. No build settings to change:
   Vercel runs the `vercel-build` script, which generates the Prisma client, applies database migrations
   and builds the app.
3. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Postgres connection string (set automatically if you added Neon from Vercel) |
   | `SOLANA_NETWORK` | `mainnet-beta` for real tokens, or `devnet` for testing |
   | `SITE_URL` | your site's public URL, e.g. `https://your-project.vercel.app` |
   | `CRON_SECRET` | any long random string (protects `/api/cron`) |
   | `SOLANA_RPC_URL` | recommended for mainnet: a dedicated RPC (Helius, QuickNode, Triton…); the public one is rate-limited |
   | `COINGECKO_API_KEY` | optional (SOL price) |
   | `PINATA_JWT` | optional backup for token metadata storage |

4. **Deploy.** After the first deploy, set `SITE_URL` to the real URL if you didn't know it yet, and redeploy.

**Keeping data fresh without a server.** There's no long-running worker on Vercel. Instead:
- Each time someone loads the city, the jobs that are due (bonding curves, SOL price, DexScreener, snapshots)
  run in the background after the response is sent. A database lock stops two runs from overlapping.
- `vercel.json` adds a daily Vercel Cron call to `/api/cron` as a backstop. That's the most often the free
  Hobby plan allows. On Pro, change the schedule (e.g. `*/2 * * * *`), or point any external scheduler (such
  as cron-job.org) at `https://your-site/api/cron?secret=<CRON_SECRET>` every few minutes.
- Launches finish confirming even without the cron: the Hatchery checks on-chain while the player waits.

## Notes
- `npm test` runs the unit tests; `npm run worker` runs the data worker on its own (one instance polls at a time).
- All balance numbers and limits: `src/config/balance.ts`. Game name: `src/config/app.ts`. Networks, program id
  and moderation denylist: `src/config/data.ts`.
- If a data source is down, the reef keeps showing the last cached real values with a "Data as of" label.
