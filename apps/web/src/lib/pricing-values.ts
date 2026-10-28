/** Slot kinds a pricing page can show, in card order. */
export type SlotKind = 'day' | 'night' | 'full_day' | 'working_hours';
export type PassKind = 'day' | 'week' | 'month';

/** Mirrors the API money rule, with the checks ordered for one clear message (ui/02 8.2). */
export function moneyError(raw: string): string | undefined {
  const v = raw.trim();
  if (v === '') return undefined;
  if (!/^\d+(\.\d+)?$/.test(v) || /^0\d/.test(v)) return 'Enter an amount like 1500 or 1500.50';
  const [whole = '', frac = ''] = v.split('.');
  if (frac.length > 2) return 'Use at most two decimal places';
  if (/^0*$/.test(whole + frac)) return 'Enter a price greater than zero';
  if (whole.length > 10) return 'That price is too large';
  return undefined;
}

const SHIFT = /^(0\d|1[01]):[0-5]\d$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock slot times for a shift change time T (00:00 to 11:59); undefined when T is invalid. */
export function derivedTimes(shift: string) {
  if (!SHIFT.test(shift)) return undefined;
  const [h = 0, m = 0] = shift.split(':').map(Number);
  const mid = `${pad(h + 12)}:${pad(m)}`;
  return {
    day: { start: shift, end: mid, nextDay: false },
    night: { start: mid, end: shift, nextDay: true },
    full_day: { start: shift, end: shift, nextDay: true },
  };
}
