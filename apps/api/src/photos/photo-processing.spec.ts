import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { processPhoto } from './photo-processing.js';

const GPS_EXIF = {
  IFD0: { Artist: 'Camera Owner Jane', ImageDescription: 'secret' },
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '51/1 30/1 0/1',
    GPSLongitudeRef: 'W',
    GPSLongitude: '0/1 7/1 0/1',
  },
  IFD2: { BodySerialNumber: 'SN-123456' },
};

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 90, b: 30 } } });
}

function pattern(width: number, height: number) {
  // A left-to-right gradient so crops and orientation are observable and encoders have real data.
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 128;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

async function ok(bytes: Buffer) {
  const result = await processPhoto(bytes);
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result;
}

describe('processPhoto', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'turns a 2000x1500 %s into a card and a display',
    async (format) => {
      const input = await pattern(2000, 1500).toFormat(format).toBuffer();
      const result = await ok(input);
      expect(result.format).toBe(format);
      expect([result.width, result.height]).toEqual([1600, 1200]);
      const card = await sharp(result.card).metadata();
      const display = await sharp(result.display).metadata();
      expect([card.format, card.width, card.height]).toEqual(['webp', 640, 480]);
      expect([display.format, display.width, display.height]).toEqual(['webp', 1600, 1200]);
    },
  );

  it('never enlarges the display variant', async () => {
    const input = await solid(1000, 800).jpeg().toBuffer();
    const result = await ok(input);
    expect([result.width, result.height]).toEqual([1000, 800]);
    expect((await sharp(result.display).metadata()).width).toBe(1000);
  });

  it('makes a card of exactly 640x480 from a panorama', async () => {
    const input = await solid(800, 300).png().toBuffer();
    const result = await ok(input);
    const card = await sharp(result.card).metadata();
    expect([card.width, card.height]).toEqual([640, 480]);
  });

  it('strips EXIF (GPS, owner, serial), XMP and IPTC from both variants', async () => {
    const input = await solid(1200, 900).withExif(GPS_EXIF).jpeg().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await ok(input);
    for (const variant of [result.card, result.display]) {
      const meta = await sharp(variant).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(variant.includes(Buffer.from('SN-123456'))).toBe(false);
      expect(variant.includes(Buffer.from('Camera Owner'))).toBe(false);
    }
  });

  it('applies EXIF orientation 6 so the display is portrait', async () => {
    const input = await solid(2000, 1500).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const result = await ok(input);
    expect([result.width, result.height]).toEqual([1200, 1600]);
    const display = await sharp(result.display).metadata();
    expect([display.width, display.height]).toEqual([1200, 1600]);
  });

  it('rejects a PDF named .jpg, a GIF, an animated WebP, an SVG and a HEIC header as unsupported', async () => {
    const gif = await solid(900, 900).gif().toBuffer();
    const frame = await solid(900, 900).png().toBuffer();
    const animated = await sharp([frame, await pattern(900, 900).png().toBuffer()], {
      join: { animated: true },
    })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    const samples: Buffer[] = [
      Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'),
      gif,
      animated,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>'),
      Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)]),
      Buffer.alloc(0),
    ];
    for (const bytes of samples) {
      expect(await processPhoto(bytes)).toEqual({ ok: false, reason: 'unsupported-format' });
    }
  });

  it('rejects truncated JPEG bytes as unreadable', async () => {
    const input = await pattern(2000, 1500).jpeg().toBuffer();
    expect(await processPhoto(input.subarray(0, Math.floor(input.length / 2)))).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(await processPhoto(input.subarray(0, 20))).toEqual({ ok: false, reason: 'unreadable' });
  });

  it.each([
    ['long edge 799', 799, 600],
    ['long edge 12001', 12_001, 100],
    ['56 MP', 8000, 7000],
  ])('rejects %s as out of range', async (_name, width, height) => {
    const input = await solid(width, height).png({ compressionLevel: 9 }).toBuffer();
    expect(await processPhoto(input)).toEqual({ ok: false, reason: 'dimensions-out-of-range' });
  });

  it('rejects an APNG (acTL before IDAT) as unsupported', async () => {
    const png = await solid(900, 900).png().toBuffer();
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(1, 0);
    actl.writeUInt32BE(0, 4);
    const withActl = insertChunk(png, 'acTL', actl);
    expect(await processPhoto(withActl)).toEqual({ ok: false, reason: 'unsupported-format' });
  });

  it('accepts a PNG with ancillary chunks but no acTL', async () => {
    const png = await solid(900, 900).png().toBuffer();
    await ok(insertChunk(png, 'tEXt', Buffer.from('Comment\0hi')));
  });

  describe('worst-case fixtures', () => {
    async function measure(bytes: Buffer) {
      let peak = process.memoryUsage().rss;
      const timer = setInterval(() => {
        peak = Math.max(peak, process.memoryUsage().rss);
      }, 50);
      const started = Date.now();
      const result = await processPhoto(bytes);
      clearInterval(timer);
      peak = Math.max(peak, process.memoryUsage().rss);
      return { result, ms: Date.now() - started, peakMiB: Math.round(peak / 1024 / 1024) };
    }

    it('handles a 50 MP 16-bit RGBA PNG with orientation 6 within the timeout', async () => {
      // 7000 x 7000 = 49 MP; orientation 6 makes autoOrient rotate the whole image.
      const bytes = await sharp({
        create: {
          width: 7000,
          height: 7000,
          channels: 4,
          background: { r: 10, g: 120, b: 200, alpha: 1 },
        },
      })
        .toColourspace('rgb16')
        .withMetadata({ orientation: 6 })
        .png({ compressionLevel: 1 })
        .toBuffer();
      expect((await sharp(bytes).metadata()).depth).toBe('ushort');
      const { result, ms, peakMiB } = await measure(bytes);
      console.warn(`worst-case 16-bit RGBA PNG: ${ms} ms, process peak RSS ${peakMiB} MiB`);
      expect(ms).toBeLessThan(16_000);
      expect(result.ok || result.reason === 'unreadable').toBe(true);
    }, 60_000);

    it('handles a 50 MP progressive JPEG within the timeout', async () => {
      const bytes = await pattern(7000, 7000).jpeg({ progressive: true, quality: 90 }).toBuffer();
      const { result, ms, peakMiB } = await measure(bytes);
      console.warn(`worst-case progressive JPEG: ${ms} ms, process peak RSS ${peakMiB} MiB`);
      expect(ms).toBeLessThan(16_000);
      expect(result.ok || result.reason === 'unreadable').toBe(true);
    }, 60_000);
  });
});

function crc32(data: Buffer): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

/** Inserts a PNG chunk (with a valid CRC) right after IHDR, so before any IDAT. */
function insertChunk(png: Buffer, type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  const afterIhdr = 8 + 25; // signature + IHDR chunk (4 + 4 + 13 + 4)
  return Buffer.concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]);
}
