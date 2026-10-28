export interface SigningWindow {
  windowSeconds: number;
  /** Start of the window; SigV4 signs this date, so every URL in a window is byte-identical. */
  signingDate: Date;
  expiresAt: Date;
}

/**
 * ADR-0011 section 5: W = floor(TTL / 2), signingDate = floor(now / W) * W, expiresAt = signingDate + TTL.
 * A URL issued at `now` therefore dies in (now + TTL - W, now + TTL].
 */
export function signingWindow(now: Date, ttlSeconds: number): SigningWindow {
  const windowSeconds = Math.max(1, Math.floor(ttlSeconds / 2));
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const start = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  return {
    windowSeconds,
    signingDate: new Date(start * 1000),
    expiresAt: new Date((start + ttlSeconds) * 1000),
  };
}
