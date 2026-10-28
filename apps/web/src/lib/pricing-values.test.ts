import { describe, expect, it } from 'vitest';

import { derivedTimes, moneyError } from './pricing-values';

describe('moneyError', () => {
  it.each(['', '  ', '1500', '1500.5', '1500.50', '0.50', ' 20 ', '9999999999'])(
    'accepts %j',
    (v) => {
      expect(moneyError(v)).toBeUndefined();
    },
  );
  it.each(['1,500', '₹1500', '.5', '007', '-5', '5.', 'abc', '1.2.3'])('rejects format %j', (v) => {
    expect(moneyError(v)).toBe('Enter an amount like 1500 or 1500.50');
  });
  it('rejects 3 decimals', () => {
    expect(moneyError('12.345')).toBe('Use at most two decimal places');
  });
  it('rejects zero', () => {
    expect(moneyError('0')).toBe('Enter a price greater than zero');
    expect(moneyError('0.00')).toBe('Enter a price greater than zero');
  });
  it('rejects 11 whole digits', () => {
    expect(moneyError('12345678901')).toBe('That price is too large');
  });
});

describe('derivedTimes', () => {
  it('computes the 24-hour slots from the shift time', () => {
    expect(derivedTimes('07:00')).toEqual({
      day: { start: '07:00', end: '19:00', nextDay: false },
      night: { start: '19:00', end: '07:00', nextDay: true },
      full_day: { start: '07:00', end: '07:00', nextDay: true },
    });
  });
  it('returns undefined for invalid shift times', () => {
    expect(derivedTimes('')).toBeUndefined();
    expect(derivedTimes('12:00')).toBeUndefined();
    expect(derivedTimes('xx')).toBeUndefined();
  });
});
