import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeSeatProblem } from './seat-problems';

const T = 'urn:bseat:problem:listing:';
const err = (status: number, type: string, extra: object = {}) =>
  new ApiError(status, { type: `${T}${type}`, status, ...extra });

describe('describeSeatProblem', () => {
  it('label-taken on add one and edit is a field error', () => {
    expect(describeSeatProblem(err(409, 'label-taken'), 'add one', { label: 'A-1' })).toEqual({
      field: 'A-1 is already used by another seat. Choose a different label.',
    });
    expect(describeSeatProblem(err(409, 'label-taken'), 'edit seat', { label: 'B' }).field).toMatch(
      /^B is already used/,
    );
  });

  it('label-taken on add many is an alert listing five labels and the rest', () => {
    const labels = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7'];
    const r = describeSeatProblem(err(409, 'label-taken', { labels }), 'add many', {});
    expect(r.alert?.title).toBe('Some labels are already used');
    expect(r.alert?.description).toEqual([
      'A-1, A-2, A-3, A-4, A-5 and 2 more already exist in this space. No seats were added. Change the prefix or the numbers and try again.',
    ]);
  });

  it('seat-limit uses the current count', () => {
    const r = describeSeatProblem(err(422, 'seat-limit'), 'add many', { current: 190 });
    expect(r.alert).toEqual({
      title: 'Seat limit reached',
      description: [
        'A space can have up to 200 seats. This one has 190, so you can add 10 more. No seats were added.',
      ],
    });
  });

  it('cubicle-name-taken is a field error', () => {
    expect(describeSeatProblem(err(409, 'cubicle-name-taken'), 'add cubicle', {}).field).toBe(
      'Another cubicle already has that name. Choose a different one.',
    );
  });

  it('seat-has-future-bookings differs for seat and cubicle', () => {
    expect(
      describeSeatProblem(err(409, 'seat-has-future-bookings'), 'remove seat', { label: 'A-1' })
        .alert,
    ).toEqual({
      title: 'Seat has upcoming bookings',
      description: ["A-1 can't be removed until its bookings end or are cancelled by the renter."],
    });
    expect(
      describeSeatProblem(err(409, 'seat-has-future-bookings'), 'remove cubicle', { name: 'Bay 1' })
        .alert?.title,
    ).toBe('A seat in this cubicle has upcoming bookings');
  });

  it('404 names the seat or the cubicle', () => {
    expect(describeSeatProblem(new ApiError(404, undefined), 'remove seat', {}).alert?.title).toBe(
      'Seat not found',
    );
    expect(describeSeatProblem(new ApiError(404, undefined), 'add one', {}).alert?.title).toBe(
      'Cubicle not found',
    );
  });

  it('falls back to the owner copy', () => {
    expect(describeSeatProblem(new ApiError(500, undefined), 'remove seat', {}).alert?.title).toBe(
      "We couldn't remove this seat",
    );
  });
});
