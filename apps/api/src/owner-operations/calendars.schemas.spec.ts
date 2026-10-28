import { describe, expect, it } from 'vitest';

import { weekdayMask, weekdaysOf } from '../marketplace/calendar-rules.js';
import { CalendarInputSchema } from './calendars.schemas.js';

const ok = { startDate: '2030-01-01', endDate: null, weekdays: ['mon'] };

describe('CalendarInput', () => {
  it('accepts a past start date and an open end', () => {
    expect(CalendarInputSchema.safeParse({ ...ok, startDate: '2001-01-01' }).success).toBe(true);
  });
  it.each([
    ['end before start', { ...ok, endDate: '2029-12-31' }],
    ['no weekdays', { ...ok, weekdays: [] }],
    ['repeated weekday', { ...ok, weekdays: ['mon', 'mon'] }],
    ['unknown field', { ...ok, extra: 1 }],
  ])('rejects %s', (_name, body) => {
    expect(CalendarInputSchema.safeParse(body).success).toBe(false);
  });
});

describe('weekdaysOf', () => {
  it('inverts weekdayMask in Monday-first order', () => {
    expect(weekdaysOf(weekdayMask(['sun', 'mon', 'wed']))).toEqual(['mon', 'wed', 'sun']);
    expect(weekdaysOf(0)).toEqual([]);
  });
});
