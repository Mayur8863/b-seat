import { describe, expect, it } from 'vitest';

import { weekdayMask, type Calendar } from './calendar-rules.js';
import { passPeriod } from './pass-period.js';
import type { OpeningHours } from './slots.js';

const KOLKATA = 'Asia/Kolkata';
const LONDON = 'Europe/London';
const always: OpeningHours = { mode: 'always_open', shiftChangeAt: '07:00' };
const open: Calendar = { startDate: '2026-01-01', endDate: null, weekdays: 127 };
const monFri: Calendar = { ...open, weekdays: weekdayMask(['mon', 'tue', 'wed', 'thu', 'fri']) };

const run = (over: Partial<Parameters<typeof passPeriod>[0]>) =>
  passPeriod({
    pass: 'week',
    slot: 'night',
    startDate: '2026-11-02',
    calendar: open,
    openingHours: always,
    timeZone: KOLKATA,
    ...over,
  });

describe('passPeriod', () => {
  it('lasts 1, 7 or 30 calendar days', () => {
    expect(run({ pass: 'day' }).endDate).toBe('2026-11-02');
    expect(run({ pass: 'week' }).endDate).toBe('2026-11-08');
    expect(run({ pass: 'month' }).endDate).toBe('2026-12-01');
    expect(run({ pass: 'month' }).occurrences).toHaveLength(30);
  });

  it('ends a weekly night pass the morning after endDate', () => {
    const { occurrences } = run({});
    expect(occurrences).toHaveLength(7);
    const last = occurrences[6];
    expect(last?.date).toBe('2026-11-08');
    expect(last?.endsAt.toISOString()).toBe('2026-11-09T01:30:00.000Z');
  });

  it('skips closed weekdays without producing a window', () => {
    const r = run({ calendar: monFri, slot: 'day' });
    expect(r.startDayOpen).toBe(true);
    expect(r.occurrences.map((o) => o.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(r.skippedDates).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('counts a 30-day pass on a Mon-Fri calendar starting on a Friday', () => {
    // 2026-11-06 (Fri) .. 2026-12-05 (Sat): four full weeks (20 open) plus Fri (open) and Sat.
    const r = run({ pass: 'month', calendar: monFri, startDate: '2026-11-06' });
    expect(r.startDayOpen).toBe(true);
    expect(r.endDate).toBe('2026-12-05');
    expect(r.occurrences).toHaveLength(21);
    expect(r.skippedDates).toHaveLength(9);
    expect(r.skippedDates[0]).toBe('2026-11-07');
    expect(r.skippedDates.at(-1)).toBe('2026-12-05');
  });

  it('reports a closed start day', () => {
    expect(run({ calendar: monFri, startDate: '2026-11-07' }).startDayOpen).toBe(false);
  });

  it('skips days after the calendar end date', () => {
    const r = run({ pass: 'month', calendar: { ...open, endDate: '2026-11-15' } });
    expect(r.occurrences).toHaveLength(14);
    expect(r.skippedDates).toHaveLength(16);
    expect(r.skippedDates[0]).toBe('2026-11-16');
    expect(r.endDate).toBe('2026-12-01');
  });

  it('crosses year boundaries', () => {
    const r = run({ pass: 'week', startDate: '2026-12-29' });
    expect(r.endDate).toBe('2027-01-04');
    expect(r.occurrences[3]?.date).toBe('2027-01-01');
  });

  it('follows DST in the occurrence windows', () => {
    const r = run({ timeZone: LONDON, slot: 'full_day', startDate: '2026-10-24', pass: 'day' });
    const [only] = r.occurrences;
    expect(only?.startsAt.toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(only?.endsAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });

  it('uses the single working-hours window for fixed hours', () => {
    const r = run({
      openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
      slot: 'working_hours',
      pass: 'day',
    });
    expect(r.occurrences).toHaveLength(1);
  });
});
