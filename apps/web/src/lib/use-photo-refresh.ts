'use client';

import { useCallback, useEffect, useRef } from 'react';

const LEAD_MS = 2 * 60_000;
const MIN_DELAY_MS = 5_000;

/**
 * Keeps signed photo URLs fresh (ui/02 section 7, FR-019). Refetches silently shortly before
 * `expireAt` and when a hidden tab returns after that time. The returned function is for failing
 * images: it shares one in-flight refetch between all callers.
 */
export function usePhotoRefresh(
  expireAt: string | null | undefined,
  refetch: () => Promise<unknown>,
): () => Promise<void> {
  const inflight = useRef<Promise<void> | null>(null);
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });

  const refresh = useCallback(() => {
    inflight.current ??= Promise.resolve(latest.current())
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, []);

  useEffect(() => {
    if (!expireAt) return;
    const at = Date.parse(expireAt) - LEAD_MS;
    const timer = setTimeout(() => void refresh(), Math.max(MIN_DELAY_MS, at - Date.now()));
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() >= at) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [expireAt, refresh]);

  return refresh;
}
