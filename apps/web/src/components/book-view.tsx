'use client';

import { type SpacesAvailabilityParams, useSpacesAvailability } from '@bseat/api-client';
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
    setRequested(values);
    // Same key: the query would not refetch on its own.
    if (same) void availability.refetch();
  };

  const stale =
    requested !== undefined && current !== undefined && !isSameWindow(requested, current);

  const loading = Boolean(requested) && availability.isFetching;

  return (
    <>
      <SpaceList>
        {(spaces) => (
          <BookingWindowForm
            spaces={spaces}
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
        onRetry={() => void availability.refetch()}
      />
    </>
  );
}
