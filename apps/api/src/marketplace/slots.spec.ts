import { describe, expect, it } from 'vitest';

import { dayBoundary, offeredSlots, slotWindow, type OpeningHours } from './slots.js';

const LONDON = 'Europe/London';
const KOLKATA = 'Asia/Kolkata';
const shift = (shiftChangeAt: string): OpeningHours => ({ mode: 'always_open', shiftChangeAt });
const fixed: OpeningHours = { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' };

const iso = (w: { startsAt: Date; endsAt: Date }) => [
  w.startsAt.toISOString(),
  w.endsAt.toISOString(),
];
const hours = (w: { startsAt: Date; endsAt: Date }) =>
  (w.endsAt.getTime() - w.startsAt.getTime()) / 3_600_000;

describe('offeredSlots', () => {
  it('offers day, night and full_day for a 24-hour space', () => {
    expect(offeredSlots(shift('07:00'))).toEqual(['day', 'night', 'full_day']);
  });

  it('offers exactly working_hours for fixed hours', () => {
    expect(offeredSlots(fixed)).toEqual(['working_hours']);
  });
});

describe('slotWindow', () => {
  it('derives day, night and full_day from the shift change (Asia/Kolkata)', () => {
    const o = shift('07:00');
    expect(iso(slotWindow(o, 'day', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-02T01:30:00.000Z',
      '2026-11-02T13:30:00.000Z',
    ]);
    expect(iso(slotWindow(o, 'night', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-02T13:30:00.000Z',
      '2026-11-03T01:30:00.000Z',
    ]);
    expect(iso(slotWindow(o, 'full_day', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-02T01:30:00.000Z',
      '2026-11-03T01:30:00.000Z',
    ]);
  });

  it('gives fixed hours one working_hours window on the same day', () => {
    expect(iso(slotWindow(fixed, 'working_hours', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-02T03:30:00.000Z',
      '2026-11-02T12:30:00.000Z',
    ]);
  });

  it('refuses a slot the opening hours do not offer', () => {
    expect(() => slotWindow(fixed, 'night', '2026-11-02', LONDON)).toThrow();
    expect(() => slotWindow(shift('07:00'), 'working_hours', '2026-11-02', LONDON)).toThrow();
  });

  it('puts a night slot that starts after the shift on the date it starts', () => {
    // Shift 20:00: day 20:00-08:00 (crosses midnight), night 08:00-20:00 the next date.
    const o = shift('20:00');
    expect(iso(slotWindow(o, 'day', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-02T14:30:00.000Z',
      '2026-11-03T02:30:00.000Z',
    ]);
    expect(iso(slotWindow(o, 'night', '2026-11-02', KOLKATA))).toEqual([
      '2026-11-03T02:30:00.000Z',
      '2026-11-03T14:30:00.000Z',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(iso(slotWindow(shift('07:00'), 'night', '2026-12-31', KOLKATA))).toEqual([
      '2026-12-31T13:30:00.000Z',
      '2027-01-01T01:30:00.000Z',
    ]);
    expect(iso(slotWindow(shift('07:00'), 'full_day', '2028-02-28', KOLKATA))[1]).toBe(
      '2028-02-29T01:30:00.000Z',
    );
  });

  it('follows the wall clock over London changeovers', () => {
    expect(hours(slotWindow(shift('07:00'), 'night', '2026-10-24', LONDON))).toBe(13);
    expect(hours(slotWindow(shift('07:00'), 'full_day', '2026-03-28', LONDON))).toBe(23);
    expect(hours(slotWindow(shift('07:00'), 'full_day', '2026-10-24', LONDON))).toBe(25);
  });

  it('asserts the exact instants of the London changeover slots', () => {
    expect(iso(slotWindow(shift('07:00'), 'night', '2026-10-24', LONDON))).toEqual([
      '2026-10-24T18:00:00.000Z',
      '2026-10-25T07:00:00.000Z',
    ]);
    expect(iso(slotWindow(shift('07:00'), 'full_day', '2026-03-28', LONDON))).toEqual([
      '2026-03-28T07:00:00.000Z',
      '2026-03-29T06:00:00.000Z',
    ]);
  });

  it('resolves a shift inside a DST gap or overlap and keeps slots touching', () => {
    const o = shift('01:30');
    const gap = slotWindow(o, 'day', '2026-03-29', LONDON);
    expect(gap.startsAt.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    const overlap = slotWindow(o, 'day', '2026-10-25', LONDON);
    expect(overlap.startsAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');

    for (const date of ['2026-03-29', '2026-10-25']) {
      const day = slotWindow(o, 'day', date, LONDON);
      const night = slotWindow(o, 'night', date, LONDON);
      expect(day.endsAt.getTime()).toBe(night.startsAt.getTime());
    }
    const prev = slotWindow(o, 'full_day', '2026-03-28', LONDON);
    expect(prev.endsAt.getTime()).toBe(gap.startsAt.getTime());
    const prevOverlap = slotWindow(o, 'full_day', '2026-10-24', LONDON);
    expect(prevOverlap.endsAt.getTime()).toBe(overlap.startsAt.getTime());
  });

  it('never exceeds 26 hours for a full_day', () => {
    for (let d = 1; d <= 31; d += 1) {
      const date = `2026-10-${String(d).padStart(2, '0')}`;
      expect(hours(slotWindow(shift('01:30'), 'full_day', date, LONDON))).toBeLessThanOrEqual(26);
    }
  });
});

describe('dayBoundary', () => {
  it('is the shift change for 24-hour spaces', () => {
    expect(dayBoundary(shift('07:00'), '2026-11-02', KOLKATA).toISOString()).toBe(
      '2026-11-02T01:30:00.000Z',
    );
  });

  it('is local midnight for fixed hours, including on a changeover day', () => {
    expect(dayBoundary(fixed, '2026-03-29', LONDON).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(dayBoundary(fixed, '2026-06-01', LONDON).toISOString()).toBe('2026-05-31T23:00:00.000Z');
  });

  it('resolves a gap boundary like slots', () => {
    expect(dayBoundary(shift('01:30'), '2026-03-29', LONDON).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });
});
