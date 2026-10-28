import { describe, expect, it } from 'vitest';

import {
  checkState,
  foldDates,
  formatDay,
  formatMarkRange,
  selectRange,
  toggleAll,
  toggleOne,
  validateMarkDates,
} from './occupancy-values';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('selection model', () => {
  it('toggles one seat and remembers it as the anchor', () => {
    const s = toggleOne({ selected: [], anchor: null }, 'b');
    expect(s).toEqual({ selected: ['b'], anchor: 'b' });
    expect(toggleOne(s, 'b').selected).toEqual([]);
  });

  it('selects the range from the anchor, in list order, in either direction', () => {
    const start = toggleOne({ selected: [], anchor: null }, 'b');
    expect(selectRange(start, ids, 'd').selected).toEqual(['b', 'c', 'd']);
    expect(selectRange(toggleOne({ selected: [], anchor: null }, 'd'), ids, 'b').selected).toEqual([
      'b',
      'c',
      'd',
    ]);
  });

  it('keeps earlier picks and falls back to a single toggle without an anchor', () => {
    const s = { selected: ['a'], anchor: 'c' };
    expect(selectRange(s, ids, 'e').selected).toEqual(['a', 'c', 'd', 'e']);
    expect(selectRange({ selected: [], anchor: null }, ids, 'c').selected).toEqual(['c']);
  });

  it('reports tri-state and toggles all', () => {
    expect(checkState([], ids)).toBe(false);
    expect(checkState(['a'], ids)).toBe('indeterminate');
    expect(checkState(ids, ids)).toBe(true);
    expect(checkState([], [])).toBe(false);
    expect(toggleAll(['a'], ids).selected).toEqual(ids);
    expect(toggleAll(ids, ids).selected).toEqual([]);
  });
});

describe('date folding and formatting', () => {
  it('folds consecutive dates into ranges and caps the output', () => {
    expect(
      foldDates(['2026-11-03', '2026-11-04', '2026-11-06', '2026-11-05', '2026-11-09']),
    ).toEqual([
      ['2026-11-03', '2026-11-06'],
      ['2026-11-09', '2026-11-09'],
    ]);
    expect(foldDates([])).toEqual([]);
  });

  it('formats a day without the year in the current year', () => {
    const now = new Date('2026-10-28T10:00:00Z');
    expect(formatDay('2026-11-02', now)).toBe('Mon 2 Nov');
    expect(formatDay('2027-01-04', now)).toBe('Mon 4 Jan 2027');
  });

  it('formats a mark range, open or closed', () => {
    const now = new Date('2026-10-28T10:00:00Z');
    expect(formatMarkRange('2026-11-02', '2026-11-06', now)).toBe('Mon 2 Nov to Fri 6 Nov');
    expect(formatMarkRange('2026-11-02', null, now)).toBe('from Mon 2 Nov, no end date');
    expect(formatMarkRange('2026-11-02', '2026-11-02', now)).toBe('Mon 2 Nov');
  });
});

describe('validateMarkDates', () => {
  it('requires a start date', () => {
    expect(validateMarkDates({ start: '', ends: 'open', end: '' })).toEqual({
      start: 'Choose a start date.',
    });
  });
  it('requires an end date only when ending on a date, and not before the start', () => {
    expect(validateMarkDates({ start: '2026-11-02', ends: 'open', end: '' })).toEqual({});
    expect(validateMarkDates({ start: '2026-11-02', ends: 'date', end: '' })).toEqual({
      end: 'Choose an end date.',
    });
    expect(validateMarkDates({ start: '2026-11-02', ends: 'date', end: '2026-11-01' })).toEqual({
      end: "The end date can't be before the start date.",
    });
    expect(validateMarkDates({ start: '2026-11-02', ends: 'date', end: '2026-11-02' })).toEqual({});
  });
});
