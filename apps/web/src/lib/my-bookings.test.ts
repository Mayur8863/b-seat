import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { bookingStatus, cancelProblem, periodText } from './my-bookings';

const now = new Date('2026-11-03T10:00:00Z');

describe('bookingStatus', () => {
  it('is upcoming before the first slot starts', () => {
    expect(bookingStatus({ firstStartsAt: '2026-11-03T10:00:01Z' }, now)).toBe('upcoming');
  });
  it('is in progress once started, including at the exact start', () => {
    expect(bookingStatus({ firstStartsAt: '2026-11-03T10:00:00Z' }, now)).toBe('in-progress');
    expect(bookingStatus({ firstStartsAt: '2026-11-01T09:00:00Z' }, now)).toBe('in-progress');
  });
});

describe('periodText', () => {
  it('shows one date for a single day and a range otherwise', () => {
    expect(periodText('2026-11-03', '2026-11-03')).toBe('Tue 3 Nov 2026');
    expect(periodText('2026-11-03', '2026-11-09')).toBe('Tue 3 Nov 2026 to Mon 9 Nov 2026');
  });
});

describe('cancelProblem', () => {
  const err = (status: number, type?: string) =>
    new ApiError(
      status,
      type ? { type: `urn:bseat:problem:${type}`, title: 't', status } : undefined,
    );
  it('maps already-started, 404 and fallback', () => {
    expect(cancelProblem(err(409, 'booking:already-started')).title).toBe(
      'This booking has already started',
    );
    expect(cancelProblem(err(404)).title).toBe("We couldn't find that booking");
    expect(cancelProblem(err(500)).title).toBe("We couldn't cancel that booking");
  });
});
