import { describe, expect, it } from 'vitest';

import {
  calendarSummary,
  fromCalendar,
  outsideNotice,
  PRESETS,
  toCalendarInput,
  validateCalendar,
  weekdaySummary,
} from './calendar-values';

describe('weekdaySummary', () => {
  it('folds the common patterns', () => {
    expect(weekdaySummary(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toBe('Every day');
    expect(weekdaySummary(PRESETS.weekdays)).toBe('Mon to Fri');
    expect(weekdaySummary(['sun', 'sat'])).toBe('Sat and Sun');
  });
  it('lists other days Monday-first', () => {
    expect(weekdaySummary(['sat', 'mon', 'wed'])).toBe('Mon, Wed, Sat');
  });
});

describe('calendarSummary', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  it('describes open and closed ranges', () => {
    expect(
      calendarSummary({ startDate: '2026-11-02', endDate: null, weekdays: ['sat'] }, now),
    ).toBe('From Mon 2 Nov, no end date, Sat');
    expect(
      calendarSummary(
        { startDate: '2026-11-02', endDate: '2026-12-01', weekdays: ['sat', 'sun'] },
        now,
      ),
    ).toBe('Mon 2 Nov to Tue 1 Dec, Sat and Sun');
  });
});

describe('validateCalendar', () => {
  const ok = { start: '2026-01-01', ends: 'open' as const, end: '', weekdays: ['mon' as const] };
  it('accepts a start in the past', () => {
    expect(validateCalendar(ok)).toEqual({});
  });
  it('reports each problem', () => {
    expect(validateCalendar({ ...ok, start: '' }).start).toBe('Choose a start date.');
    expect(validateCalendar({ ...ok, ends: 'date' }).end).toBe('Choose an end date.');
    expect(validateCalendar({ ...ok, ends: 'date', end: '2025-01-01' }).end).toBe(
      "The end date can't be before the start date.",
    );
    expect(validateCalendar({ ...ok, weekdays: [] }).weekdays).toBe('Choose at least one day.');
  });
});

describe('conversion', () => {
  it('round-trips and orders weekdays', () => {
    const v = fromCalendar({ startDate: '2026-01-01', endDate: null, weekdays: ['fri', 'mon'] });
    expect(v).toEqual({ start: '2026-01-01', ends: 'open', end: '', weekdays: ['mon', 'fri'] });
    expect(toCalendarInput(v)).toEqual({
      startDate: '2026-01-01',
      endDate: null,
      weekdays: ['mon', 'fri'],
    });
    expect(toCalendarInput({ ...v, ends: 'date', end: '2026-02-01' }).endDate).toBe('2026-02-01');
  });
});

describe('outsideNotice', () => {
  it('pluralises', () => {
    expect(outsideNotice(1)).toBe('1 booking falls outside the new calendar');
    expect(outsideNotice(3)).toBe('3 bookings fall outside the new calendar');
  });
});
