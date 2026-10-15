# Reefworld — Design

Status: steps 1–2 built, then re-scoped on 2026-10-14 (see "Direction change"). Every number here lives in
`src/config/balance.ts` and is expected to move during the step-5 balance pass. The game name lives in
`src/config/app.ts`.

---

## 0. Direction change (2026-10-14)

Decided after the step-2 review:

| Before | Now |
|--------|-----|
| The reef showed real meme coins pulled from CoinGecko's meme category and DexScreener themes. | **Those coins were removed.** The reef shows only creatures **hatched through the site**. |
| No wallet connect, no token launching. | **The Hatchery launches real tokens on pump.fun.** Players connect Phantom/Solflare and pay the network costs themselves. |
| — | New pages: **Rankings** and **Hatchery**, plus a shareable page per creature. Names are reef-themed, not pumpworld's. |
| Creatures stayed in one zone. | Creatures **roam** between districts and keep their distance from each other. |
| Open reef with six soft zones. | **Sunken city (Atlantis-style)**: winding sand paths that creatures walk on, landmark buildings that open an info panel when clicked, and a full-width top navigation bar (added 2026-10-14). |

Rules that still hold: no in-app purchases; no betting or price predictions; Pearls are earn-only with no
cash value; the site never buys or sells tokens; no coin is labelled a recommendation; and the
disclaimer footer stays.

---

## 1. Hatching and data

### Hatching a creature (non-custodial)
1. **Form (Hatchery page):** name (≤32), ticker (≤10, letters/digits), origin story (≤500), image
   (PNG/JPEG/WebP ≤2 MB), optional X/Telegram/website links. A live preview shows the exact creature it
   will become.
2. **Mint key in the browser:** the token's mint keypair is generated client-side and never sent anywhere.
   Its address seeds the species, so "Different species" just generates a new keypair.
3. **Connect:** OKX Wallet, Phantom and Solflare are always listed (with install links when missing), and
   other Wallet Standard wallets are detected automatically. OKX uses its own adapter
   (`window.okxwallet.solana`); if OKX isn't set up yet, its connect() opens OKX's own onboarding page.
   **Sign in:** the wallet signs a plain one-time message. It's free, not a transaction, and moves no
   funds. The server verifies the ed25519 signature and sets an httpOnly session cookie.
4. **Prepare (`POST /api/hatch`):** the server validates and moderates the fields, re-encodes the image
   (stripping EXIF), and stores the token metadata through **pump.fun's own IPFS upload** (no key needed,
   same format pump.fun produces). Pinata (`PINATA_JWT`) is the backup; self-hosting at `/api/meta/<id>` is
   used only on devnet or with a public https `SITE_URL`. Limits: 5 launches per wallet per day and 10 per IP per hour.
5. **Build (`POST /api/hatch/<id>/build`):** the server builds the transaction with the official
   `@pump-fun/pump-sdk` `createV2Instruction`: **create only, no dev buy**, plus a compute budget. It's a legacy
   (non-versioned) transaction, which every wallet supports. The SDK is loaded through Node's CommonJS
   loader, because its ES-module build fails to import `BN` from anchor. It
   simulates the transaction to estimate the cost and catch failures (e.g. not enough SOL).
6. **Review:** network, "creates the token, no purchase", the estimated cost, and the token address. The
   player approves in their wallet. **The wallet signs first, then the browser adds the mint signature**
   (the order wallets recommend, in case a wallet adjusts fee settings).
7. **Relay (`POST /api/hatch/<id>/submit`):** the server sends the transaction only if all of these hold:
   - it's paid by the signed-in wallet
   - it contains exactly this launch's pump.fun create instruction (same data, same accounts), with
     nothing else except compute-budget settings
   - every signature verifies

   This way the relay can't be used for anything else.
8. **Confirm:** the status endpoint (and a worker job, in case the page was closed) waits for
   confirmation. It then checks on-chain that the token's pump.fun bonding curve exists **with the
   launching wallet as creator**. Only then is the creature created and "🥚 $TICKER hatched!" posted to the feed.

Network: `SOLANA_NETWORK` = `devnet` (test tokens with no value; the default in `.env.example`) or
`mainnet-beta` (real tokens). **The local `.env` is set to mainnet as of 2026-10-14** (the user's choice; OKX
Wallet only supports Solana mainnet). For production, set a dedicated `SOLANA_RPC_URL`; the public endpoint is
rate-limited.

