import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['//x'],
    ['/\\x'],
    ['/%5Cx'],
    ['/%5cx'],
    ['/\t/x'],
    ['/\n/x'],
    ['/\r/x'],
    ['https://x'],
    ['javascript:alert(1)'],
    ['x/y'],
    [''],
    [undefined],
    [null],
  ])('falls back for %j', (input) => {
    expect(safeNext(input)).toBe('/dashboard');
  });

  it('uses a custom fallback', () => {
    expect(safeNext('//x', '/home')).toBe('/home');
  });

  it.each([
    ['/book', '/book'],
    ['/bookings?x=1#y', '/bookings?x=1#y'],
    ['/book/a%20b', '/book/a%20b'],
  ])('keeps same-site path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
