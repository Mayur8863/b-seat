import { toInstant } from '../common/time/zoned-time.js';

/**
 * The FR-007 booking rules as one pure function (research R-3, ADR-0008 section 1).
 * Overlap rules are not here: the database's exclusion constraints own them.
 */

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
  'too-far-ahead': 'urn:bseat:problem:booking-rule:too-far-ahead',
} as const satisfies Record<BookingRule, string>;

export const INVALID_BOOKING_WINDOW_TITLE = 'Invalid booking window';

/** A booking window in the space's local wall-clock time (already format-validated). */
export interface LocalWindow {
  date: string;
  startTime: string;
  endTime: string;
}

export interface RuleViolation {
  rule: BookingRule;
  type: (typeof BOOKING_RULE_PROBLEM_TYPE)[BookingRule];
  title: string;
  detail: string;
}

const MINUTE_MS = 60_000;
const MIN_DURATION_MS = 15 * MINUTE_MS;
const MAX_DURATION_MS = 10 * 60 * MINUTE_MS;
const MAX_LEAD_MS = 30 * 24 * 60 * MINUTE_MS;
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

function violation(rule: BookingRule, timeZone: string): RuleViolation {
  return {
    rule,
    type: BOOKING_RULE_PROBLEM_TYPE[rule],
    title: INVALID_BOOKING_WINDOW_TITLE,
    detail: detailFor(rule, timeZone),
  };
}

const onQuarterHour = (time: string) => Number(time.slice(3, 5)) % 15 === 0;

/**
 * Returns the first rule the window breaks, or null. Format rules run on the wall-clock,
 * duration on real instants (as the database CHECK does), working hours on the wall-clock,
 * and the "now" rules on instants. `HH:mm` strings compare correctly as text.
 */
export function evaluateBookingRules(
  window: LocalWindow,
  timeZone: string,
  now: Date,
): RuleViolation | null {
  const { date, startTime, endTime } = window;

  if (endTime < startTime) return violation('end-before-start', timeZone);
  if (!onQuarterHour(startTime) || !onQuarterHour(endTime)) {
    return violation('not-on-quarter-hour', timeZone);
  }

  const start = toInstant(date, startTime, timeZone);
  const end = toInstant(date, endTime, timeZone);
  if (start.kind !== 'ok' || end.kind !== 'ok') return violation('invalid-local-time', timeZone);
  const startsAt = start.instant.getTime();
  const duration = end.instant.getTime() - startsAt;

  if (duration < MIN_DURATION_MS) return violation('too-short', timeZone);
  if (duration > MAX_DURATION_MS) return violation('too-long', timeZone);
  if (startTime < OPENS_AT || endTime > CLOSES_AT) {
    return violation('outside-working-hours', timeZone);
  }
  if (startsAt <= now.getTime()) return violation('starts-in-past', timeZone);
  if (startsAt > now.getTime() + MAX_LEAD_MS) return violation('too-far-ahead', timeZone);
  return null;
}
