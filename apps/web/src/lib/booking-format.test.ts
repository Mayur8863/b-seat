import { describe, expect, it } from 'vitest';

import { formatLocalDate, formatWhen, timeSlots, tomorrow } from './booking-format';

describe('booking-format', () => {
  it('formats a local date', () => {
    expect(formatLocalDate('2026-10-23')).toBe('Fri 23 Oct 2026');
  });

  it('formats a window with the space time zone', () => {
    expect(
      formatWhen({ date: '2026-10-23', startTime: '09:00', endTime: '17:00' }, 'Europe/London'),
    ).toBe('Fri 23 Oct 2026, 09:00–17:00 (Europe/London)');
  });

  it('builds 52 quarter-hour slots', () => {
    const start = timeSlots('07:00', '19:45');
    expect(start).toHaveLength(52);
    expect(start[0]).toBe('07:00');
    expect(start.at(-1)).toBe('19:45');
    expect(timeSlots('07:15', '20:00').at(-1)).toBe('20:00');
  });

  it('returns tomorrow across a month end', () => {
    expect(tomorrow(new Date(2026, 9, 31, 23, 0))).toBe('2026-11-01');
  });
});
