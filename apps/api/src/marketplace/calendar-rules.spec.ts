import { describe, expect, it } from 'vitest';

import { isOpen, resolveCalendar, weekdayMask, type Calendar } from './calendar-rules.js';

const MON_FRI = weekdayMask(['mon', 'tue', 'wed', 'thu', 'fri']);
const cal = (over: Partial<Calendar> = {}): Calendar => ({
  startDate: '2026-11-01',
  endDate: null,
  weekdays: 127,
  ...over,
});

describe('weekdayMask', () => {
  it('uses Monday = 1 ... Sunday = 64', () => {
    expect(weekdayMask(['mon'])).toBe(1);
    expect(weekdayMask(['sun'])).toBe(64);
    expect(MON_FRI).toBe(31);
  });
});

describe('isOpen', () => {
  it('is closed before the start date and open from it', () => {
    expect(isOpen(cal(), '2026-10-31')).toBe(false);
    expect(isOpen(cal(), '2026-11-01')).toBe(true);
  });

  it('is open on the end date and closed after it', () => {
    const c = cal({ endDate: '2026-11-10' });
    expect(isOpen(c, '2026-11-10')).toBe(true);
    expect(isOpen(c, '2026-11-11')).toBe(false);
  });

  it('honours the weekday mask on the local date', () => {
    const c = cal({ weekdays: MON_FRI });
    expect(isOpen(c, '2026-11-06')).toBe(true); // Friday
    expect(isOpen(c, '2026-11-07')).toBe(false); // Saturday
    expect(isOpen(c, '2026-11-08')).toBe(false); // Sunday
    expect(isOpen(c, '2026-11-09')).toBe(true); // Monday
  });
});

describe('resolveCalendar', () => {
  it('prefers the seat calendar and falls back to the shared one', () => {
    const own = cal({ weekdays: 1 });
    const shared = cal();
    expect(resolveCalendar(own, shared)).toBe(own);
    expect(resolveCalendar(null, shared)).toBe(shared);
  });
});
