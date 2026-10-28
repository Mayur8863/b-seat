import { describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  describeFilters,
  filtersToApiParams,
  filtersToQuery,
  parseFilters,
  startDateError,
  type FindFilters,
} from './find-filters';

describe('parseFilters', () => {
  it('reads every filter, repeated utilities included', () => {
    const f = parseFilters(
      new URLSearchParams(
        'country=IN&city=Pune&area=Baner&startDate=2026-11-03&pass=week&slot=day&utilities=wifi&utilities=parking',
      ),
    );
    expect(f).toEqual({
      country: 'IN',
      city: 'Pune',
      area: 'Baner',
      startDate: '2026-11-03',
      pass: 'week',
      slot: 'day',
      utilities: ['wifi', 'parking'],
    });
  });

  it('drops unknown pass, slot and utility values and an empty query', () => {
    const f = parseFilters(
      new URLSearchParams('pass=year&slot=noon&utilities=jacuzzi&utilities=wifi'),
    );
    expect(f).toEqual({ ...EMPTY_FILTERS, utilities: ['wifi'] });
  });
});

describe('filtersToQuery', () => {
  it('omits empty values and round-trips through parseFilters', () => {
    const f: FindFilters = { ...EMPTY_FILTERS, country: 'IN', city: ' Pune ', utilities: ['wifi'] };
    const qs = filtersToQuery(f);
    expect(qs).toBe('country=IN&city=Pune&utilities=wifi');
    expect(parseFilters(new URLSearchParams(qs)).city).toBe('Pune');
  });
});

describe('filtersToApiParams', () => {
  it('sends utilities as an array only when some are ticked, and the cursor when given', () => {
    expect(filtersToApiParams({ ...EMPTY_FILTERS, country: 'IN' })).toEqual({ country: 'IN' });
    expect(
      filtersToApiParams(
        { ...EMPTY_FILTERS, country: 'IN', utilities: ['wifi'], pass: 'day' },
        'c1',
      ),
    ).toEqual({ country: 'IN', utilities: ['wifi'], pass: 'day', cursor: 'c1' });
  });
});

describe('startDateError', () => {
  const today = new Date(2026, 10, 1);
  it('accepts empty and in-range dates, rejects others', () => {
    expect(startDateError('', today)).toBeUndefined();
    expect(startDateError('2026-11-01', today)).toBeUndefined();
    expect(startDateError('2026-12-01', today)).toBeUndefined();
    expect(startDateError('2026-10-31', today)).toBe(
      'Choose a date from 1 Nov 2026 to 1 Dec 2026.',
    );
    expect(startDateError('2026-12-02', today)).toMatch(/^Choose a date from/);
  });
});

describe('describeFilters', () => {
  it('lists the applied secondary filters', () => {
    expect(
      describeFilters({
        ...EMPTY_FILTERS,
        country: 'IN',
        pass: 'week',
        slot: 'day',
        startDate: '2026-11-03',
        utilities: ['wifi', 'parking'],
      }),
    ).toBe('Pass: Weekly pass · Slot: Day slot · Starting Tue 3 Nov 2026 · With Wi-Fi, Parking');
    expect(describeFilters({ ...EMPTY_FILTERS, country: 'IN' })).toBe('');
  });
});
