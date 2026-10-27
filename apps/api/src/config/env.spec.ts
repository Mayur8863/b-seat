import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(3001);
    expect(env.TRUSTED_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits TRUSTED_ORIGINS on commas', () => {
    const env = loadEnv({ ...valid, TRUSTED_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.TRUSTED_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects a short auth secret with a readable message', () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET must be at least 32 characters/,
    );
  });

  it('boots without SEED_DEMO_PASSWORD (seed-only, optional)', () => {
    expect(loadEnv(valid).SEED_DEMO_PASSWORD).toBeUndefined();
  });

  it('accepts SEED_DEMO_PASSWORD of 8+ characters', () => {
    expect(loadEnv({ ...valid, SEED_DEMO_PASSWORD: '12345678' }).SEED_DEMO_PASSWORD).toBe(
      '12345678',
    );
  });

  it('rejects a SEED_DEMO_PASSWORD shorter than 8 characters, naming the variable', () => {
    expect(() => loadEnv({ ...valid, SEED_DEMO_PASSWORD: 'short' })).toThrow(
      /SEED_DEMO_PASSWORD must be at least 8 characters/,
    );
  });
});
