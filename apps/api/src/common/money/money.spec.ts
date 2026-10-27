import { describe, expect, it } from 'vitest';

import { formatDecimal, fullDaySaving, MAX_MINOR_UNITS, parseDecimal } from './money.js';

describe('parseDecimal', () => {
  it.each([
    ['1500', 150000],
    ['1500.5', 150050],
    ['0.01', 1],
    ['0.10', 10],
    ['9999999999.99', MAX_MINOR_UNITS],
  ])('parses %s to %i minor units', (input, minor) => {
    expect(parseDecimal(input)).toBe(minor);
  });

  it.each([
    '10.005',
    '0',
    '0.00',
    '-1',
    '1e3',
    '',
    ' 1',
    '1 ',
    '1.',
    '.5',
    '+1',
    '1,5',
    '12345678901',
    '10000000000.00',
    '١٢',
  ])('rejects %j', (input) => {
    expect(() => parseDecimal(input)).toThrow(RangeError);
  });
});

describe('formatDecimal', () => {
  it.each([
    [150000, '1500.00'],
    [150050, '1500.50'],
    [1, '0.01'],
    [5, '0.05'],
    [0, '0.00'],
    [MAX_MINOR_UNITS, '9999999999.99'],
  ])('formats %i as %s', (minor, text) => {
    expect(formatDecimal(minor)).toBe(text);
  });

  it('round-trips through parseDecimal', () => {
    expect(formatDecimal(parseDecimal('42.7'))).toBe('42.70');
  });

  it.each([-1, 1.5, Number.NaN, MAX_MINOR_UNITS + 1])('rejects %s', (minor) => {
    expect(() => formatDecimal(minor)).toThrow(RangeError);
  });
});

describe('fullDaySaving', () => {
  it('reports the amount and the percent of day + night (AC 3.5)', () => {
    expect(fullDaySaving('500.00', '400.00', '800.00')).toEqual({ amount: '100.00', percent: 11 });
  });

  it('rounds the percent half-up', () => {
    // 1 of 8 minor units is 12.5 percent, which rounds to 13.
    expect(fullDaySaving('0.04', '0.04', '0.07')).toEqual({ amount: '0.01', percent: 13 });
    // 1 of 200 is 0.5 percent, which rounds to 1.
    expect(fullDaySaving('1.00', '1.00', '1.99')).toEqual({ amount: '0.01', percent: 1 });
    // 1 of 201 is 0.497 percent, which rounds to 0.
    expect(fullDaySaving('1.00', '1.01', '2.00')).toEqual({ amount: '0.01', percent: 0 });
  });

  it('is null when full day is not cheaper than day + night', () => {
    expect(fullDaySaving('500.00', '400.00', '900.00')).toBeNull();
    expect(fullDaySaving('500', '400', '950')).toBeNull();
  });

  it('works at the largest accepted prices', () => {
    expect(fullDaySaving('9999999999.99', '9999999999.99', '9999999999.99')).toEqual({
      amount: '9999999999.99',
      percent: 50,
    });
  });
});
