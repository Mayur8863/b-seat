import { describe, expect, it } from 'vitest';

import {
  alreadyOccupied,
  cubicleNameTaken,
  labelTaken,
  LabelTakenProblem,
  occupancyConflict,
  OccupancyConflictProblem,
  photoBusy,
  photoDimensionsOutOfRange,
  photoLimitReached,
  photoOrderStale,
  photoTooLarge,
  photoUnreadable,
  photoUnsupportedFormat,
  PROBLEM_TYPES,
  publishIncomplete,
  PublishIncompleteProblem,
  seatHasFutureBookings,
  seatLimit,
} from './problem-types.js';
import { ProblemException } from './problem.exception.js';
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
      photoLimitReached: 'urn:bseat:problem:photo:limit-reached',
      photoTooLarge: 'urn:bseat:problem:photo:too-large',
      photoUnsupportedFormat: 'urn:bseat:problem:photo:unsupported-format',
      photoDimensionsOutOfRange: 'urn:bseat:problem:photo:dimensions-out-of-range',
      photoUnreadable: 'urn:bseat:problem:photo:unreadable',
      photoBusy: 'urn:bseat:problem:photo:busy',
      photoOrderStale: 'urn:bseat:problem:photo:order-stale',
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

describe('extension keys', () => {
  it('never intersect the standard problem members', () => {
    const reserved = Object.keys(ProblemSchema.shape);
    for (const schema of [PublishIncompleteProblem, LabelTakenProblem, OccupancyConflictProblem]) {
      const extra = Object.keys(schema.shape).filter((key) => !reserved.includes(key));
      expect(extra).toHaveLength(1);
    }
    const extensionKeys = (schema: { shape: object }) =>
      Object.keys(schema.shape).filter((key) => !reserved.includes(key));
    expect(extensionKeys(PublishIncompleteProblem)).toEqual(['missing']);
    expect(extensionKeys(LabelTakenProblem)).toEqual(['labels']);
    expect(extensionKeys(OccupancyConflictProblem)).toEqual(['conflicts']);
  });
});

