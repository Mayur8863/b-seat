import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ProblemException } from '../common/errors/problem.exception.js';
import { weekdayMask } from '../marketplace/calendar-rules.js';
import { type PassBookingFacts, planPassBooking } from './pass-booking-plan.js';

const now = new Date('2026-11-02T10:00:00Z'); // a Monday
const input = { seatId: 'seat-1', pass: 'week', slot: 'day', startDate: '2026-11-09' } as const;

const facts: PassBookingFacts = {
  space: {
    id: 'space-1',
    name: 'Hub',
    area: 'Baner',
    city: 'Pune',
    country: 'IN',
    currency: 'INR',
    status: 'published',
    ownerId: 'owner-1',
    timeZone: 'Europe/London',
    openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  },
  seat: { id: 'seat-1', label: 'A1', cubicleName: null },
  slotEnabled: true,
  price: '3000.00',
  calendar: { startDate: '2026-01-01', endDate: null, weekdays: 127 },
};

const problemOf = (fn: () => unknown): ProblemException => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProblemException) return e;
    throw e;
  }
  throw new Error('expected a problem');
};

describe('planPassBooking', () => {
  it('plans a week: 7 occurrences, envelope and price snapshot', () => {
    const plan = planPassBooking(facts, 'renter', input, now);
    expect(plan.period.occurrences).toHaveLength(7);
    expect(plan.firstStartsAt.toISOString()).toBe('2026-11-09T07:00:00.000Z');
    expect(plan.lastEndsAt.toISOString()).toBe('2026-11-15T19:00:00.000Z');
    expect(plan.price).toEqual({ amount: '3000.00', currency: 'INR' });
    expect(plan.slotTimes).toEqual({ startTime: '07:00', endTime: '19:00', endsNextDay: false });
  });

  it('skips closed days inside the pass', () => {
    const plan = planPassBooking(
      {
        ...facts,
        calendar: {
          startDate: '2026-01-01',
          endDate: null,
          weekdays: weekdayMask(['mon', 'tue', 'wed', 'thu', 'fri']),
        },
      },
      'renter',
      input,
      now,
    );
    expect(plan.period.occurrences).toHaveLength(5);
    expect(plan.period.skippedDates).toEqual(['2026-11-14', '2026-11-15']);
  });

  it.each([['draft space', { space: { ...facts.space, status: 'draft' as const } }]])(
    '404 for %s even when the caller owns it',
    (_n, patch) => {
      expect(() => planPassBooking({ ...facts, ...patch }, 'owner-1', input, now)).toThrow(
        NotFoundException,
      );
    },
  );

  it('decides a draft 404 before pass-not-offered', () => {
    expect(() =>
      planPassBooking(
        { ...facts, space: { ...facts.space, status: 'draft' as const }, price: null },
        'renter',
        input,
        now,
      ),
    ).toThrow(NotFoundException);
  });

  it.each([
    [
      'space-not-published',
      { space: { ...facts.space, status: 'unpublished' as const } },
      'renter',
      'Space not listed',
    ],
    ['own-space', {}, 'owner-1', 'Your own space'],
    ['pass-not-offered', { price: null }, 'renter', 'Pass not offered'],
    ['pass-not-offered', { slotEnabled: false }, 'renter', 'Pass not offered'],
    ['start-day-closed', { calendar: null }, 'renter', 'Start date closed'],
  ] as const)('422 %s', (rule, patch, userId, title) => {
    const p = problemOf(() => planPassBooking({ ...facts, ...patch }, userId, input, now));
    expect(p.getStatus()).toBe(422);
    expect(p.type).toBe(`urn:bseat:problem:booking-rule:${rule}`);
    expect(p.title).toBe(title);
  });

  it('422 slot-started and too-far-ahead', () => {
    const started = problemOf(() =>
      planPassBooking(facts, 'renter', { ...input, startDate: '2026-11-02' }, now),
    );
    expect(started.type).toBe('urn:bseat:problem:booking-rule:slot-started');
    expect(started.detail).toBe('That slot has already started. Choose a later start date.');
    const far = problemOf(() =>
      planPassBooking(facts, 'renter', { ...input, startDate: '2026-12-10' }, now),
    );
    expect(far.type).toBe('urn:bseat:problem:booking-rule:too-far-ahead');
    expect(far.title).toBe('Too far ahead');
    expect(far.detail).toBe('Bookings can start at most 30 days ahead.');
  });

  it('treats a night slot of a fixed-hours space as not offered', () => {
    const p = problemOf(() =>
      planPassBooking(
        {
          ...facts,
          space: {
            ...facts.space,
            openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
          },
        },
        'renter',
        input,
        now,
      ),
    );
    expect(p.type).toBe('urn:bseat:problem:booking-rule:pass-not-offered');
  });
});
