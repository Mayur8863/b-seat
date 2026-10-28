import { describe, expect, it } from 'vitest';

import { utilityLabel } from './format';

describe('utilityLabel', () => {
  it('uses the standard label for a known code', () => {
    expect(utilityLabel('wifi')).toBe('Wi-Fi');
    expect(utilityLabel('security_24h')).toBe('24-hour security');
  });

  it('falls back to the code in sentence case', () => {
    expect(utilityLabel('standing_desks')).toBe('Standing desks');
  });
});
