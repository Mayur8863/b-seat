import { describe, expect, it } from 'vitest';

import { isCrossSiteWrite } from './csrf.guard.js';

const TRUSTED = ['http://localhost:3000'];
const post = (over: Partial<Parameters<typeof isCrossSiteWrite>[0]> = {}) =>
  isCrossSiteWrite(
    {
      method: 'POST',
      path: '/api/bookings/1/cancel',
      secFetchSite: undefined,
      origin: undefined,
      ...over,
    },
    TRUSTED,
  );

describe('isCrossSiteWrite', () => {
  it('lets requests without browser headers through', () => {
    expect(post()).toBe(false);
  });

  it.each(['same-origin', 'same-site', 'none'])('allows Sec-Fetch-Site %s', (v) => {
    expect(post({ secFetchSite: v })).toBe(false);
  });

  it('refuses a cross-site Sec-Fetch-Site', () => {
    expect(post({ secFetchSite: 'cross-site' })).toBe(true);
  });

  it('allows a trusted Origin and refuses another or null', () => {
    expect(post({ origin: 'http://localhost:3000' })).toBe(false);
    expect(post({ origin: 'https://evil.test' })).toBe(true);
    expect(post({ origin: 'null' })).toBe(true);
  });

  it('never blocks safe methods or Better Auth routes', () => {
    expect(post({ method: 'GET', secFetchSite: 'cross-site' })).toBe(false);
    expect(post({ path: '/api/auth/sign-in/email', origin: 'https://evil.test' })).toBe(false);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('covers %s', (method) => {
    expect(post({ method, secFetchSite: 'cross-site' })).toBe(true);
  });
});
