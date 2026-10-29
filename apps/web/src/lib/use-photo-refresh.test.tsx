import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhotoRefresh } from './use-photo-refresh';

describe('usePhotoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refetches 2 minutes before expiry', () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderHook(() => usePhotoRefresh('2026-01-01T01:00:00Z', refetch));
    act(() => {
      vi.advanceTimersByTime(57 * 60_000);
    });
    expect(refetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('never sooner than 5 seconds', () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderHook(() => usePhotoRefresh('2026-01-01T00:00:01Z', refetch));
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(refetch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing without photos', () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderHook(() => usePhotoRefresh(null, refetch));
    act(() => {
      vi.advanceTimersByTime(3_600_000);
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('refetches when the tab becomes visible after the time passed', () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderHook(() => usePhotoRefresh('2026-01-01T01:00:00Z', refetch));
    vi.setSystemTime(new Date('2026-01-01T00:59:00Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight refresh', async () => {
    let resolve = () => undefined;
    const refetch = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = () => {
            r();
          };
        }),
    );
    const { result } = renderHook(() => usePhotoRefresh(null, refetch));
    void result.current();
    void result.current();
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    void result.current();
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
