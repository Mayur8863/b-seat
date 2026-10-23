'use client';

import {
  ApiError,
  getSpacesListQueryKey,
  type SpacesAvailabilityParams,
  useSpacesAvailability,
  useSpacesList,
} from '@bseat/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { BookingWindowForm, type WindowValues } from '@/components/booking-window-form';
import { SeatAvailability } from '@/components/seat-availability';
import { SpaceList } from '@/components/space-list';

function isSameWindow(a: WindowValues | undefined, b: WindowValues | undefined): boolean {
  return (
    a?.spaceId === b?.spaceId &&
    a?.date === b?.date &&
    a?.startTime === b?.startTime &&
    a?.endTime === b?.endTime
  );
}

/** The /book page body: choose a space and window, then see which seats are free. */
export function BookView() {
  const [requested, setRequested] = useState<WindowValues>();
  const [current, setCurrent] = useState<WindowValues>();
  // When the user last asked for seats (submit or retry); 0 before the first time.
  const [askedAt, setAskedAt] = useState(0);
  // Same query as SpaceList, so this reads the cache; gives the requested space's zone for error copy.
  const spaces = useSpacesList();
  const queryClient = useQueryClient();

  const params: SpacesAvailabilityParams = {
    date: requested?.date ?? '',
    startTime: requested?.startTime ?? '',
    endTime: requested?.endTime ?? '',
  };
  const availability = useSpacesAvailability(requested?.spaceId ?? '', params, {
    query: { enabled: Boolean(requested) },
  });

  const submit = (values: WindowValues) => {
    const same = isSameWindow(requested, values);
    setAskedAt(Date.now());
    setRequested(values);
    // Same key: the query would not refetch on its own.
    if (same) void availability.refetch();
  };

  const stale =
    requested !== undefined && current !== undefined && !isSameWindow(requested, current);

  // The busy UI is for the first load or a fetch the user asked for, not a background refetch
  // (window focus). The user's fetch is over once something settled after they asked.
  const { isFetching, isPending, dataUpdatedAt, errorUpdatedAt } = availability;
  const askSettled = Math.max(dataUpdatedAt, errorUpdatedAt) >= askedAt;
  const loading = Boolean(requested) && isFetching && (isPending || !askSettled);
  // Changes once per user request that produced data, so a later refetch never re-scrolls.
  const scrollSignal = askedAt > 0 && dataUpdatedAt >= askedAt ? askedAt : 0;

  const retry = () => {
    setAskedAt(Date.now());
    void availability.refetch();
    // The space may be gone: refresh the list the form is built from.
    if (availability.error instanceof ApiError && availability.error.status === 404) {
      void queryClient.invalidateQueries({ queryKey: getSpacesListQueryKey() });
    }
  };

  return (
    <>
      <SpaceList>
        {(items) => (
          <BookingWindowForm
            spaces={items}
            pending={loading}
            onSubmit={submit}
            onValuesChange={setCurrent}
          />
        )}
      </SpaceList>
      <SeatAvailability
        requested={Boolean(requested)}
        data={availability.data?.data}
        loading={loading}
        error={availability.error}
        stale={stale}
        scrollSignal={scrollSignal}
        timeZone={spaces.data?.data.items.find((s) => s.id === requested?.spaceId)?.timeZone}
        onRetry={retry}
      />
    </>
  );
}
