import { describe, expect, it } from 'vitest';

import {
  featuresError,
  parseFeatures,
  patternErrors,
  patternPreview,
  seatCountText,
} from './seat-values';

describe('parseFeatures', () => {
  it('splits on commas, trims, drops blanks and repeats ignoring case', () => {
    expect(parseFeatures(' standing desk, Monitor arm,, standing DESK ,')).toEqual([
      'standing desk',
      'Monitor arm',
    ]);
    expect(parseFeatures('')).toEqual([]);
  });
});

describe('featuresError', () => {
  it('flags more than 10 and over-long features', () => {
    expect(featuresError(Array.from({ length: 11 }, (_, i) => `f${i}`))).toBe(
      'Use 10 features or fewer',
    );
    expect(featuresError(['x'.repeat(41)])).toBe('Keep each feature to 40 characters or fewer');
    expect(featuresError(['a'])).toBeUndefined();
  });
});

describe('seatCountText', () => {
  it('words the count', () => {
    expect(seatCountText(0)).toBe('No seats yet');
    expect(seatCountText(1)).toBe('1 seat');
    expect(seatCountText(12)).toBe('12 seats');
  });
});

describe('patternPreview', () => {
  const ok = (prefix: string, from: string, to: string, padTo = '', current = 0) =>
    patternPreview({ prefix, from, to, padTo }, current);

  it('previews first and last label', () => {
    expect(ok('A-', '1', '20')).toEqual({
      ok: true,
      count: 20,
      first: 'A-1',
      last: 'A-20',
      text: 'Adds 20 seats: A-1 to A-20.',
      input: { prefix: 'A-', from: 1, to: 20 },
    });
  });
  it('pads and singularises', () => {
    expect(ok('A-', '1', '20', '2')).toMatchObject({ text: 'Adds 20 seats: A-01 to A-20.' });
    expect(ok('A-', '1', '1')).toMatchObject({ text: 'Adds 1 seat: A-1.', count: 1 });
  });
  it('reports field errors', () => {
    expect(patternErrors({ prefix: 'x'.repeat(16), from: '1', to: '2', padTo: '' }, 0).prefix).toBe(
      'Use 15 characters or fewer',
    );
    const e = (from: string, to: string, padTo = '', current = 0, prefix = '') =>
      patternErrors({ prefix, from, to, padTo }, current);
    expect(e('-1', '2').from).toBe('Enter a whole number, 0 or higher');
    expect(e('', '2').from).toBe('Enter a whole number, 0 or higher');
    expect(e('1', 'x').to).toBe('Enter a whole number');
    expect(e('5', '2').to).toBe('Enter a number that is 5 or higher');
    expect(e('1', '201').to).toBe('That adds 201 seats. You can add up to 200 at once.');
    expect(e('1', '20', '', 190).to).toBe(
      'That adds 20 seats, but a space can have 200 and this one has 190. You can add 10 more.',
    );
    expect(e('1', '2', '5').padTo).toBe('Enter a number from 1 to 4, or leave it empty');
    expect(e('100000000', '100000005', '', 0, 'x'.repeat(15)).prefix).toBe(
      'Labels can be up to 20 characters including the number. Shorten the prefix.',
    );
  });
  it('is not ok while invalid', () => {
    expect(ok('A-', '5', '2')).toEqual({ ok: false });
  });
});
