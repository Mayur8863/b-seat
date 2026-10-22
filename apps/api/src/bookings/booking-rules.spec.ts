import { describe, expect, it } from 'vitest';

import {
  BOOKING_RULE_ORDER,
  BOOKING_RULE_PROBLEM_TYPE,
  type BookingRule,
  evaluateBookingRules,
  INVALID_BOOKING_WINDOW_TITLE,
} from './booking-rules.js';

const LONDON = 'Europe/London';
const KOLKATA = 'Asia/Kolkata';
// Thursday 22 Oct 2026, 13:00 in London (BST, UTC+1).
const NOW = new Date('2026-10-22T12:00:00Z');
const TOMORROW = '2026-10-23';

function ruleOf(
  date: string,
  startTime: string,
  endTime: string,
  timeZone = LONDON,
  now = NOW,
): BookingRule | null {
  return evaluateBookingRules({ date, startTime, endTime }, timeZone, now)?.rule ?? null;
}

describe('evaluateBookingRules', () => {
  it('accepts a valid window tomorrow', () => {
    expect(
      evaluateBookingRules({ date: TOMORROW, startTime: '09:00', endTime: '12:00' }, LONDON, NOW),
    ).toBeNull();
  });

  describe('one test per rule (each window breaks exactly one rule)', () => {
    it.each([
      { rule: 'end-before-start', date: TOMORROW, start: '08:00', end: '07:45' },
      { rule: 'not-on-quarter-hour', date: TOMORROW, start: '09:10', end: '10:00' },
      { rule: 'not-on-quarter-hour', date: TOMORROW, start: '09:00', end: '10:05' },
      { rule: 'too-short', date: TOMORROW, start: '09:00', end: '09:00' },
      { rule: 'too-long', date: TOMORROW, start: '08:00', end: '18:15' },
      { rule: 'outside-working-hours', date: TOMORROW, start: '06:45', end: '08:00' },
      { rule: 'outside-working-hours', date: TOMORROW, start: '19:00', end: '20:15' },
      { rule: 'starts-in-past', date: '2026-10-21', start: '09:00', end: '10:00' },
      { rule: 'too-far-ahead', date: '2026-11-22', start: '09:00', end: '10:00' },
    ])('$date $start–$end → $rule', ({ rule, date, start, end }) => {
      expect(ruleOf(date, start, end)).toBe(rule);
    });
  });

  describe('boundaries', () => {
    it('accepts exactly 10 hours (07:00–17:00) and exactly 15 minutes (19:45–20:00)', () => {
      expect(ruleOf(TOMORROW, '07:00', '17:00')).toBeNull();
      expect(ruleOf(TOMORROW, '19:45', '20:00')).toBeNull();
      expect(ruleOf(TOMORROW, '07:00', '07:15')).toBeNull();
    });

    it('accepts a start exactly 30 × 24 h from now, and refuses 15 minutes later', () => {
      // now + 30 days = 2026-11-21T12:00Z = 12:00 in London (GMT by then).
      expect(ruleOf('2026-11-21', '12:00', '13:00')).toBeNull();
      expect(ruleOf('2026-11-21', '12:15', '13:00')).toBe('too-far-ahead');
    });

    it('refuses a start equal to now, and accepts the next quarter hour', () => {
      // now = 13:00 London.
      expect(ruleOf('2026-10-22', '13:00', '14:00')).toBe('starts-in-past');
      expect(ruleOf('2026-10-22', '13:15', '14:00')).toBeNull();
    });

    it('refuses a window that started earlier today', () => {
      expect(ruleOf('2026-10-22', '12:45', '14:00')).toBe('starts-in-past');
    });
  });

  describe('order (first failure wins)', () => {
    it.each([
      // end-before-start + not-on-quarter-hour + outside-working-hours
      { start: '06:10', end: '05:00', date: TOMORROW, rule: 'end-before-start' },
      // not-on-quarter-hour + outside-working-hours + starts-in-past
      { start: '06:10', end: '07:00', date: '2026-10-21', rule: 'not-on-quarter-hour' },
      // too-short + outside-working-hours + starts-in-past
      { start: '06:00', end: '06:00', date: '2026-10-21', rule: 'too-short' },
      // too-long + outside-working-hours + too-far-ahead
      { start: '06:00', end: '21:00', date: '2026-12-01', rule: 'too-long' },
      // outside-working-hours + starts-in-past
      { start: '20:00', end: '21:00', date: '2026-10-21', rule: 'outside-working-hours' },
      // outside-working-hours + too-far-ahead
      { start: '06:00', end: '08:00', date: '2026-12-01', rule: 'outside-working-hours' },
    ])('$date $start–$end → $rule', ({ date, start, end, rule }) => {
      expect(ruleOf(date, start, end)).toBe(rule);
    });

    it('lists the rules in the documented order', () => {
      expect(BOOKING_RULE_ORDER).toEqual([
        'end-before-start',
        'not-on-quarter-hour',
        'invalid-local-time',
        'too-short',
        'too-long',
        'outside-working-hours',
        'starts-in-past',
        'too-far-ahead',
      ]);
    });
  });

  describe('time zones and daylight saving', () => {
    it('applies working hours on the space’s wall-clock, not UTC', () => {
      // 07:00–08:00 in Kolkata is 01:30–02:30 UTC.
      expect(ruleOf(TOMORROW, '07:00', '08:00', KOLKATA)).toBeNull();
      expect(ruleOf(TOMORROW, '06:45', '08:00', KOLKATA)).toBe('outside-working-hours');
      expect(ruleOf(TOMORROW, '19:00', '20:00', KOLKATA)).toBeNull();
    });

    it('measures "starts in the past" against the real instant in the space’s zone', () => {
      // now = 17:30 in Kolkata.
      expect(ruleOf('2026-10-22', '17:30', '18:00', KOLKATA)).toBe('starts-in-past');
      expect(ruleOf('2026-10-22', '17:45', '18:00', KOLKATA)).toBeNull();
    });

    it('refuses a start in the spring DST gap as invalid-local-time', () => {
      const early = new Date('2026-03-20T12:00:00Z');
      expect(ruleOf('2026-03-29', '01:30', '03:00', LONDON, early)).toBe('invalid-local-time');
    });

    it('refuses a start in the autumn DST overlap as invalid-local-time', () => {
      expect(ruleOf('2026-10-25', '01:30', '02:30')).toBe('invalid-local-time');
    });

    it('refuses an end in the DST gap as invalid-local-time', () => {
      const early = new Date('2026-03-20T12:00:00Z');
      expect(ruleOf('2026-03-29', '00:30', '01:30', LONDON, early)).toBe('invalid-local-time');
    });

    it('measures duration on real instants across a DST change, as the database CHECK does', () => {
      const autumn = new Date('2026-10-20T12:00:00Z');
      // 00:00 BST (23:00Z) to 10:00 GMT (10:00Z) is 10 h on the wall-clock but 11 h of real time.
      expect(ruleOf('2026-10-25', '00:00', '10:00', LONDON, autumn)).toBe('too-long');
      const spring = new Date('2026-03-20T12:00:00Z');
      // 00:00 GMT (00:00Z) to 10:15 BST (09:15Z) is 10 h 15 min on the wall-clock but 9 h 15 min of real time.
      expect(ruleOf('2026-03-29', '00:00', '10:15', LONDON, spring)).toBe('outside-working-hours');
    });
  });

  describe('violation', () => {
    it.each(BOOKING_RULE_ORDER)('%s has its own problem type URN', (rule) => {
      expect(BOOKING_RULE_PROBLEM_TYPE[rule]).toBe(`urn:bseat:problem:booking-rule:${rule}`);
    });

    it('carries the problem type, title and a detail that names the rule', () => {
      expect(
        evaluateBookingRules({ date: TOMORROW, startTime: '08:00', endTime: '18:15' }, LONDON, NOW),
      ).toEqual({
        rule: 'too-long',
        type: 'urn:bseat:problem:booking-rule:too-long',
        title: INVALID_BOOKING_WINDOW_TITLE,
        detail: 'A booking can be at most 10 hours long.',
      });
    });

    it('names the space’s time zone in the working-hours detail', () => {
      const v = evaluateBookingRules(
        { date: TOMORROW, startTime: '06:00', endTime: '08:00' },
        KOLKATA,
        NOW,
      );
      expect(v?.detail).toBe('Bookings must be between 07:00 and 20:00 local time (Asia/Kolkata).');
    });

    it.each([
      {
        rule: 'end-before-start',
        start: '08:00',
        end: '07:45',
        detail: 'The end time must be after the start time.',
      },
      {
        rule: 'not-on-quarter-hour',
        start: '09:10',
        end: '10:00',
        detail: 'Start and end times must be on a 15-minute boundary (:00, :15, :30 or :45).',
      },
      {
        rule: 'too-short',
        start: '09:00',
        end: '09:00',
        detail: 'A booking must be at least 15 minutes long.',
      },
    ])('uses the contract detail for $rule', ({ start, end, detail }) => {
      expect(
        evaluateBookingRules({ date: TOMORROW, startTime: start, endTime: end }, LONDON, NOW)
          ?.detail,
      ).toBe(detail);
    });

    it('uses the contract details for the time rules', () => {
      const detailOf = (date: string, s: string, e: string) =>
        evaluateBookingRules({ date, startTime: s, endTime: e }, LONDON, NOW)?.detail;
      expect(detailOf('2026-10-21', '09:00', '10:00')).toBe(
        'The booking must start in the future.',
      );
      expect(detailOf('2026-11-22', '09:00', '10:00')).toBe(
        'Bookings can start at most 30 days ahead.',
      );
      expect(detailOf('2026-10-25', '01:30', '02:30')).toBe(
        'That local time does not exist or is ambiguous because of a daylight-saving change.',
      );
    });
  });
});
