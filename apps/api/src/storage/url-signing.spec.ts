import { describe, expect, it } from 'vitest';

import { signingWindow } from './url-signing.js';

const at = (s: number) => new Date(s * 1000);

describe('signingWindow', () => {
  it('uses W = floor(TTL / 2)', () => {
    expect(signingWindow(at(5000), 3600).windowSeconds).toBe(1800);
    expect(signingWindow(at(5000), 3).windowSeconds).toBe(1);
  });

  it('returns identical results for two instants in one window', () => {
    const a = signingWindow(at(3600), 3600);
    const b = signingWindow(at(3600 + 1799), 3600);
    expect(a).toEqual(b);
  });

  it('differs in adjacent windows', () => {
    const a = signingWindow(at(1799), 3600);
    const b = signingWindow(at(1800), 3600);
    expect(a.signingDate.getTime()).not.toBe(b.signingDate.getTime());
    expect(a.expiresAt.getTime()).not.toBe(b.expiresAt.getTime());
  });

  it('keeps expiresAt - now within (TTL - W, TTL] for any now', () => {
    for (const ttl of [2, 3, 7, 100, 3599, 3600]) {
      const w = Math.floor(ttl / 2);
      for (let s = 0; s < 400; s += 1) {
        const now = at(1_700_000_000 + s * 13 + 0.5);
        const remaining = (signingWindow(now, ttl).expiresAt.getTime() - now.getTime()) / 1000;
        expect(remaining).toBeGreaterThan(ttl - w);
        expect(remaining).toBeLessThanOrEqual(ttl);
      }
    }
  });

  it('aligns the signing date to the window', () => {
    const { signingDate, windowSeconds } = signingWindow(at(1_700_000_123), 3600);
    expect((signingDate.getTime() / 1000) % windowSeconds).toBe(0);
  });
});