Verified 2026-10-14:
- pump.fun's program and Global account exist on both devnet and mainnet.
- A simulated `createV2` on devnet with a funded payer succeeds (~101k compute units, ≈0.0055 SOL + fees).
- My hand-written bonding-curve decoder matches the account the program creates, and my PDA derivation
  matches the SDK's.

Also verified 2026-10-14:
- A simulated legacy create succeeds on mainnet (~98k compute units).
- The server flow passes on mainnet up to Solana: sign-in, pump.fun upload, build, and the relay refusing an
  extra instruction or a missing signature.
- In a browser, the Hatchery runs through the OKX adapter (with a stand-in OKX provider) from connect and
  sign-in to the review dialog.

Not yet verified: a real launch confirming on-chain. It needs a wallet holding SOL.

### Live data per hatched creature
| Field | Source | Notes |
|-------|--------|-------|
| market cap (SOL), price | pump.fun bonding curve, read directly from Solana every 2 min | `supply × virtualSol / virtualToken` |
| market cap / price (USD) | × SOL/USD (CoinGecko simple price, every 5–10 min) | |
| graduated | bonding curve `complete` flag | feed event "🎓 … outgrew the nursery" |
| liquidity, DEX volume 24h | DexScreener `token-pairs/v1` (mainnet only, every 5 min) | DexScreener doesn't index devnet; shown as "—" with a tooltip |
| 24h change | DexScreener if listed, otherwise our own snapshots (market cap in SOL, 23–29 h ago) | "—" until 24 h of history exists |
| market cap after graduation | DexScreener main pair | |

Missing values show "—" with an (i) tooltip saying why (devnet, not listed yet, needs 24 h of history,
waiting for the first curve reading…).

### Rules
- Creatures are never deleted: players may own them later. Moderation (word denylist on name, ticker and
  story; key denylist in `src/config/data.ts`) hides them instead.
- **Species never change:** `speciesSeed = "<network>:<mint>"`.
- **Never a recommendation:** badges are factual (mood, tier, rarity, "Hatched today", "Graduated"). The
  creature page links to Solscan, not to a trading page.
