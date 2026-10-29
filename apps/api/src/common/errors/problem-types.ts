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
  photoLimitReached: 'urn:bseat:problem:photo:limit-reached',
  photoTooLarge: 'urn:bseat:problem:photo:too-large',
  photoUnsupportedFormat: 'urn:bseat:problem:photo:unsupported-format',
  photoDimensionsOutOfRange: 'urn:bseat:problem:photo:dimensions-out-of-range',
  photoUnreadable: 'urn:bseat:problem:photo:unreadable',
  photoBusy: 'urn:bseat:problem:photo:busy',
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

export const PhotoLimitProblem = ProblemSchema.extend({
  limit: z.literal(10).describe('Photos allowed per space'),
}).meta({ id: 'PhotoLimitProblem' });

export const PhotoTooLargeProblem = ProblemSchema.extend({
  maxBytes: z.literal(10_485_760).describe('Largest accepted file, in bytes'),
}).meta({ id: 'PhotoTooLargeProblem' });

export const PhotoFormatProblem = ProblemSchema.extend({
  accepted: z.array(z.enum(['jpeg', 'png', 'webp'])).describe('Accepted formats'),
}).meta({ id: 'PhotoFormatProblem' });

export const PhotoDimensionsProblem = ProblemSchema.extend({
  minLongEdge: z.literal(800),
  maxLongEdge: z.literal(12_000),
  maxPixels: z.literal(50_000_000),
}).meta({ id: 'PhotoDimensionsProblem' });

/** The only extension shapes a `ProblemException` accepts. */
export type ProblemExtensions =
  | Pick<z.infer<typeof PublishIncompleteProblem>, 'missing'>
  | Pick<z.infer<typeof LabelTakenProblem>, 'labels'>
  | Pick<z.infer<typeof OccupancyConflictProblem>, 'conflicts'>
  | Pick<z.infer<typeof PhotoLimitProblem>, 'limit'>
  | Pick<z.infer<typeof PhotoTooLargeProblem>, 'maxBytes'>
  | Pick<z.infer<typeof PhotoFormatProblem>, 'accepted'>
  | Pick<z.infer<typeof PhotoDimensionsProblem>, 'minLongEdge' | 'maxLongEdge' | 'maxPixels'>;

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
    'Seat label already used',
    'Another active seat in this space already uses that label. Choose a different label.',
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
    "You've already marked some of these seats occupied on those dates.",
    { conflicts: OccupancyConflictProblem.shape.conflicts.parse(conflicts) },
  );
}

/** 422 more than 200 active seats in a space. */
export function seatLimit(): ProblemException {
  return new ProblemException(
    422,
    PROBLEM_TYPES.seatLimit,
    'Seat limit reached',
    'A space can have at most 200 seats. No seats were added.',
  );
}

/** 409 another active cubicle of the space has that name. */
export function cubicleNameTaken(): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.cubicleNameTaken,
    'Cubicle name already used',
    'Another active cubicle in this space already has that name. Choose a different name.',
  );
}

/** 409 removing a seat, or a cubicle's seats, with upcoming bookings. */
export function seatHasFutureBookings(): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.seatHasFutureBookings,
    'Upcoming bookings',
    'Upcoming bookings prevent this removal. Wait until they end or are cancelled.',
  );
}

/** 409 the space already has 10 photos. */
export function photoLimitReached(): ProblemException {
  return new ProblemException(
    409,
    PROBLEM_TYPES.photoLimitReached,
    'Photo limit reached',
    'This space already has 10 photos. Delete one to add another.',
    { limit: 10 },
  );
}

/** 413 file over 10 MiB. */
export function photoTooLarge(): ProblemException {
  return new ProblemException(
    413,
    PROBLEM_TYPES.photoTooLarge,
    'Photo too large',
    'Photos can be at most 10 MB.',
    { maxBytes: 10_485_760 },
  );
}

/** 415 not a still JPEG, PNG or WebP by content. */
export function photoUnsupportedFormat(): ProblemException {
  return new ProblemException(
    415,
    PROBLEM_TYPES.photoUnsupportedFormat,
    'Unsupported photo format',
    'Use a JPEG, PNG or WebP photo that is not animated.',
    { accepted: ['jpeg', 'png', 'webp'] },
  );
}

/** 422 long edge or pixel count out of range. */
export function photoDimensionsOutOfRange(): ProblemException {
  return new ProblemException(
    422,
    PROBLEM_TYPES.photoDimensionsOutOfRange,
    'Photo size out of range',
    'The longest side must be 800 to 12,000 pixels, up to 50 megapixels.',
    { minLongEdge: 800, maxLongEdge: 12_000, maxPixels: 50_000_000 },
  );
}

/** 422 the bytes do not decode as an image. */
export function photoUnreadable(): ProblemException {
  return new ProblemException(
    422,
    PROBLEM_TYPES.photoUnreadable,
    'Photo unreadable',
    "This file couldn't be read as an image.",
  );
}

/** 503 temporary: admission full, processing wait over, or storage unavailable. Always retryable. */
export function photoBusy(retryAfterSeconds = 5): ProblemException {
  return new ProblemException(
    503,
    PROBLEM_TYPES.photoBusy,
    'Busy',
    'We are busy right now. Try again in a moment.',
    undefined,
    { 'Retry-After': String(retryAfterSeconds) },
  );
}
