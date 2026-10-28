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

  it('accepts SEED_DEMO_PASSWORD of 12+ characters', () => {
    expect(loadEnv({ ...valid, SEED_DEMO_PASSWORD: '123456789012' }).SEED_DEMO_PASSWORD).toBe(
      '123456789012',
    );
  });

  it('treats a blank SEED_DEMO_PASSWORD as unset', () => {
    expect(loadEnv({ ...valid, SEED_DEMO_PASSWORD: '' }).SEED_DEMO_PASSWORD).toBeUndefined();
  });

  it('refuses SEED_DEMO_PASSWORD in production', () => {
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'production', SEED_DEMO_PASSWORD: '123456789012' }),
    ).toThrow(/SEED_DEMO_PASSWORD must not be set in production/);
  });

  it('rejects a SEED_DEMO_PASSWORD shorter than 12 characters, naming the variable', () => {
    expect(() => loadEnv({ ...valid, SEED_DEMO_PASSWORD: 'elevenchars' })).toThrow(
      /SEED_DEMO_PASSWORD must be at least 12 characters/,
    );
  });

  describe('object storage', () => {
    it('defaults to AWS S3 settings with no credentials', () => {
      const env = loadEnv(valid);
      expect(env.S3_ENDPOINT).toBeUndefined();
      expect(env.S3_BUCKET_PHOTOS).toBe('bseat-photos');
      expect(env.S3_FORCE_PATH_STYLE).toBe(false);
      expect(env.PHOTO_URL_TTL_SECONDS).toBe(3600);
    });

    it('accepts a TTL of 2 and rejects 1 and 3601', () => {
      expect(loadEnv({ ...valid, PHOTO_URL_TTL_SECONDS: '2' }).PHOTO_URL_TTL_SECONDS).toBe(2);
      expect(() => loadEnv({ ...valid, PHOTO_URL_TTL_SECONDS: '1' })).toThrow(
        /PHOTO_URL_TTL_SECONDS/,
      );
      expect(() => loadEnv({ ...valid, PHOTO_URL_TTL_SECONDS: '3601' })).toThrow(
        /PHOTO_URL_TTL_SECONDS/,
      );
    });

    it('requires the access key pair together', () => {
      expect(() => loadEnv({ ...valid, S3_ACCESS_KEY_ID: 'k' })).toThrow(/set together/);
      expect(() => loadEnv({ ...valid, S3_SECRET_ACCESS_KEY: 's' })).toThrow(/set together/);
      expect(
        loadEnv({ ...valid, S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }).S3_ACCESS_KEY_ID,
      ).toBe('k');
    });

    it('parses S3_FORCE_PATH_STYLE as a boolean', () => {
      expect(loadEnv({ ...valid, S3_FORCE_PATH_STYLE: 'true' }).S3_FORCE_PATH_STYLE).toBe(true);
    });
  });
});
