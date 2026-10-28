import { describe, expect, it } from 'vitest';

import { parseListingParams, withListingParams } from './listing-params';

const offers = [
  { slot: 'day', prices: { day: '300.00', week: null, month: null } },
  { slot: 'full_day', prices: { day: '500.00', week: '3000.00', month: null } },
] as const;
const range = { min: '2026-10-28', max: '2026-11-27' };
const parse = (q: string) => parseListingParams(new URLSearchParams(q), [...offers], range);

describe('parseListingParams', () => {
  it('reads an offered pass, slot and a date in range', () => {
    expect(parse('pass=week&slot=full_day&startDate=2026-11-02')).toEqual({
      choice: { pass: 'week', slot: 'full_day' },
      startDate: '2026-11-02',
    });
  });
  it('ignores a pass that is not offered or priced', () => {
    expect(parse('pass=week&slot=day&startDate=2026-11-02')).toEqual({
      choice: null,
      startDate: '',
    });
    expect(parse('pass=year&slot=day').choice).toBeNull();
  });
  it('ignores a date outside the range or malformed, and a date without a pass', () => {
    expect(parse('pass=day&slot=day&startDate=2027-01-01').startDate).toBe('');
    expect(parse('pass=day&slot=day&startDate=soon').startDate).toBe('');
    expect(parse('startDate=2026-11-02').startDate).toBe('');
  });
});

describe('withListingParams', () => {
  it('sets, replaces and removes the three params, keeping the search', () => {
    const q = withListingParams(
      new URLSearchParams('country=IN&pass=day&slot=day&startDate=2026-11-01'),
      { pass: 'week', slot: 'full_day' },
      '2026-11-02',
    );
    expect(q).toBe('country=IN&pass=week&slot=full_day&startDate=2026-11-02');
    expect(withListingParams(new URLSearchParams(q), null, '')).toBe('country=IN');
  });
});
