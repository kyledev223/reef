import sharp, { type Metadata } from "sharp";
import { HATCH } from "@/config/balance";
import { paletteFromRgba } from "./palette";

const EMBLEM = 128;
const circleMask = Buffer.from(
  `<svg width="${EMBLEM}" height="${EMBLEM}"><circle cx="${EMBLEM / 2}" cy="${EMBLEM / 2}" r="${EMBLEM / 2}" fill="#fff"/></svg>`,
);

export class ImageError extends Error {}

/**
 * Validate and re-encode an uploaded token image. Re-encoding strips EXIF/metadata and
 * anything that isn't pixels. Returns a PNG for the token metadata.
 */
export async function normaliseUpload(input: Buffer): Promise<Buffer> {
  if (input.length > HATCH.imageMaxBytes) throw new ImageError("Image is larger than 2 MB.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ImageError("That file isn't a readable image.");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) {
    throw new ImageError("Use a PNG, JPEG or WebP image.");
  }
  if ((meta.width ?? 0) < 64 || (meta.height ?? 0) < 64) throw new ImageError("Image must be at least 64×64 px.");
  return sharp(input, { animated: false })
    .rotate()
    .resize(HATCH.imageMaxEdge, HATCH.imageMaxEdge, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Round emblem (transparent outside the circle) for the creature, plus its colour palette. */
export async function emblemAndPalette(png: Buffer): Promise<{ webp: Buffer; palette: string[] }> {
  const webp = await sharp(png)
    .resize(EMBLEM, EMBLEM, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: circleMask, blend: "dest-in" }])
    .webp({ quality: 82 })
    .toBuffer();
  const { data, info } = await sharp(png).resize(40, 40, { fit: "cover" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { webp, palette: paletteFromRgba(data, info.channels) };
}