- **Official links (2026-10-14, the user's decision):** the header shows the project's own token address
  (with copy), a **pump.fun** button for it and an **X** button. Values live in `OFFICIAL` in
  `src/config/app.ts`; each button stays hidden until its value is set. This is the one deliberate
  exception to "no trading links"; creature pages still link only to Solscan.
- Snapshot retention: 10-min resolution for 48 h, hourly for 30 days, daily after that.

---

## 2. Market layer → creature stats

Each stat's market multiplier is the product of the parts below, **clamped to [0.80, 1.20]**.

### Size tier (market cap, USD; scaled for fresh pump.fun coins)
| Tier | Market cap | HP mod | Visual scale |
|------|-----------|--------|--------------|
| Hatchling | < $10k | −6% | 0.75× |
| Juvenile | $10k – $50k | −3% | 0.9× |
| Adult | $50k – $500k | 0 | 1.05× |
| Elder | $500k – $5M | +3% | 1.25× |
| Leviathan-class | ≥ $5M | +6% | 1.5× |

### Speed (DEX volume ÷ liquidity, percentile among creatures)
`speedMod = (percentile − 0.5) × 2 × 0.15` → −15% … +15%. Neutral when DexScreener has no data (always on devnet).

### Mood (24h change, with hysteresis)
New coins swing hard, so the thresholds are higher than they were for established memes:

| Mood | Enter | Leave | Effect (log-scaled up to a ±200% move) |
|------|-------|-------|--------|
| Frenzy | ≥ +25% | < +18% | ATK +6…+18%, DEF −6…−18% |
| Calm | otherwise | — | none |
| Sulking | ≤ −25% | > −18% | DEF +6…+18%, ATK −6…−18% |

Feed events fire only on mood transitions.

### Rarity (market-cap rank among creatures)
Legendary 1–5, Epic 6–20, Rare 21–60, Uncommon 61–150, Common 151+ (all-stat +4% … 0).

### Species & colours (deterministic)
- Family and variant come from a hash of `speciesSeed`; 6 families with 3–4 variants each.
- **Ring type chart:** `Eel → Octopus → Crab → Turtle → Jelly → Fish → Eel` (×1.5 / ×0.67).
- Colours are the 3 dominant colours of the token image (same algorithm in the browser preview and on the
  server). The image itself is a round emblem on the creature.

### The city map, and where creatures live and roam
- **Layout** (`src/lib/city.ts`, pure data shared by the renderer and the UI):
  - Paths: winding **sand paths** (72 px; 104 px for the two main avenues). The street plan is a 7×5 grid
    underneath, but every crossing is nudged up to 46 px off the grid and every path is a gentle S-curve
    (up to 30 px), so the city reads as old and grown rather than planned. Four grid segments are left out
    where a large landmark spans two blocks.
  - Shell Plaza: a round sand ring around the Great Shell fountain.
  - Each block's buildable area is computed from where its surrounding paths actually run. Landmarks fill
    their block. House blocks are split into 3–4 lots in one of four patterns (quad, wide + two, tall + two,
    three strips), and each building fills most of its lot.
  - Unit tests check that the network is connected, that crossings are off-grid and paths wander, that no
    building touches a path or the plaza, that every block leaves real room to build, and that every
    building has history, features and facts.
- **Look** (`src/render/city.ts`), seen from straight above with light from the top-left:
  - Roofs: hip roofs with four shaded slopes, tile courses and chimneys; L-shaped villas; flat roofs with
    seams, skylights and vents; domes and conical tower roofs.
  - Shadows: soft, cast to the bottom-right.
  - Grounds: paved or garden yards with rounded corners, on a sea-meadow ground under the whole city.
  - Gaps: kelp trees, coral and rocks fill every gap between paths and buildings.
- **Districts** keep the game's zones: Shell Plaza, Kelp Gardens, Coral Market, Current Racetrack, Sunken
  Ship Docks, Trench Gate.
- **Landmarks** each have a description; some note a planned feature or link to a page:
  - Palace of Tides (future raid announcements)
  - Great Shell Fountain
  - Hall of Records (links to Rankings)
  - Temple of First Light (links to the Hatchery)
  - Pearl Archive (future Reefdex)
  - Vent Springs
  - Coral Market Arcade (future Pearl shop)
  - Beacon of the Deep
  - Current Racetrack (future races)
  - Kelp Gardens
  - Sunken Ship Docks
  - Trench Gate (future raid boss)
- **Houses:** 28 generated buildings (domes, towers, cottages, shrines, workshops, grottos), each with a
  unique name and a short description.
- **Clicking any building** opens a panel (bottom sheet on phones). It sizes to its content and shows:
  - the building's summary and a paragraph of history
  - "At a glance" facts (type, when it was built, and per-building facts)
  - "What's here" features, plus a note on any planned game feature
  - a link, for the Hall of Records and the Temple
  - **"Around here right now"**: creatures currently walking past, read live from the map
  - the district card: who lives there, a mood breakdown, the largest resident and the residents list
    (click any creature to jump to it)
- **Home district** follows live traits:
  - hatched in the last 24 h → Shell Plaza
  - Frenzy or top-8% trading pace → Current Racetrack
  - Sulking → Sunken Ship Docks
  - Elder/Leviathan → Trench Gate
  - Adult → Kelp Gardens
  - small → Coral Market
- **Walking only on roads:**
  - Creatures move along the curved paths between crossings, taking the shortest route (BFS) to a
    crossing in the district they're visiting.
  - They visit 2–4 crossings in a district, then pick the next district: home ~65% of the time, another
    district 35% (60% in a Frenzy).
  - They keep to the right-hand lane (so two-way traffic passes), slow down behind same-direction traffic,
    and sometimes pause at a crossing as if visiting a building.
  - School members follow their leader's footsteps.
- **New hatches** emerge from the Great Shell fountain and walk out onto the plaza.

---

## 3. Player layer & battle system

### Stat formula
```
stat = familyBase × variantTweak(±5%)
     × levelScale(L)          // (L + 4) / 5  → L1 = 1.0, L50 = 10.8
     × (1 + training + gear)  // training ≤ +10% per stat, gear ≤ +12%
     × marketMult             // clamped 0.80–1.20
```
A 5-level gap is worth ~1.2× on stats *and* ~1.2× through the damage formula (≈1.44× effective). Even
the largest market swing (±20%) cannot beat that, but it decides fights between evenly matched teams.
**The player layer decides most fights, and the market tips close ones.**

### Battle rules
- Turn-based. Your team of 3 vs a wild creature (1 in Kelp Forest, up to 3 in deeper zones) or the Raid boss.
- Turn order by SPD (ties broken by seeded RNG). Switching uses your turn.
- Damage: `floor(((0.4·L + 2) · power · ATK/DEF) / 50 + 2) × typeMult × sameFamily(1.2) × crit(1.5, 6%) × rand(0.90–1.00)`.
- **4 move slots:** 2 innate family moves (e.g. Octopus: *Ink Cloud* (enemy accuracy −), *Eight-Arm Lash*)
  + 2 learned moves (learned at Shell Plaza with Pearls, or from expedition scroll drops). ~36 moves total.
  Status effects: Stun, Ink (accuracy −), Shell Up (DEF +), Sting (damage over time), Haste.
- **Market visibility:** each creature card shows mood/tier/speed badges and an
  "Today: ATK +14% / DEF −14% (Frenzy, +38%)" line, so players see why tomorrow plays differently.
- **Catching:** beat a wild creature → it joins your collection at its battle level. If you already own the
  species, you get species Essence instead (merge for +XP/training). Wild level = your team's average
  ±2, bounded by zone range.
- **Server-authoritative:** the client sends only the chosen action each turn. The server resolves the turn
  with a seeded RNG and stores battle state. The client never computes results it reports back.

### Progression curves (simulated)
- Creature XP to next level: `12 · L^1.55` (L5: 145, L10: 426, L20: 1,247, L30: 2,337, L49: 5,000;
  total ≈ 98.6k).
- Battle win XP to every participant: `8 + 4.5 · enemyLevel` (losses give 30%).
- Expedition XP: `minutes × (4 + 0.6·L)` to the creature sent.
- Simulated pace: one creature from L5 → L20 in ~2.8 h of active play, L30 ~5.7 h, L50 ~13.6 h. That is
  roughly 4 weeks at 30 min/day.
- Keeper XP to next: `60 · K^1.5` (K5 at 1,022, K10 at ~7k, K20 at ~46k). Sources: battle win 25, catch 40,
  expedition 20/40/60/90, race 30 (+30 win), raid attempt 50, daily quest 100, one-time tutorial milestones
  totalling 300.

### Unlocks by Keeper level
| K | Unlock |
|---|--------|
| 1 | Kelp Forest (wild L2–12), Shell Plaza (training, quests, decor), 1 expedition slot |
| 3 | Coral Market (gear & decor shop, priced in Pearls only) |
| 4 | Current Racetrack |
| 5 | Daily Leviathan Raid |
| 6 | 2nd expedition slot |
| 7 | Sunken Ship (wild L10–25, 2-creature packs) |
| 12 | Trench (wild L20–40, 3-creature packs) |
| 15 | 3rd expedition slot |

### Expeditions (real-time)
| Duration | Pearls (× zone: Kelp 1.0, Ship 1.3, Trench 1.6) | Gear chance | Encounter lead chance |
|----------|------|------|------|
| 5 min | 20 | 5% | 30% |
| 15 min | 50 | 12% | 45% |
| 30 min | 90 | 20% | 60% |
| 60 min | 160 | 35% | 80% |

Shorter runs pay more per minute for active players, and longer runs suit players checking in. An
encounter lead is a wild creature (from real tracked coins, weighted by rarity, sometimes a New Arrival)
waiting to be battled when you collect.

### Pearls (earn-only, no cash value)
- **Earned from:** expeditions, battles (5 + enemy level), races, raid, quests (60 each, +100 for all 3),
  achievements.
- **Spent on:** training points (escalating cost), learning moves (50 → 400), gear (fixed shop prices, no
  random boxes), and home-reef decor.
- No purchases, no gambling mechanics, no loot boxes, and no Pearls ↔ crypto in either direction.

### Current Races (skill)
Side-scrolling course with lanes of current. The player steers (keys / drag) to ride fast streams and
dodge jellies and rocks, and taps a **burst** when the bubble meter crosses its sweet zone (timing). The
creature's speed changes top speed by at most ±8%. A clean run beats a sloppy run on a faster creature.
3 ghost opponents are recorded runs from other players. Validation: the course is generated from a
server seed, the client uploads an input log, and the server re-simulates deterministically. A submitted
time that doesn't match the re-simulation is rejected.

### Daily Leviathan Raid
- At 00:00 UTC the worker picks the tracked coin with the largest |24h change|, filtered to mcap ≥ $5M and
  liquidity ≥ $100k so illiquid noise can't be chosen. It becomes a giant boss of its species at
  Leviathan scale. Its mood follows the coin live through the day.
- Global HP pool (scaled from yesterday's participants), shown as a shared progress bar.
- 3 attempts/day, each 6 turns with your team. Damage is computed server-side (same battle engine).
- Rewards: participation + tier by contribution percentile (top 1% / 10% / 50%). If the global pool is
  depleted, everyone gets a bonus, and the boss's species is guaranteed to appear in your next expedition lead.

### Daily quests & achievements
Each day 3 quests are drawn from a pool, e.g. "Win 3 battles", "Catch a creature that's in a Frenzy",
"Finish a race without a collision", "Hit today's Leviathan", "Send 2 expeditions", "Win with a
type-advantage hit". Achievements cover Reefdex milestones, one creature of each family, L50, and more.

### Reefdex
Completion % = species owned ÷ currently tracked coins, plus an all-time count. Coins that drop out of
tracking stay in collections as **Drifted**: they remain fully playable, and their market layer is frozen
at the last real values with a "data as of" label.

---

## 4. The first 30 minutes

| Time | Beat |
|------|------|
| 0:00 | Enter a name → guest save created. A short fly-over of the live reef shows real creatures swimming. |
| 0:01 | **Pick a starter** from 3 creatures on the reef (needs revisiting now that the reef holds only hatched creatures: e.g. 3 recent hatches from different families). Starter is L5. Each card shows the token's live data and today's mood. |
| 0:03 | Tutorial battle in Kelp Forest vs a wild L3 → **first catch**. Explains type ring + mood badges. |
| 0:06 | Send a creature on a forced 5-min expedition. Daily quests appear. |
| 0:07–0:11 | 2 more wild battles → third catch → **full team of 3**. Keeper 2–3. |
| 0:11 | Expedition returns: Pearls, a guaranteed first gear piece, and an encounter lead. |
| 0:13 | Shell Plaza: learn first move (50 Pearls). Coral Market unlocks (K3). |
| 0:17 | Keeper 4 → **first race** (easy ghosts, steering + burst tutorial). |
| 0:22 | Keeper 5 → **hit today's Leviathan** once and see your damage join the global total. |
| 0:25 | Fight the encounter lead (could be a New Arrival). Explore the Reef map and find your species. |
| 0:30 | Keeper ~5, team ~L7–8, Reefdex 3–4 coins, ~250 Pearls, a 30-min expedition running as a reason to come back. 2/3 daily quests done. |

---

## 5. Architecture

- **Next.js (App Router) + TypeScript.** Built pages: `/` Reef, `/rankings`, `/hatchery`, `/creature/[id]`.
  Planned: `/keeper`, battle, race and raid screens. The world feed is polled (`/api/feed?after=<id>`, every 10 s).
- **Solana:** `@solana/web3.js`, the official `@pump-fun/pump-sdk` (server-side transaction building only),
  and `@solana/wallet-adapter` (Wallet Standard: Phantom, Solflare…) on the Hatchery page. The worker reads
  bonding curves with its own decoder (`src/lib/solana/curve.ts`), because the SDK can't be imported by plain-Node ESM.
- **Postgres + Prisma.** Built: Coin (hatched creature), CoinSnapshot, Launch, WalletNonce, WalletSession,
  KeyValue, SourceStatus, WorldEvent. Planned: Keeper, Creature (owned instance), Move, Gear, Expedition,
  Battle (state JSON + seed), RaceRun, RaidDay, RaidAttempt, DailyQuest, Achievement, DecorItem.
- **Worker** (`worker/`, plain Node + tsx, shares Prisma + config): bonding curves, SOL price, DexScreener
  sweep, finishing in-flight launches, derived moods, snapshots and housekeeping. It holds a Postgres
  advisory lock, so only one instance polls.
- **Emblems** are made from the uploaded token image at hatch time (128 px round WebP) and served from
  `/api/logo/[coinId]`, so Pixi textures stay CORS-clean.
- **Rendering:** PixiJS v8 + pixi-viewport for pan and zoom. Creature parts are drawn procedurally per
  family and baked to one texture per species, with the logo emblem baked in (so 300+ creatures are cheap
  sprites). The city (`src/render/city.ts`) is drawn as top-down vector art: marble roads with lamps,
  domes, colonnades, the hippodrome, the docks and the trench gate. Buildings have rectangle hit areas
  under the creature layer, so creatures win clicks when they overlap. The seabed is painted once on a
  low-res canvas and scaled up. Caustics are a generated tileable
  texture on two drifting additive layers, particles are plain sprites, and off-screen sprites are culled.
- **Accounts:** wallet sign-in (built, used by the Hatchery). Planned for step 4: guest saves with a device
  token, and an optional email magic link; a wallet can be linked to a Keeper.
- **Anti-cheat:** server-authoritative battles and raid. Races are re-simulated from input logs.
  Rate-limits on action endpoints. Leaderboards read only server-written results.
- **Config:** `src/config/balance.ts` holds every tier, cap, curve, timer, limit and reward above, plus
  `src/config/data.ts` (endpoints, networks, pump.fun program id, denylist). Secrets and network choice come from env.
- **Deploy target (step 5 README):** web on Vercel or any Node host, worker on Railway/Fly/Render, and
  Postgres on Neon/Supabase. Alternatively, one VPS running `docker compose up` (web + worker + db).

## 6. Decisions from the step-1 review
1. **Name:** "Reefworld" for now, kept in one value (`APP.name` in `src/config/app.ts`).
2. **CoinGecko Demo key:** read from `COINGECKO_API_KEY` (see `.env.example`). Without it the worker still
   runs, with slower polling and a console warning.
3. ~~DexScreener themes stay in~~: superseded on 2026-10-14. All real market coins were removed; see section 0.
4. **Async PvP:** not now. See "Later".
5. **2026-10-14:** the reef shows only hatched creatures; the Hatchery launches real pump.fun tokens
   (non-custodial, create only); pages Reef / Rankings / Hatchery / creature; roaming creatures.

## Testing
- `npm test`: 25 unit tests (market layer, species, moderation, curve decoding and pricing, form validation, palette, DexScreener aggregation).
- End-to-end launch on devnet: `scripts/e2e-devnet-hatch.cjs` (needs a devnet wallet with ~0.05 SOL; the public faucet often rate-limits).
  Verified so far: sign-in (bad signatures rejected), prepare, self-hosted metadata, build + simulation, relay refusing a tampered transaction, and a successful funded simulation of `createV2` on devnet.
  **Not yet verified:** a real submitted launch confirming on-chain and hatching (blocked on devnet SOL), and mainnet with Pinata.

## 7. Later

### Async PvP: battle another Keeper's saved team
A player picks an opponent from a list of other Keepers' published teams and fights a **server-run copy**
of that team. The opponent isn't online; the server picks the copy's moves.

How step 3's battle engine keeps this cheap to add:
- **The engine is a pure function:** `resolveTurn(state, actions, rng) → { state, log }`. It doesn't know
  whether an action came from a player, a wild-creature AI, or the Leviathan.
- **Each side is a controller:** `player` (actions from the API), `wild-ai`, `boss-ai`, and later `ghost-ai`
  (plays a saved team with the same policy interface). Battles store `sides[{ controller, team }]`, not
  "player vs wild".
- **Teams are snapshotted into the battle:** level, moves, gear, training, plus the market modifiers at
  battle start. A saved-team copy then plays with the stats it had when it was published, and a battle
  can be replayed from `(seed, initial state, action list)`.
- **Results are already server-written,** so PvP ratings can be another leaderboard table without new
  trust problems.

What PvP itself would still need: a `PublishedTeam` table, opponent matchmaking by rating band, a rating
system (e.g. Glicko-2), and rate limits on attempts.
