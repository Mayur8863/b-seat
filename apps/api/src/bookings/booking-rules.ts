/**
 * Problem details of the legacy 001 booking-window rules, kept only for `resolveWindow` in the
 * legacy availability read until T043 removes it. The evaluator itself went with the hourly create
 * (T008); pass rules live in `marketplace/booking-rules.ts`.
 */
import { PROBLEM_TYPES } from '../common/errors/problem-types.js';

/** Evaluation order; the first broken rule wins. */
export const BOOKING_RULE_ORDER = [
  'end-before-start',
  'not-on-quarter-hour',
  'invalid-local-time',
  'too-short',
  'too-long',
  'outside-working-hours',
  'starts-in-past',
  'too-far-ahead',
] as const;

export type BookingRule = (typeof BOOKING_RULE_ORDER)[number];

/** Problem `type` per rule (registry: specs/001-seat-booking/contracts/README.md). */
export const BOOKING_RULE_PROBLEM_TYPE = {
  'end-before-start': 'urn:bseat:problem:booking-rule:end-before-start',
  'not-on-quarter-hour': 'urn:bseat:problem:booking-rule:not-on-quarter-hour',
  'invalid-local-time': 'urn:bseat:problem:booking-rule:invalid-local-time',
  'too-short': 'urn:bseat:problem:booking-rule:too-short',
  'too-long': 'urn:bseat:problem:booking-rule:too-long',
  'outside-working-hours': 'urn:bseat:problem:booking-rule:outside-working-hours',
  'starts-in-past': 'urn:bseat:problem:booking-rule:starts-in-past',
  'too-far-ahead': PROBLEM_TYPES.tooFarAhead,
} as const satisfies Record<BookingRule, string>;

export const INVALID_BOOKING_WINDOW_TITLE = 'Invalid booking window';

export interface RuleViolation {
  rule: BookingRule;
  type: (typeof BOOKING_RULE_PROBLEM_TYPE)[BookingRule];
  title: string;
  detail: string;
}

const OPENS_AT = '07:00';
const CLOSES_AT = '20:00';

function detailFor(rule: BookingRule, timeZone: string): string {
  switch (rule) {
    case 'end-before-start':
      return 'The end time must be after the start time.';
    case 'not-on-quarter-hour':
      return 'Start and end times must be on a 15-minute boundary (:00, :15, :30 or :45).';
    case 'invalid-local-time':
      return 'That local time does not exist or is ambiguous because of a daylight-saving change.';
    case 'too-short':
      return 'A booking must be at least 15 minutes long.';
    case 'too-long':
      return 'A booking can be at most 10 hours long.';
    case 'outside-working-hours':
      return `Bookings must be between ${OPENS_AT} and ${CLOSES_AT} local time (${timeZone}).`;
    case 'starts-in-past':
      return 'The booking must start in the future.';
    case 'too-far-ahead':
      return 'Bookings can start at most 30 days ahead.';
  }
}

/** The problem details for one broken rule (also used by availability for DST windows). */
export function ruleViolation(rule: BookingRule, timeZone: string): RuleViolation {
  return {
    rule,
    type: BOOKING_RULE_PROBLEM_TYPE[rule],
    title: INVALID_BOOKING_WINDOW_TITLE,
    detail: detailFor(rule, timeZone),
  };
}
