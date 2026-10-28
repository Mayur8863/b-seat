import { z } from 'zod';

import { LocalDate } from '../schemas/field-formats.js';
import { ProblemException } from './problem.exception.js';
import { ProblemSchema } from './problem.js';

/**
 * Problem `type` URNs introduced or reused by the marketplace feature
 * (specs/002-space-marketplace/contracts/README.md, "Problem types"). Pass these to
 * `ProblemException`, never inline literals (ADR-0008 section 3). The plain `http-403` and
 * `http-404` types come from `ProblemFilter` and are not listed.
 */
export const PROBLEM_TYPES = {
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
} as const;

/* Response-only schemas for the three problems that carry extra members (AQ-3, ADR-0009
 * section 8). The extension keys are never allowed to clash with `ProblemSchema` members. */

export const PublishIncompleteProblem = ProblemSchema.extend({
  missing: z
    .array(z.enum(['seat', 'pricedPass']))
    .min(1)
    .describe('What the listing still lacks before it can be published'),
}).meta({ id: 'PublishIncompleteProblem' });

export const LabelTakenProblem = ProblemSchema.extend({
  labels: z.array(z.string()).min(1).describe('Labels already used by active seats'),
}).meta({ id: 'LabelTakenProblem' });

export const OccupancyConflictProblem = ProblemSchema.extend({
  conflicts: z
    .array(
      z.object({
        seatId: z.uuid(),
        label: z.string(),
        bookedDates: z.array(LocalDate).describe('Renter occurrence dates (never identities)'),
        marks: z.array(
          z.object({
            id: z.uuid(),
            startDate: LocalDate,
            endDate: LocalDate.nullable().describe('null for an open-ended mark'),
          }),
        ),
      }),
    )
    .min(1),
}).meta({ id: 'OccupancyConflictProblem' });

/** The only extension shapes a `ProblemException` accepts. */
export type ProblemExtensions =
  | Pick<z.infer<typeof PublishIncompleteProblem>, 'missing'>
  | Pick<z.infer<typeof LabelTakenProblem>, 'labels'>
  | Pick<z.infer<typeof OccupancyConflictProblem>, 'conflicts'>;

/** Non-empty list of `T`, so a factory cannot be asked for a problem with nothing to report. */
type NonEmpty<T> = readonly [T, ...T[]];
type Missing = z.infer<typeof PublishIncompleteProblem>['missing'][number];
type Conflict = z.infer<typeof OccupancyConflictProblem>['conflicts'][number];

/* Each factory parses its argument with the response schema's own field: zod objects strip
 * unknown keys, so a Drizzle row carrying renter ids or emails never reaches the body, and
 * `.min(1)` is enforced at runtime too. */

/** 422 publish without an active seat and/or an offered pass. */
export function publishIncomplete(missing: NonEmpty<Missing>): ProblemException {
  return new ProblemException(
    422,
    PROBLEM_TYPES.publishIncomplete,
    'Listing incomplete',
    'Add at least one seat and price at least one pass before publishing.',
    { missing: PublishIncompleteProblem.shape.missing.parse(missing) },
  );
}

/** 409 duplicate label among the active seats of a space. */
export function labelTaken(labels: NonEmpty<string>): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.labelTaken,
    'Seat label taken',
    'Another active seat in this space already uses that label.',
    { labels: LabelTakenProblem.shape.labels.parse(labels) },
  );
}

/** 409 marking seats occupied over renter bookings. */
export function occupancyConflict(conflicts: NonEmpty<Conflict>): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.occupancyConflictsWithBookings,
    'Seats are booked',
    'Some of these seats are booked by renters on those dates.',
    { conflicts: OccupancyConflictProblem.shape.conflicts.parse(conflicts) },
  );
}

/** 409 marking seats occupied over only the owner's own active marks. */
export function alreadyOccupied(conflicts: NonEmpty<Conflict>): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.occupancyAlreadyOccupied,
    'Seats are already occupied',
    'These seats already have active occupancy marks of yours on those dates.',
    { conflicts: OccupancyConflictProblem.shape.conflicts.parse(conflicts) },
  );
}
