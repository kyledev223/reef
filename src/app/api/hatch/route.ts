/**
 * Step 1 of hatching: validate the form, re-encode the image, store the token metadata.
 * Returns a launch id; the transaction is built separately (/build) so it can be rebuilt
 * with a fresh blockhash if the player takes a while to approve.
 */
import { randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { HATCH } from "@/config/balance";
import { sessionWallet } from "@/lib/auth/wallet";
import { db } from "@/lib/db";
import { checkFields } from "@/lib/hatch/validate";
import { storeMetadata } from "@/lib/hatch/metadata";
import { ImageError, normaliseUpload } from "@/lib/images";
import { hatchConfig } from "@/lib/solana/server";

export async function POST(req: Request) {
  const config = hatchConfig();
  if (!config.enabled) return Response.json({ error: config.disabledReason }, { status: 503 });
  const wallet = await sessionWallet();
  if (!wallet) return Response.json({ error: "Connect and sign in with your wallet first." }, { status: 401 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const [perWallet, perIp] = await Promise.all([
    db.launch.count({ where: { wallet, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    ip ? db.launch.count({ where: { ip, createdAt: { gt: new Date(Date.now() - 3_600_000) } } }) : 0,
  ]);
  if (perWallet >= HATCH.perWalletPerDay || perIp >= HATCH.perIpPerHour) {
    return Response.json({ error: "You've started a lot of hatchings recently. Please try again later." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Malformed form." }, { status: 400 });
  }
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const checked = checkFields(raw);
  if (!checked.ok) return Response.json({ errors: checked.errors }, { status: 422 });
  const f = checked.fields;

  let mint: PublicKey;
  try {
    mint = new PublicKey(f.mint);
  } catch {
    return Response.json({ errors: { form: "Invalid token address." } }, { status: 422 });
  }
  if (await db.launch.findUnique({ where: { mint: mint.toBase58() } })) {
    return Response.json({ errors: { form: "That token address was already used. Reload and try again." } }, { status: 409 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) return Response.json({ errors: { image: "Add an image for your creature." } }, { status: 422 });
  if (file.size > HATCH.imageMaxBytes) return Response.json({ errors: { image: "Image is larger than 2 MB." } }, { status: 422 });
  let png: Buffer;
  try {
    png = await normaliseUpload(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return Response.json({ errors: { image: err instanceof ImageError ? err.message : "Couldn't read that image." } }, { status: 422 });
  }

  const id = randomUUID().replace(/-/g, "");
  let meta: Awaited<ReturnType<typeof storeMetadata>>;
  try {
    meta = await storeMetadata({ launchId: id, png, name: f.name, ticker: f.ticker, description: f.description, twitter: f.twitter, telegram: f.telegram, website: f.website });
  } catch (err) {
    console.error("metadata upload failed", err);
    return Response.json({ error: "Couldn't store the token image right now. Please try again." }, { status: 502 });
  }

  await db.launch.create({
    data: {
      id,
      wallet,
      network: config.network,
      ip,
      name: f.name,
      ticker: f.ticker,
      description: f.description,
      twitter: f.twitter,
      telegram: f.telegram,
      website: f.website,
      imagePng: new Uint8Array(png),
      imageUrl: meta.imageUrl,
      metadataUri: meta.metadataUri,
      metadataHost: meta.host,
      mint: mint.toBase58(),
    },
  });
  return Response.json({ launchId: id, metadataUri: meta.metadataUri, network: config.network });
}
