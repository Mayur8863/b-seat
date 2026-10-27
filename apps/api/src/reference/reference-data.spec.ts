import { describe, expect, it } from 'vitest';

import { isValidTimeZone } from '../common/time/zoned-time.js';
import {
  canonicalTimeZone,
  COUNTRIES,
  CURRENCIES,
  isCountryCode,
  isCurrencyCode,
} from './reference-data.js';
import { MAX_STANDARD_UTILITIES, STANDARD_UTILITIES } from './utilities.js';

describe('countries', () => {
  it('includes India and the United Kingdom with canonical zones first', () => {
    expect(COUNTRIES.find((c) => c.code === 'IN')).toEqual({
      code: 'IN',
      name: 'India',
      timeZones: ['Asia/Kolkata'],
    });
    expect(COUNTRIES.find((c) => c.code === 'GB')?.timeZones).toEqual(['Europe/London']);
  });

  it('is sorted by name and only has real, two-letter countries', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(COUNTRIES.length).toBeGreaterThan(200);
    for (const c of COUNTRIES) expect(c.code).toMatch(/^[A-Z]{2}$/);
    expect(isCountryCode('ZZ')).toBe(false);
  });

  it('offers only valid, non-legacy time zones', () => {
    for (const c of COUNTRIES) {
      for (const tz of c.timeZones) {
        expect(isValidTimeZone(tz)).toBe(true);
        expect(canonicalTimeZone(tz)).toBe(tz);
      }
    }
    expect(COUNTRIES.find((c) => c.code === 'UA')?.timeZones).toContain('Europe/Kyiv');
  });
});

describe('currencies and validators', () => {
  it('lists INR and GBP with names', () => {
    expect(CURRENCIES).toContainEqual({ code: 'INR', name: 'Indian Rupee' });
    expect(CURRENCIES.some((c) => c.code === 'GBP')).toBe(true);
  });

  it('validates codes', () => {
    expect(isCountryCode('IN')).toBe(true);
    expect(isCountryCode('in')).toBe(false);
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('XXX1')).toBe(false);
    expect(isCurrencyCode('ZZZ')).toBe(false);
  });
});

describe('utilities', () => {
  it('has the 11 OQ-8 items matching the DB cap', () => {
    expect(STANDARD_UTILITIES).toHaveLength(11);
    expect(MAX_STANDARD_UTILITIES).toBe(11);
  });
});

describe('data sanity', () => {
  const zones = (code: string) => COUNTRIES.find((c) => c.code === code)?.timeZones ?? [];

  it('gives plausible canonical zones for well-known countries', () => {
    expect(zones('IN')).toEqual(['Asia/Kolkata']);
    expect(zones('GB')).toEqual(['Europe/London']);
    expect(zones('US')).toEqual(
      expect.arrayContaining(['America/New_York', 'America/Los_Angeles']),
    );
    expect(zones('UA')).toContain('Europe/Kyiv');
    expect(zones('UA')).not.toContain('Europe/Kiev');
    expect(zones('AU')).toEqual(expect.arrayContaining(['Australia/Sydney', 'Australia/Perth']));
    expect(zones('BR')).toEqual(expect.arrayContaining(['America/Sao_Paulo']));
  });

  it('excludes pseudo-regions and offers common currencies', () => {
    for (const code of ['EU', 'UN', 'ZZ', 'QO', 'AA']) {
      expect(COUNTRIES.some((c) => c.code === code)).toBe(false);
    }
    for (const code of ['INR', 'GBP', 'USD', 'EUR']) expect(isCurrencyCode(code)).toBe(true);
  });
});
