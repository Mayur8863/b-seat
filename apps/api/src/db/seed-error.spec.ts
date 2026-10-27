import { describe, expect, it } from 'vitest';

import { describeSeedError, SeedError } from './seed-error.js';

describe('describeSeedError', () => {
  it('prints the message of an error the seed threw itself', () => {
    expect(describeSeedError(new SeedError('seed: nope'))).toBe('seed: nope');
  });

  it('hides a driver error message but keeps its code', () => {
    const driver = Object.assign(new Error('insert ... params: $argon2id$secret-hash'), {
      code: '23505',
    });
    const wrapped = new Error('Failed query', { cause: driver });
    expect(describeSeedError(wrapped)).toBe('seed: database error (23505)');
  });

  it('is generic when there is no code', () => {
    expect(describeSeedError(new Error('secret-hash'))).toBe('seed: database error');
    expect(describeSeedError('boom')).toBe('seed: database error');
  });
});
