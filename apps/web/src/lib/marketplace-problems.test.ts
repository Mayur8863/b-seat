import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeBookProblem, describeOwnerProblem, publishMissing } from './marketplace-problems';

const err = (status: number) => new ApiError(status, undefined);

describe('describeOwnerProblem', () => {
  it('uses the network copy for a non-API error', () => {
    expect(describeOwnerProblem(new TypeError('x'), 'save your space')).toEqual({
      title: "We couldn't save your space",
      description: ['Check your connection and try again.'],
    });
  });

  it.each([
    [400, 'Check the details and try again.'],
    [403, "You don't have access to this."],
    [409, 'That changed while you were working. Reload and try again.'],
    [500, 'Something went wrong on our side. Try again in a moment.'],
  ])('status %i has fixed copy', (status, text) => {
    expect(describeOwnerProblem(err(status), 'save your space').description).toEqual([text]);
  });

  it('never shows the server detail', () => {
    const e = new ApiError(500, {
      type: 'urn:bseat:problem:http-500',
      title: 'Boom',
      status: 500,
      detail: 'SECRET',
    });
    expect(JSON.stringify(describeOwnerProblem(e, 'save your space'))).not.toContain('SECRET');
  });

  it('401 links to sign-in with a safe next path', () => {
    const copy = describeOwnerProblem(err(401), 'save your space', '/owner/spaces/new');
    expect(copy.title).toBe('Your session has ended');
    expect(copy.description[0]).toEqual({
      text: 'Sign in',
      href: '/sign-in?next=%2Fowner%2Fspaces%2Fnew',
    });
  });
});

describe('publishMissing', () => {
  const problem = (type: string, missing: string[]) =>
    new ApiError(422, { type, status: 422, missing });

  it('returns the known missing items of a publish refusal', () => {
    expect(
      publishMissing(problem('urn:bseat:problem:listing:publish-incomplete', ['seat', 'x'])),
    ).toEqual(['seat']);
  });

  it('is undefined for other problems and non-API errors', () => {
    expect(publishMissing(problem('urn:bseat:problem:validation', ['seat']))).toBeUndefined();
    expect(publishMissing(err(500))).toBeUndefined();
    expect(publishMissing(new TypeError('x'))).toBeUndefined();
  });
});

describe('describeBookProblem', () => {
  const problem = (status: number, type: string) =>
    new ApiError(status, {
      type: `urn:bseat:problem:${type}`,
      status,
      title: 'T',
      detail: 'SECRET',
    });
  const ctx = { spaceId: 's1', seatLabel: 'A1', path: '/listings/s1' };

  it.each([
    [409, 'booking:seat-unavailable', 'Seat no longer available', 'seats', true],
    [409, 'booking:user-overlap', 'You already have a booking then', 'seats', true],
    [422, 'booking-rule:space-not-published', 'This space is no longer listed', 'listing', false],
    [422, 'booking-rule:own-space', 'This is your space', 'none', false],
    [422, 'booking-rule:pass-not-offered', "That pass isn't offered", 'listing', false],
    [
      422,
      'booking-rule:start-day-closed',
      'That seat is closed on your start date',
      'seats',
      false,
    ],
    [422, 'booking-rule:slot-started', 'That slot has already started', 'none', false],
    [422, 'booking-rule:too-far-ahead', "That's too far ahead", 'none', false],
  ])('%i %s', (status, type, title, refetch, clearSeat) => {
    const r = describeBookProblem(problem(status, type), ctx);
    expect(r.copy.title).toBe(title);
    expect(r.refetch).toBe(refetch);
    expect(r.clearSeat).toBe(clearSeat);
    expect(JSON.stringify(r.copy)).not.toContain('SECRET');
  });

  it('names the seat and links out', () => {
    expect(
      describeBookProblem(problem(409, 'booking:seat-unavailable'), ctx).copy.description[0],
    ).toContain('A1 was taken');
    expect(
      describeBookProblem(problem(409, 'booking:user-overlap'), ctx).copy.description,
    ).toContainEqual({ text: 'My bookings', href: '/bookings' });
    expect(
      describeBookProblem(problem(422, 'booking-rule:own-space'), ctx).copy.description,
    ).toContainEqual({ text: 'Manage seats', href: '/owner/spaces/s1/seats' });
  });

  it('clears the pass when it is not offered', () => {
    expect(describeBookProblem(problem(422, 'booking-rule:pass-not-offered'), ctx).clearPass).toBe(
      true,
    );
  });

  it('bare 404 refetches seats', () => {
    const r = describeBookProblem(err(404), ctx);
    expect(r.copy.title).toBe("That seat isn't available");
    expect(r.refetch).toBe('seats');
  });

  it('400, unknown 422, 503 and network use the fallbacks', () => {
    expect(describeBookProblem(err(400), ctx).copy).toEqual({
      title: "We couldn't book that seat",
      description: ['Check the details and try again.'],
    });
    expect(describeBookProblem(problem(422, 'booking-rule:new'), ctx).copy.description).toEqual([
      'Check the details and try again.',
    ]);
    expect(describeBookProblem(err(503), ctx).copy.description).toEqual([
      'Something went wrong on our side. Try again in a moment.',
    ]);
    expect(describeBookProblem(new TypeError('x'), ctx).copy.description).toEqual([
      'Check your connection and try again.',
    ]);
  });

  it('401 links to sign-in', () => {
    expect(describeBookProblem(err(401), ctx).copy.title).toBe('Your session has ended');
  });
});
