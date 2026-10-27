import { describe, expect, it } from 'vitest';

import { OfferedTimeZone } from './field-formats.js';

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
