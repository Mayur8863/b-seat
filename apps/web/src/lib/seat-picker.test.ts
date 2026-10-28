import { describe, expect, it } from 'vitest';

import { filterSeats, isStartDateAllowed, slotHasStarted, startDateRange } from './seat-picker';

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

describe('slotHasStarted', () => {
  const now = new Date('2026-10-29T13:30:00Z'); // 19:00 in Kolkata
  it('compares the slot start with now in the space zone', () => {
    expect(slotHasStarted('2026-10-29', '07:00', 'Asia/Kolkata', now)).toBe(true);
    expect(slotHasStarted('2026-10-29', '19:00', 'Asia/Kolkata', now)).toBe(true);
    expect(slotHasStarted('2026-10-29', '19:01', 'Asia/Kolkata', now)).toBe(false);
    expect(slotHasStarted('2026-10-30', '00:00', 'Asia/Kolkata', now)).toBe(false);
    expect(slotHasStarted('2026-10-28', '23:59', 'Asia/Kolkata', now)).toBe(true);
  });
  it('uses the zone, not the viewer: the same instant is the next day in Auckland', () => {
    expect(slotHasStarted('2026-10-30', '02:00', 'Pacific/Auckland', now)).toBe(true);
  });
});
