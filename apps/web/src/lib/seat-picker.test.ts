import { describe, expect, it } from 'vitest';

import { filterSeats, isStartDateAllowed, startDateRange } from './seat-picker';

describe('startDateRange', () => {
  it('uses the space zone, not the viewer zone', () => {
    const now = new Date('2026-10-28T20:00:00Z');
    expect(startDateRange('Asia/Kolkata', now)).toEqual({ min: '2026-10-29', max: '2026-11-28' });
    expect(startDateRange('America/New_York', now)).toEqual({
      min: '2026-10-28',
      max: '2026-11-27',
    });
  });
});

describe('isStartDateAllowed', () => {
  const range = { min: '2026-10-29', max: '2026-11-28' };
  it('accepts the edges and rejects outside or empty', () => {
    expect(isStartDateAllowed('2026-10-29', range)).toBe(true);
    expect(isStartDateAllowed('2026-11-28', range)).toBe(true);
    expect(isStartDateAllowed('2026-10-28', range)).toBe(false);
    expect(isStartDateAllowed('2026-11-29', range)).toBe(false);
    expect(isStartDateAllowed('', range)).toBe(false);
  });
});

describe('filterSeats', () => {
  const seats = [{ status: 'free' }, { status: 'taken' }, { status: 'closed' }] as const;
  it('keeps everything or only free seats', () => {
    expect(filterSeats([...seats], false)).toHaveLength(3);
    expect(filterSeats([...seats], true)).toEqual([{ status: 'free' }]);
  });
});
