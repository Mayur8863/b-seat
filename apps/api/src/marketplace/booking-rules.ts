import { PROBLEM_TYPES } from '../common/errors/problem-types.js';

/**
 * The pass booking rules as one pure function (FR-020, contracts "Booking rule order").
 * Distinct from the retired hourly `bookings/booking-rules.ts`. Overlap rules are not here:
 * the exclusion constraints own them. Unknown or draft spaces, and unknown, removed or
 * foreign seats, are 404s the service decides before calling this.
 */

/** Evaluation order; the first broken rule wins. */
export const PASS_BOOKING_RULE_ORDER = [
  'space-not-published',
  'own-space',
  'pass-not-offered',
  'start-day-closed',
  'slot-started',
  'too-far-ahead',
] as const;

export type PassBookingRule = (typeof PASS_BOOKING_RULE_ORDER)[number];

/** A booking may start at most this long after now (inclusive). */
export const MAX_BOOKING_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

export interface PassBookingFacts {
  /** Only spaces that were listed once reach the rules, so draft is already a 404. */
  space: { status: 'published' | 'unpublished' };
  isOwner: boolean;
  /** The slot is on, valid for the opening mode, and priced for the pass type. */
  offered: boolean;
  /** The seat's calendar is open on the first occurrence's date. */
  startDayOpen: boolean;
  firstStartsAt: Date;
}

export interface PassRuleViolation {
  rule: PassBookingRule;
  type: string;
  status: 422;
  title: string;
  detail: string;
}

const TITLE = 'Booking rule broken';

function violation(rule: PassBookingRule, type: string, detail: string): PassRuleViolation {
  return { rule, type, status: 422, title: TITLE, detail };
}

export function evaluatePassBookingRules(
  facts: PassBookingFacts,
  now: Date,
): PassRuleViolation | null {
  if (facts.space.status !== 'published') {
    return violation(
      'space-not-published',
      PROBLEM_TYPES.spaceNotPublished,
      'This space is no longer listed.',
    );
  }
  if (facts.isOwner) {
    return violation(
      'own-space',
      PROBLEM_TYPES.ownSpace,
      "You can't book a seat in your own space. Mark it occupied instead.",
    );
  }
  if (!facts.offered) {
    return violation(
      'pass-not-offered',
      PROBLEM_TYPES.passNotOffered,
      "This space doesn't offer that pass for that slot.",
    );
  }
  if (!facts.startDayOpen) {
    return violation(
      'start-day-closed',
      PROBLEM_TYPES.startDayClosed,
      'The space is closed on the start date.',
    );
  }
  const startMs = facts.firstStartsAt.getTime();
  if (startMs <= now.getTime()) {
    return violation(
      'slot-started',
      PROBLEM_TYPES.slotStarted,
      'The first slot of this pass has already started.',
    );
  }
  if (startMs - now.getTime() > MAX_BOOKING_LEAD_MS) {
    return violation(
      'too-far-ahead',
      PROBLEM_TYPES.tooFarAhead,
      'A booking can start at most 30 days from now.',
    );
  }
  return null;
}
