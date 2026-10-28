import sharp from 'sharp';

// ADR-0011 section 4. Pure module: bytes in, variants or a typed rejection out.
// The file name and the client's Content-Type are never read; the format comes from the bytes.

export const PHOTO_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type PhotoFormat = (typeof PHOTO_FORMATS)[number];

export const MIN_LONG_EDGE = 800;
export const MAX_LONG_EDGE = 12_000;
export const MAX_PIXELS = 50_000_000;
export const CARD_WIDTH = 640;
export const CARD_HEIGHT = 480;
export const DISPLAY_MAX_EDGE = 1600;
const DECODE_TIMEOUT_SECONDS = 15;

export type PhotoRejection = 'unsupported-format' | 'unreadable' | 'dimensions-out-of-range';

export type PhotoProcessingResult =
  | {
      ok: true;
      /** Always exactly 640 x 480 WebP. */
      card: Buffer;
      /** WebP fitted inside 1600 x 1600, never enlarged. */
      display: Buffer;
      /** Pixel size of `display`. */
      width: number;
      height: number;
      /** The detected input format. */
      format: PhotoFormat;
    }
  | { ok: false; reason: PhotoRejection };

// Process-wide, one decode at a time per libuv slot; the semaphore lives with the caller (T008).
sharp.cache(false);
sharp.concurrency(1);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sniffFormat(bytes: Buffer): PhotoFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** libvips does not report APNG animation, so walk the chunk headers for `acTL` before `IDAT`. */
function isAnimatedPng(bytes: Buffer): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

function decoder(bytes: Buffer) {
  return sharp(bytes, { failOn: 'error', limitInputPixels: MAX_PIXELS }).timeout({
    seconds: DECODE_TIMEOUT_SECONDS,
  });
}

export async function processPhoto(bytes: Buffer): Promise<PhotoProcessingResult> {
  const format = sniffFormat(bytes);
  if (format === null) return { ok: false, reason: 'unsupported-format' };
  if (format === 'png' && isAnimatedPng(bytes)) return { ok: false, reason: 'unsupported-format' };

  try {
    // Header only: the pixel cap is judged below so it maps to a range error, not "unreadable".
    const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
    if ((meta.pages ?? 1) > 1) return { ok: false, reason: 'unsupported-format' };
    const { width, height } = meta;
    if (!width || !height) return { ok: false, reason: 'unreadable' };
    const longEdge = Math.max(width, height);
    if (longEdge < MIN_LONG_EDGE || longEdge > MAX_LONG_EDGE || width * height > MAX_PIXELS) {
      return { ok: false, reason: 'dimensions-out-of-range' };
    }

    // Decode once into a small, oriented, sRGB, 8-bit intermediate; both variants derive from it.
    // No metadata call is made anywhere, so EXIF, XMP, IPTC and ICC never reach the output.
    const { data, info } = await decoder(bytes)
      .autoOrient()
      .toColourspace('srgb')
      .resize(DISPLAY_MAX_EDGE, DISPLAY_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

    const [display, card] = await Promise.all([
      sharp(data, raw).webp({ quality: 80 }).toBuffer(),
      sharp(data, raw)
        .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover', position: 'centre' })
        .webp({ quality: 75 })
        .toBuffer(),
    ]);
    return { ok: true, card, display, width: info.width, height: info.height, format };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
