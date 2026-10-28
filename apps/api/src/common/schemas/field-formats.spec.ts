import { describe, expect, it } from 'vitest';

import { MultilineText, OfferedTimeZone, PlainText } from './field-formats.js';

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

describe('PlainText format characters', () => {
  it('rejects zero-width, directional mark, BOM and line separator characters', () => {
    for (const cp of [0x200b, 0x200e, 0x200f, 0x061c, 0xfeff, 0x2028, 0x2029, 0x00ad]) {
      expect(PlainText.safeParse(`a${String.fromCodePoint(cp)}b`).success).toBe(false);
    }
  });

  it('keeps ZWNJ and emoji tag characters for Persian text and subdivision flags', () => {
    expect(PlainText.safeParse('خانه\u200Cها').success).toBe(true);
    expect(
      PlainText.safeParse('🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}').success,
    ).toBe(true);
    expect(PlainText.safeParse('a\u{E0001}b').success).toBe(false);
    expect(MultilineText.safeParse('خانه\u200Cها\nx').success).toBe(true);
  });

  it('keeps the zero-width joiner so emoji sequences work', () => {
    expect(PlainText.safeParse('👩\u200D💻').success).toBe(true);
  });
});

describe('MultilineText', () => {
  const parse = (v: string) => MultilineText.safeParse(v);

  it('allows newlines and normalises CRLF to LF', () => {
    expect(parse('a\nb').data).toBe('a\nb');
    expect(parse('a\r\nb\r\nc').data).toBe('a\nb\nc');
  });

  it('turns tabs into spaces', () => {
    expect(parse('a\tb').data).toBe('a b');
  });

  it('rejects NUL, a lone CR, C1 controls, bidi characters and format characters', () => {
    for (const v of ['a\u0000b', 'a\rb', 'a\u0085b', 'a\u202eb', 'a\u2067b', 'a\u200bb']) {
      expect(parse(v).success).toBe(false);
    }
  });
});
