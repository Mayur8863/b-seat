import { NotFoundException } from '@nestjs/common';

import { ProblemException } from '../common/errors/problem.exception.js';
import { evaluatePassBookingRules } from '../marketplace/booking-rules.js';
import { CLOSED_CALENDAR, type Calendar } from '../marketplace/calendar-rules.js';
import { passPeriod, type PassPeriod, type PassType } from '../marketplace/pass-period.js';
import { offeredSlots, type OpeningHours, type SlotKind } from '../marketplace/slots.js';
import { slotTimes } from '../owner-spaces/owner-spaces.service.js';

/** Everything the rules and the occurrence computation need, loaded by the service in one place. */
export interface PassBookingFacts {
  space: {
    id: string;
    name: string;
    area: string;
    city: string;
    country: string;
    currency: string;
    status: 'draft' | 'published' | 'unpublished';
    ownerId: string | null;
    timeZone: string;
    openingHours: OpeningHours;
  };
  seat: { id: string; label: string; cubicleName: string | null };
  /** The space's `space_slot` flag for the requested slot; a missing row counts as enabled. */
  slotEnabled: boolean;
  /** The `pass_price` amount for (slot, pass), or null when the pass is not priced. */
  price: string | null;
  /** The seat's own calendar, else the shared one, else null (fail closed). */
  calendar: Calendar | null;
}

export interface PassBookingRequest {
  seatId: string;
  pass: PassType;
  slot: SlotKind;
  startDate: string;
}

export interface PassBookingPlan {
  period: PassPeriod;
  firstStartsAt: Date;
  lastEndsAt: Date;
  price: { amount: string; currency: string };
  slotTimes: { startTime: string; endTime: string; endsNextDay: boolean };
}

/**
 * Decides a booking request from loaded facts and returns the occurrences to hold. Pure: the
 * 404s come first (a draft space is indistinguishable from an unknown one, even for its owner),
 * then the 422 rules in contract order (FR-020), then the pass period (R-5).
 */
export function planPassBooking(
  facts: PassBookingFacts,
  userId: string,
  input: PassBookingRequest,
  now: Date,
): PassBookingPlan {
  const { space } = facts;
  if (space.status === 'draft') throw new NotFoundException();

  const price = facts.price;
  const offered =
    price !== null && facts.slotEnabled && offeredSlots(space.openingHours).includes(input.slot);
  const period = passPeriod({
    pass: input.pass,
    slot: input.slot,
    startDate: input.startDate,
    // Not offered: no window is computed (the slot may be invalid for the opening mode).
    calendar: offered ? (facts.calendar ?? CLOSED_CALENDAR) : CLOSED_CALENDAR,
    openingHours: space.openingHours,
    timeZone: space.timeZone,
  });
  const first = period.occurrences[0];
  const last = period.occurrences[period.occurrences.length - 1];

  const violation = evaluatePassBookingRules(
    {
      space: { status: space.status },
      isOwner: space.ownerId === userId,
      offered,
      // A start day whose window collapsed (DST gap) has no occurrence to hold: closed.
      startDayOpen: period.startDayOpen && first?.date === input.startDate,
      firstStartsAt: first?.startsAt ?? now,
    },
    now,
  );
  if (violation) {
    throw new ProblemException(violation.status, violation.type, violation.title, violation.detail);
  }
  if (!first || !last || price === null) throw new Error('A passing rule check has occurrences');

  return {
    period,
    firstStartsAt: first.startsAt,
    lastEndsAt: last.endsAt,
    price: { amount: price, currency: space.currency },
    slotTimes: slotTimes(space.openingHours, input.slot),
  };
}

/** The 422 for a space that was unpublished after the pre-lock check (same body as the rule). */
export function spaceNotPublished(): ProblemException {
  const v = evaluatePassBookingRules(
    {
      space: { status: 'unpublished' },
      isOwner: false,
      offered: true,
      startDayOpen: true,
      firstStartsAt: new Date(),
    },
    new Date(),
  );
  if (!v) throw new Error('space-not-published rule did not fire');
  return new ProblemException(v.status, v.type, v.title, v.detail);
}
