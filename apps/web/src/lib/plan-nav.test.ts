import { describe, expect, it } from 'vitest';

import { nearestFree, readingOrder, type PlanSeat } from './plan-nav';

const seat = (id: string, x: number, y: number, free = true): PlanSeat => ({
  id,
  x,
  y,
  w: 2,
  h: 2,
  free,
});

describe('readingOrder', () => {
  it('sorts top to bottom, then left to right', () => {
    const ids = readingOrder([seat('c', 0, 4), seat('b', 4, 0), seat('a', 0, 0)]).map((s) => s.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('nearestFree', () => {
  const seats = [seat('a', 0, 0), seat('b', 4, 0), seat('c', 8, 0, false), seat('d', 4, 4)];
  it('moves to the nearest free seat in the direction', () => {
    expect(nearestFree(seats, 'a', 'right')?.id).toBe('b');
    expect(nearestFree(seats, 'b', 'down')?.id).toBe('d');
    expect(nearestFree(seats, 'd', 'up')?.id).toBe('b');
    expect(nearestFree(seats, 'b', 'left')?.id).toBe('a');
  });
  it('skips taken seats and stays put at an edge', () => {
    expect(nearestFree(seats, 'b', 'right')).toBeUndefined();
    expect(nearestFree(seats, 'a', 'left')).toBeUndefined();
  });
});
