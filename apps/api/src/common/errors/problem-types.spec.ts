import { describe, expect, it } from 'vitest';

import {
  LabelTakenProblem,
  OccupancyConflictProblem,
  PROBLEM_TYPES,
  PublishIncompleteProblem,
} from './problem-types.js';
import { ProblemSchema } from './problem.js';

const base = { type: 't', title: 'T', status: 409 };
const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('PROBLEM_TYPES', () => {
  it('has the type of every row of the contracts table', () => {
    expect(PROBLEM_TYPES).toEqual({
      seatUnavailable: 'urn:bseat:problem:booking:seat-unavailable',
      userOverlap: 'urn:bseat:problem:booking:user-overlap',
      alreadyStarted: 'urn:bseat:problem:booking:already-started',
      spaceNotPublished: 'urn:bseat:problem:booking-rule:space-not-published',
      ownSpace: 'urn:bseat:problem:booking-rule:own-space',
      passNotOffered: 'urn:bseat:problem:booking-rule:pass-not-offered',
      startDayClosed: 'urn:bseat:problem:booking-rule:start-day-closed',
      slotStarted: 'urn:bseat:problem:booking-rule:slot-started',
      tooFarAhead: 'urn:bseat:problem:booking-rule:too-far-ahead',
      publishIncomplete: 'urn:bseat:problem:listing:publish-incomplete',
      seatLimit: 'urn:bseat:problem:listing:seat-limit',
      labelTaken: 'urn:bseat:problem:listing:label-taken',
      cubicleNameTaken: 'urn:bseat:problem:listing:cubicle-name-taken',
      seatHasFutureBookings: 'urn:bseat:problem:listing:seat-has-future-bookings',
      occupancyConflictsWithBookings: 'urn:bseat:problem:occupancy:conflicts-with-bookings',
      occupancyAlreadyOccupied: 'urn:bseat:problem:occupancy:already-occupied',
      layoutStaleVersion: 'urn:bseat:problem:layout:stale-version',
      layoutOutOfBounds: 'urn:bseat:problem:layout:out-of-bounds',
    });
  });
});

describe('extension problem schemas', () => {
  it('require their members', () => {
    expect(PublishIncompleteProblem.safeParse(base).success).toBe(false);
    expect(LabelTakenProblem.safeParse(base).success).toBe(false);
    expect(OccupancyConflictProblem.safeParse(base).success).toBe(false);
  });

  it('accept the documented members, and at least one entry', () => {
    expect(
      PublishIncompleteProblem.safeParse({ ...base, missing: ['seat', 'pricedPass'] }).success,
    ).toBe(true);
    expect(PublishIncompleteProblem.safeParse({ ...base, missing: [] }).success).toBe(false);
    expect(PublishIncompleteProblem.safeParse({ ...base, missing: ['x'] }).success).toBe(false);
    expect(LabelTakenProblem.safeParse({ ...base, labels: ['A-1'] }).success).toBe(true);
    expect(LabelTakenProblem.safeParse({ ...base, labels: [] }).success).toBe(false);
    const conflict = {
      seatId: id,
      label: 'A-1',
      bookedDates: ['2026-11-02'],
      marks: [{ id, startDate: '2026-11-02', endDate: null }],
    };
    expect(OccupancyConflictProblem.safeParse({ ...base, conflicts: [conflict] }).success).toBe(
      true,
    );
    expect(OccupancyConflictProblem.safeParse({ ...base, conflicts: [] }).success).toBe(false);
  });

  it('extend ProblemSchema, which stays unchanged', () => {
    expect(Object.keys(ProblemSchema.shape).sort()).toEqual(
      ['detail', 'errors', 'instance', 'requestId', 'status', 'title', 'type'].sort(),
    );
    expect(Object.keys(LabelTakenProblem.shape)).toContain('title');
  });
});
