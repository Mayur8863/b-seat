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

/** Problem type and contract detail text (contracts/README.md) of each rule. */
const RULES = {
  'space-not-published': {
    type: PROBLEM_TYPES.spaceNotPublished,
    detail: 'This space is no longer listed.',
  },
  'own-space': {
    type: PROBLEM_TYPES.ownSpace,
    detail: "You can't book a seat in your own space. Mark it occupied instead.",
  },
  'pass-not-offered': {
    type: PROBLEM_TYPES.passNotOffered,
    detail: "This space doesn't offer that pass for that slot.",
  },
  'start-day-closed': {
    type: PROBLEM_TYPES.startDayClosed,
    detail: "This seat isn't available on the start date you chose.",
  },
  'slot-started': {
    type: PROBLEM_TYPES.slotStarted,
    detail: 'That slot has already started. Choose a later start date.',
  },
  'too-far-ahead': {
    type: PROBLEM_TYPES.tooFarAhead,
    detail: 'Bookings can start at most 30 days ahead.',
  },
} satisfies Record<PassBookingRule, { type: string; detail: string }>;

function violation(rule: PassBookingRule): PassRuleViolation {
  return { rule, status: 422, title: TITLE, ...RULES[rule] };
}

export function evaluatePassBookingRules(
  facts: PassBookingFacts,
  now: Date,
): PassRuleViolation | null {
  const startMs = facts.firstStartsAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    throw new RangeError('firstStartsAt and now must be valid dates');
  }
  if (facts.space.status !== 'published') return violation('space-not-published');
  if (facts.isOwner) return violation('own-space');
  if (!facts.offered) return violation('pass-not-offered');
  if (!facts.startDayOpen) return violation('start-day-closed');
  if (startMs <= nowMs) return violation('slot-started');
  if (startMs - nowMs > MAX_BOOKING_LEAD_MS) return violation('too-far-ahead');
  return null;
}
