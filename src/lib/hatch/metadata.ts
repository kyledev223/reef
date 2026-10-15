/**
 * Token image + metadata JSON, in the format pump.fun's own site produces.
 * Stored, in order of preference:
 *   1. pump.fun's IPFS upload (no key needed; what pump.fun itself uses)
 *   2. Pinata, when PINATA_JWT is set
 *   3. served by this site from the Launch row: only where it can stay reachable
 *      (devnet, or a public https SITE_URL)
 */
import { ENDPOINTS } from "@/config/data";
import { POLLING } from "@/config/balance";
import { pinataJwt, siteUrl, solanaNetwork } from "@/lib/solana/server";

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export type MetadataHost = "pumpfun" | "pinata" | "self";

interface Input {
  launchId: string;
  png: Buffer;
  name: string;
  ticker: string;
  description: string;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
}

const gateway = () => (process.env.PINATA_GATEWAY_URL?.trim() || "https://ipfs.io/ipfs").replace(/\/+$/, "");

async function viaPumpFun(input: Input): Promise<{ imageUrl: string; metadataUri: string; json: TokenMetadata }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.png)], { type: "image/png" }), `${input.ticker}.png`);
  form.append("name", input.name);
  form.append("symbol", input.ticker);
  form.append("description", input.description);
  if (input.twitter) form.append("twitter", input.twitter);
  if (input.telegram) form.append("telegram", input.telegram);
  if (input.website) form.append("website", input.website);
  form.append("showName", "true");
  const res = await fetch(ENDPOINTS.pumpIpfs, { method: "POST", body: form, signal: AbortSignal.timeout(POLLING.requestTimeoutMs * 2) });
  if (!res.ok) throw new Error(`pump.fun upload failed (HTTP ${res.status})`);
  const r = (await res.json()) as { metadataUri?: string; metadata?: TokenMetadata };
  if (!r.metadataUri || !r.metadata?.image) throw new Error("pump.fun upload returned no metadata URI");
  return { imageUrl: r.metadata.image, metadataUri: r.metadataUri, json: r.metadata };
}

async function pinata(url: string, body: BodyInit, json: boolean): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${pinataJwt()}`, ...(json ? { "content-type": "application/json" } : {}) },
    body,
    signal: AbortSignal.timeout(POLLING.requestTimeoutMs * 2),
  });
  if (!res.ok) throw new Error(`IPFS pinning failed (HTTP ${res.status})`);
  const r = (await res.json()) as { IpfsHash?: string };
  if (!r.IpfsHash) throw new Error("IPFS pinning returned no hash");
  return r.IpfsHash;
}

function baseJson(input: Input) {
  return {
    name: input.name,
    symbol: input.ticker,
    description: input.description,
    showName: true,
    createdOn: siteUrl(),
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
    ...(input.website ? { website: input.website } : {}),
  };
}

async function viaPinata(input: Input) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.png)], { type: "image/png" }), `${input.ticker}.png`);
  form.append("pinataMetadata", JSON.stringify({ name: `${input.ticker}-image` }));
  const imageCid = await pinata(ENDPOINTS.pinataPinFile, form, false);
  const json: TokenMetadata = { ...baseJson(input), image: `${gateway()}/${imageCid}` };
  const metaCid = await pinata(ENDPOINTS.pinataPinJson, JSON.stringify({ pinataContent: json, pinataMetadata: { name: `${input.ticker}-metadata` } }), true);
  return { imageUrl: json.image, metadataUri: `${gateway()}/${metaCid}`, json };
}

const selfHostingIsSafe = () => solanaNetwork() === "devnet" || /^https:\/\/(?!localhost|127\.0\.0\.1)/.test(siteUrl());

export async function storeMetadata(input: Input): Promise<{ imageUrl: string; metadataUri: string; host: MetadataHost; json: TokenMetadata }> {
  const errors: string[] = [];
  try {
    return { ...(await viaPumpFun(input)), host: "pumpfun" };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (pinataJwt()) {
    try {
      return { ...(await viaPinata(input)), host: "pinata" };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (selfHostingIsSafe()) {
    const imageUrl = `${siteUrl()}/api/meta/${input.launchId}/image`;
    return { imageUrl, metadataUri: `${siteUrl()}/api/meta/${input.launchId}`, host: "self", json: { ...baseJson(input), image: imageUrl } };
  }
  throw new Error(`Couldn't store the token metadata: ${errors.join("; ")}`);
}
