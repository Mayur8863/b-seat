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
