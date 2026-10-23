import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['//x'],
    ['/%E0%A4%A'],
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
    ['/%2F%2Fx', '/%2F%2Fx'],
  ])('keeps same-site path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([['/..//x'], ['/.%2e//x'], ['/a/%2e%2e//x'], ['/;/..//x'], ['/x/../..//y']])(
    'falls back for dot-segment regression %s',
    (input) => {
      expect(safeNext(input)).toBe('/dashboard');
    },
  );

  it('never leaves the origin and is idempotent for generated inputs', () => {
    const tokens = [
      '',
      '.',
      '..',
      '%2e',
      '%2E%2e',
      '.%2e',
      'a',
      ';',
      '%2f',
      '@x',
      ':',
      '?',
      '#',
      '\\',
      '%5C',
    ];
    const base = 'https://app.example';
    const combos: string[][] = [[]];
    for (let size = 1; size <= 3; size++) {
      const prev = combos.filter((c) => c.length === size - 1);
      for (const c of prev) for (const t of tokens) combos.push([...c, t]);
    }
    let checked = 0;
    for (const segments of combos) {
      for (const suffix of ['/x', '//x']) {
        const input = `/${segments.join('/')}${suffix}`;
        const out = safeNext(input);
        expect(new URL(out, base).origin, input).toBe(base);
        expect(safeNext(out), input).toBe(out);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(7000);
  });
});
