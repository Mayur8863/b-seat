import { describe, expect, it } from 'vitest';

import { appliedLine, parseRange, rangeError, rangeToQuery } from './bookings-filter';

describe('rangeError', () => {
  it('accepts empty, open and ordered ranges', () => {
    expect(rangeError('', '')).toBeUndefined();
    expect(rangeError('2026-11-03', '')).toBeUndefined();
    expect(rangeError('2026-11-03', '2026-11-03')).toBeUndefined();
  });
  it('rejects To before From', () => {
    expect(rangeError('2026-11-04', '2026-11-03')).toBe("To can't be before From.");
  });
});

describe('parseRange', () => {
  it('keeps valid dates and drops anything else', () => {
    const p = new URLSearchParams({ from: '2026-11-03', to: 'nope' });
    expect(parseRange(p)).toEqual({ from: '2026-11-03', to: '' });
  });
});

describe('rangeToQuery', () => {
  it('omits empty ends', () => {
    expect(rangeToQuery({ from: '', to: '2026-11-09' })).toBe('?to=2026-11-09');
    expect(rangeToQuery({ from: '', to: '' })).toBe('');
  });
});

describe('appliedLine', () => {
  it('words each case', () => {
    expect(appliedLine({ from: '2026-11-03', to: '2026-11-09' })).toBe(
      'Showing bookings from Tue 3 Nov 2026 to Mon 9 Nov 2026.',
    );
    expect(appliedLine({ from: '2026-11-03', to: '' })).toBe(
      'Showing bookings from Tue 3 Nov 2026.',
    );
    expect(appliedLine({ from: '', to: '2026-11-09' })).toBe(
      'Showing bookings until Mon 9 Nov 2026.',
    );
    expect(appliedLine({ from: '', to: '' })).toBeUndefined();
  });
});
