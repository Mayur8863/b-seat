import { ApiError, type ProblemDetails } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeOccupancyProblem } from './occupancy-problems';

const err = (status: number, type: string, extra: Partial<ProblemDetails> = {}) =>
  new ApiError(status, { type: `urn:bseat:problem:${type}`, status, ...extra });
const conflicts = [{ seatId: 's1', label: 'A-1', bookedDates: ['2026-11-03'], marks: [] }];

describe('describeOccupancyProblem', () => {
  it('maps a booking conflict and keeps the per-seat conflicts', () => {
    const p = describeOccupancyProblem(
      err(409, 'occupancy:conflicts-with-bookings', { conflicts }),
      'mark occupied',
    );
    expect(p.alert.title).toBe('Some seats are booked on those dates');
    expect(JSON.stringify(p.alert.description)).toContain("you can't cancel a renter's booking");
    expect(p.conflicts).toEqual(conflicts);
  });

  it('maps already-occupied', () => {
    const p = describeOccupancyProblem(
      err(409, 'occupancy:already-occupied', { conflicts }),
      'mark occupied',
    );
    expect(p.alert.title).toBe('Some seats are already occupied');
    expect(p.conflicts).toHaveLength(1);
  });

  it('names what was not found per action', () => {
    expect(describeOccupancyProblem(err(404, 'x'), 'mark occupied').alert.title).toBe(
      "We couldn't find one of those seats",
    );
    expect(describeOccupancyProblem(err(404, 'x'), 'mark vacant').alert.title).toBe(
      "We couldn't find that mark",
    );
  });

  it('maps validation and falls back by action', () => {
    expect(describeOccupancyProblem(err(400, 'validation'), 'mark occupied').alert.title).toBe(
      'Check the details',
    );
    expect(describeOccupancyProblem(err(500, 'x'), 'remove mark').alert.title).toBe(
      "We couldn't remove that mark",
    );
    expect(describeOccupancyProblem(new Error('x'), 'mark vacant').conflicts).toBeUndefined();
  });
});
