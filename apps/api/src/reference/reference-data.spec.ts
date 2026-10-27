import { describe, expect, it } from 'vitest';

import { isValidTimeZone } from '../common/time/zoned-time.js';
import { ISO_COUNTRY_CODES } from './countries.js';
import {
  canonicalTimeZone,
  COUNTRIES,
  CURRENCIES,
  isCountryCode,
  isCurrencyCode,
  isOfferedTimeZone,
  PRIMARY_TIME_ZONE,
  REFERENCE,
} from './reference-data.js';
import { MAX_STANDARD_UTILITIES, STANDARD_UTILITIES } from './utilities.js';

const zonesOf = (code: string) => COUNTRIES.find((c) => c.code === code)?.timeZones ?? [];

describe('countries', () => {
  it('includes India and the United Kingdom', () => {
    expect(COUNTRIES.find((c) => c.code === 'IN')).toEqual({
      code: 'IN',
      name: 'India',
      timeZones: ['Asia/Kolkata'],
    });
    expect(zonesOf('GB')).toEqual(['Europe/London']);
  });

  it('is the committed ISO list: no deprecated aliases, unique names, sorted', () => {
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(COUNTRIES.length).toBeLessThanOrEqual(249);
    for (const code of ['UK', 'SU', 'DD', 'YU', 'CS', 'ZZ', 'EU', 'XK']) {
      expect(isCountryCode(code)).toBe(false);
    }
    expect(isCountryCode('in')).toBe(false);
    const names = COUNTRIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('keeps countries that have no zones', () => {
    expect(zonesOf('BV')).toEqual([]);
    expect(isCountryCode('BV')).toBe(true);
  });
});

describe('time zones', () => {
  it('offers only valid, current, unique zones', () => {
    for (const c of COUNTRIES) {
      expect(new Set(c.timeZones).size).toBe(c.timeZones.length);
      for (const tz of c.timeZones) {
        expect(isValidTimeZone(tz)).toBe(true);
        expect(canonicalTimeZone(tz)).toBe(tz);
        expect(isOfferedTimeZone(tz)).toBe(true);
      }
    }
    expect(zonesOf('UA')).toContain('Europe/Kyiv');
  });

  it('has a primary zone, from its own list and first, for every multi-zone country', () => {
    for (const c of COUNTRIES.filter((x) => x.timeZones.length > 1)) {
      const primary = PRIMARY_TIME_ZONE.get(c.code);
      expect(primary, `${c.code} needs a primary zone`).toBeDefined();
      expect(c.timeZones[0]).toBe(primary);
    }
    for (const [code, zone] of PRIMARY_TIME_ZONE) expect(zonesOf(code)).toContain(zone);
  });

  it('defaults well-known countries', () => {
    expect(zonesOf('US')[0]).toBe('America/New_York');
    expect(zonesOf('AU')[0]).toBe('Australia/Sydney');
    expect(zonesOf('ES')[0]).toBe('Europe/Madrid');
    expect(zonesOf('BR')[0]).toBe('America/Sao_Paulo');
    expect(zonesOf('IN')[0]).toBe('Asia/Kolkata');
  });

  it('does not treat prototype keys as renames', () => {
    expect(canonicalTimeZone('__proto__')).toBe('__proto__');
    expect(typeof canonicalTimeZone('constructor')).toBe('string');
    expect(canonicalTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata');
  });

  it('allows UTC and rejects unknown zones', () => {
    expect(isOfferedTimeZone('UTC')).toBe(true);
    expect(isOfferedTimeZone('Asia/Calcutta')).toBe(false);
    expect(isOfferedTimeZone('Mars/Base')).toBe(false);
  });

  // ICU may list CLDR aliases (Asia/Calcutta); only then is this check meaningless.
  const supported = new Set(Intl.supportedValuesOf('timeZone'));
  const primaryIds = supported.has('Asia/Kolkata') && !supported.has('Asia/Calcutta');
  it.skipIf(!primaryIds)('offers only ids the runtime lists as primary', () => {
    for (const c of COUNTRIES) for (const tz of c.timeZones) expect(supported.has(tz)).toBe(true);
  });
});

describe('currencies and validators', () => {
  it('lists INR and GBP with names', () => {
    expect(CURRENCIES).toContainEqual({ code: 'INR', name: 'Indian Rupee' });
    expect(isCurrencyCode('GBP')).toBe(true);
  });

  it('keeps real tender and rejects non-tender, superseded and unknown codes', () => {
    for (const code of ['XAF', 'XOF', 'XCD', 'XPF', 'ZWG', 'EUR']) {
      expect(isCurrencyCode(code)).toBe(true);
    }
    for (const code of ['HRK', 'XDR', 'XXX', 'DEM', 'XAU', 'SLL', 'CUC', 'ZWL', 'inr', 'ZZZ']) {
      expect(isCurrencyCode(code)).toBe(false);
    }
  });
});

describe('utilities', () => {
  it('has the 11 OQ-8 items matching the DB cap', () => {
    expect(STANDARD_UTILITIES).toHaveLength(11);
    expect(MAX_STANDARD_UTILITIES).toBe(11);
  });
});

describe('REFERENCE', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(REFERENCE)).toBe(true);
    expect(Object.isFrozen(REFERENCE.countries[0])).toBe(true);
    expect(Object.isFrozen(REFERENCE.countries[0]?.timeZones)).toBe(true);
  });
});

describe('data sanity', () => {
  it('gives plausible canonical zones for well-known countries', () => {
    expect(zonesOf('IN')).toEqual(['Asia/Kolkata']);
    expect(zonesOf('GB')).toEqual(['Europe/London']);
    expect(zonesOf('US')).toEqual(
      expect.arrayContaining(['America/New_York', 'America/Los_Angeles']),
    );
    expect(zonesOf('UA')).toContain('Europe/Kyiv');
    expect(zonesOf('UA')).not.toContain('Europe/Kiev');
    expect(zonesOf('AU')).toEqual(expect.arrayContaining(['Australia/Sydney', 'Australia/Perth']));
    expect(zonesOf('BR')).toEqual(expect.arrayContaining(['America/Sao_Paulo']));
  });

  it('excludes pseudo-regions and offers common currencies', () => {
    for (const code of ['EU', 'UN', 'ZZ', 'QO', 'AA']) {
      expect(COUNTRIES.some((c) => c.code === code)).toBe(false);
    }
    for (const code of ['INR', 'GBP', 'USD', 'EUR']) expect(isCurrencyCode(code)).toBe(true);
  });

  it('country and currency code sets match the snapshot (review diffs on ICU/Node upgrades)', () => {
    expect(COUNTRIES.map((c) => c.code).sort()).toEqual([...ISO_COUNTRY_CODES].sort());
    expect(CURRENCIES.map((c) => c.code).join(' ')).toMatchInlineSnapshot(
      `"AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG"`,
    );
  });
});
