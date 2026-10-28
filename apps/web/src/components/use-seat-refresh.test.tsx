import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSeatRefresh } from './use-seat-refresh';

describe('useSeatRefresh', () => {
  it('invalidates seats, cubicles, occupancy, layout, calendars, space and list', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSeatRefresh('s1'), { wrapper });
    result.current();
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const part of ['/seats', '/cubicles', '/occupancy', '/layout', '/calendars']) {
      expect(
        keys.some((k) => k.includes(part)),
        part,
      ).toBe(true);
    }
    expect(spy).toHaveBeenCalledTimes(7);
  });
});
