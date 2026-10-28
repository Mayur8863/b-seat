import { describe, expect, it } from 'vitest';

import {
  BOOKING_RULE_ORDER,
  BOOKING_RULE_PROBLEM_TYPE,
  INVALID_BOOKING_WINDOW_TITLE,
  ruleViolation,
} from './booking-rules.js';

describe('ruleViolation', () => {
  it.each(BOOKING_RULE_ORDER)('%s has its own problem type URN', (rule) => {
    expect(BOOKING_RULE_PROBLEM_TYPE[rule]).toBe(`urn:bseat:problem:booking-rule:${rule}`);
  });

  it('carries the problem type, title and a detail that names the rule', () => {
    expect(ruleViolation('too-long', 'Europe/London')).toEqual({
      rule: 'too-long',
      type: 'urn:bseat:problem:booking-rule:too-long',
      title: INVALID_BOOKING_WINDOW_TITLE,
      detail: 'A booking can be at most 10 hours long.',
    });
  });

  it('names the space’s time zone in the working-hours detail', () => {
    expect(ruleViolation('outside-working-hours', 'Asia/Kolkata').detail).toBe(
      'Bookings must be between 07:00 and 20:00 local time (Asia/Kolkata).',
    );
  });

  it.each([
    ['end-before-start', 'The end time must be after the start time.'],
    [
      'not-on-quarter-hour',
      'Start and end times must be on a 15-minute boundary (:00, :15, :30 or :45).',
    ],
    [
      'invalid-local-time',
      'That local time does not exist or is ambiguous because of a daylight-saving change.',
    ],
    ['too-short', 'A booking must be at least 15 minutes long.'],
    ['starts-in-past', 'The booking must start in the future.'],
    ['too-far-ahead', 'Bookings can start at most 30 days ahead.'],
  ] as const)('uses the contract detail for %s', (rule, detail) => {
    expect(ruleViolation(rule, 'Europe/London').detail).toBe(detail);
  });
});
