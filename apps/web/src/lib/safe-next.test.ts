import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['//x'],
    ['/.//x'],
    ['/a/..//x'],
    ['/%2e//x'],
    ['/%2E%2E//x'],
    ['/./%2e//x'],
    ['/book/..//x/y?z#w'],
    [`/${'a'.repeat(2048)}`],
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

  it('only ever returns the fallback or a single-slash path, and is idempotent', () => {
    const inputs = [
      '//x',
      '/.//x',
      '/a/..//x',
      '/%2e//x',
      '/%2E%2E//x',
      '/./%2e//x',
      '/book/..//x/y?z#w',
      '/\\x',
      '/%5Cx',
      '/\t/x',
      'https://x',
      '',
      '/book',
      '/bookings?x=1#y',
      '/book/a%20b',
      '/a/../book',
      '/./book',
    ];
    for (const x of inputs) {
      const out = safeNext(x);
      expect(out === '/dashboard' || /^\/(?![/\\])/.test(out)).toBe(true);
      expect(safeNext(out)).toBe(out);
    }
  });
});
