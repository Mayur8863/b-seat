/**
 * Money as exact decimal strings (research R-8). Arithmetic runs on integer minor units
 * (1/100). The largest column value, numeric(12,2) = 9999999999.99, is 999999999999 minor
 * units, far below Number.MAX_SAFE_INTEGER, so plain safe integers are exact and a sum of
 * two prices stays exact too. Amounts are never parsed as floats (no `Number(text)`).
 * The one `/` left, in the percent of `fullDaySaving`, divides two safe integers and floors:
 * the quotient is at most 100 (ulp about 1e-14) and, when not whole, sits at least
 * 1 / (2 * separate) >= 5e-13 from the next integer, so rounding can never cross it.
 */

const MONEY_INPUT = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;

/** numeric(12,2) upper bound in minor units (9999999999.99). */
export const MAX_MINOR_UNITS = 999_999_999_999;

/** Parses a positive money string into integer minor units; throws `RangeError` otherwise. */
export function parseDecimal(input: string): number {
  if (typeof input !== 'string' || !MONEY_INPUT.test(input)) {
    throw new RangeError('Money must be a decimal with at most two fraction digits');
  }
  const [whole = '', fraction = ''] = input.split('.');
  const minor = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0'), 10);
  if (minor <= 0) throw new RangeError('Money must be greater than zero');
  // The regex caps the whole part at 10 digits, so minor never exceeds MAX_MINOR_UNITS.
  return minor;
}

/** Formats minor units as a string with exactly two decimals. */
export function formatDecimal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_MINOR_UNITS) {
    throw new RangeError('Minor units must be an integer from 0 to the maximum amount');
  }
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

export interface FullDaySaving {
  amount: string;
  /** Whole percent of day + night, rounded half-up. */
  percent: number;
}

/**
 * What a full-day pass saves against a day pass plus a night pass of the same length
 * (FR-012), or `null` when it does not save anything.
 */
export function fullDaySaving(day: string, night: string, fullDay: string): FullDaySaving | null {
  const separate = parseDecimal(day) + parseDecimal(night);
  const saving = separate - parseDecimal(fullDay);
  if (saving <= 0) return null;
  // floor(saving * 100 / separate + 1/2) in integers, so exact halves round up.
  const percent = Math.floor((saving * 200 + separate) / (separate * 2));
  return { amount: formatDecimal(saving), percent };
}