describe('problem factories', () => {
  it('build a 422 publish-incomplete problem with its extension', () => {
    const err = publishIncomplete(['seat']);
    expect(err).toBeInstanceOf(ProblemException);
    expect(err.getStatus()).toBe(422);
    expect(err.type).toBe(PROBLEM_TYPES.publishIncomplete);
    expect(err.extensions).toEqual({ missing: ['seat'] });
  });

  it('build a 409 label-taken problem with its extension', () => {
    const err = labelTaken(['A-1']);
    expect(err.getStatus()).toBe(409);
    expect(err.type).toBe(PROBLEM_TYPES.labelTaken);
    expect(err.extensions).toEqual({ labels: ['A-1'] });
  });

  it('build a 409 occupancy conflict problem with its extension', () => {
    const conflicts: [{ seatId: string; label: string; bookedDates: string[]; marks: [] }] = [
      { seatId: id, label: 'A-1', bookedDates: ['2026-11-02'], marks: [] },
    ];
    const err = occupancyConflict(conflicts);
    expect(err.getStatus()).toBe(409);
    expect(err.type).toBe(PROBLEM_TYPES.occupancyConflictsWithBookings);
    expect(err.extensions).toEqual({ conflicts });
  });

  it('build a 409 already-occupied problem with the same extension', () => {
    const conflicts: [{ seatId: string; label: string; bookedDates: []; marks: [] }] = [
      { seatId: id, label: 'A-1', bookedDates: [], marks: [] },
    ];
    const err = alreadyOccupied(conflicts);
    expect(err.getStatus()).toBe(409);
    expect(err.type).toBe(PROBLEM_TYPES.occupancyAlreadyOccupied);
    expect(err.extensions).toEqual({ conflicts });
  });

  it('use the problem copy registry title and detail', () => {
    const c: [{ seatId: string; label: string; bookedDates: []; marks: [] }] = [
      { seatId: id, label: 'A-1', bookedDates: [], marks: [] },
    ];
    const text = (e: ProblemException) => [e.title, e.detail];
    expect(text(publishIncomplete(['seat']))).toEqual([
      'Listing incomplete',
      'Add at least one seat and price at least one pass before publishing.',
    ]);
    expect(text(labelTaken(['A-1']))).toEqual([
      'Seat label already used',
      'Another active seat in this space already uses that label. Choose a different label.',
    ]);
    expect(text(occupancyConflict(c))).toEqual([
      'Seats are booked',
      'Some of these seats are booked by renters on those dates.',
    ]);
    expect(text(alreadyOccupied(c))).toEqual([
      'Seats are already occupied',
      "You've already marked some of these seats occupied on those dates.",
    ]);
  });

  it('build the seat-limit, cubicle-name and future-booking problems from the registry', () => {
    const text = (e: ProblemException) => [e.getStatus(), e.type, e.title, e.detail];
    expect(text(seatLimit())).toEqual([
      422,
      PROBLEM_TYPES.seatLimit,
      'Seat limit reached',
      'A space can have at most 200 seats. No seats were added.',
    ]);
    expect(text(cubicleNameTaken())).toEqual([
      409,
      PROBLEM_TYPES.cubicleNameTaken,
      'Cubicle name already used',
      'Another active cubicle in this space already has that name. Choose a different name.',
    ]);
    expect(text(seatHasFutureBookings())).toEqual([
      409,
      PROBLEM_TYPES.seatHasFutureBookings,
      'Upcoming bookings',
      'Upcoming bookings prevent this removal. Wait until they end or are cancelled.',
    ]);
  });

  it('strip undocumented fields from passed-in objects', () => {
    const row = {
      seatId: id,
      label: 'A-1',
      bookedDates: ['2026-11-02'],
      marks: [{ id, startDate: '2026-11-02', endDate: null, email: 'o@example.com' }],
      email: 'renter@example.com',
    };
    const conflicts: [typeof row] = [row];
    const expected = {
      conflicts: [
        {
          seatId: id,
          label: 'A-1',
          bookedDates: ['2026-11-02'],
          marks: [{ id, startDate: '2026-11-02', endDate: null }],
        },
      ],
    };
    expect(occupancyConflict(conflicts).extensions).toEqual(expected);
    expect(alreadyOccupied(conflicts).extensions).toEqual(expected);
  });

  it('require at least one entry', () => {
    // @ts-expect-error missing must be a non-empty tuple
    expect(() => publishIncomplete([])).toThrow();
    // @ts-expect-error labels must be a non-empty tuple
    expect(() => labelTaken([])).toThrow();
    // @ts-expect-error conflicts must be a non-empty tuple
    expect(() => occupancyConflict([])).toThrow();
    // @ts-expect-error conflicts must be a non-empty tuple
    expect(() => alreadyOccupied([])).toThrow();
  });

  it('reject untyped extension objects at compile time', () => {
    const build = () =>
      // @ts-expect-error extensions must come from a factory shape
      new ProblemException(409, 't', 'T', 'D', { anything: 1 });
    expect(build).not.toThrow();
    // @ts-expect-error labels must be strings
    expect(() => labelTaken([1])).toThrow();
  });
});

describe('photo problem factories', () => {
  it.each([
    [
      photoLimitReached(),
      409,
      'Photo limit reached',
      'This space already has 10 photos. Delete one to add another.',
      { limit: 10 },
    ],
    [
      photoTooLarge(),
      413,
      'Photo too large',
      'Photos can be at most 10 MB.',
      { maxBytes: 10_485_760 },
    ],
    [
      photoUnsupportedFormat(),
      415,
      'Unsupported photo format',
      'Use a JPEG, PNG or WebP photo that is not animated.',
      { accepted: ['jpeg', 'png', 'webp'] },
    ],
    [
      photoDimensionsOutOfRange(),
      422,
      'Photo size out of range',
      'The longest side must be 800 to 12,000 pixels, up to 50 megapixels.',
      { minLongEdge: 800, maxLongEdge: 12_000, maxPixels: 50_000_000 },
    ],
    [
      photoUnreadable(),
      422,
      'Photo unreadable',
      "This file couldn't be read as an image.",
      undefined,
    ],
    [
      photoOrderStale(),
      409,
      'Photos changed',
      'The photos changed after you opened them. Reload them and try again.',
      undefined,
    ],
    [photoBusy(), 503, 'Busy', 'We are busy right now. Try again in a moment.', undefined],
  ])('%#: status, exact copy and extensions', (e, status, title, detail, extensions) => {
    expect(e.getStatus()).toBe(status);
    expect(e.title).toBe(title);
    expect(e.detail).toBe(detail);
    expect(e.extensions).toEqual(extensions);
  });

  it('photoBusy carries Retry-After', () => {
    expect(photoBusy(7).headers).toEqual({ 'Retry-After': '7' });
  });
});
