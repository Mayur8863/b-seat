import { describe, expect, it } from 'vitest';

import { OfferedTimeZone, PlainText } from './field-formats.js';

describe('OfferedTimeZone', () => {
  it('accepts canonical offered zones and UTC', () => {
    for (const zone of ['Europe/London', 'Asia/Kolkata', 'America/New_York', 'UTC']) {
      expect(OfferedTimeZone.safeParse(zone).success).toBe(true);
    }
  });

  it('rejects legacy, wrong-case, offset and prototype-key values', () => {
    for (const zone of [
      'Asia/Calcutta',
      'europe/london',
      '+05:30',
      'US/Pacific',
      '__proto__',
      'x'.repeat(65),
    ]) {
      expect(OfferedTimeZone.safeParse(zone).success).toBe(false);
    }
  });
});

describe('PlainText', () => {
  it('accepts ordinary text including accents and non-latin scripts', () => {
    for (const v of ['Pune', 'Baner', "St. John's Wood", 'Zürich', 'पुणे', '東京', '']) {
      expect(PlainText.safeParse(v).success).toBe(true);
    }
  });

  it('rejects control characters', () => {
    for (const v of ['a\u0000', '\u0000', 'a\nb', 'a\tb', 'a\u007fb', 'a\u0085b']) {
      expect(PlainText.safeParse(v).success).toBe(false);
    }
  });

  it('rejects bidi override and isolate characters', () => {
    for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(PlainText.safeParse(`a${String.fromCodePoint(cp)}b`).success).toBe(false);
    }
  });
});
