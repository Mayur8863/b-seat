'use client';

import { useOwnerSeatsListCubicles, useOwnerSeatsListSeats } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { useEffect, useRef, useState } from 'react';

import { AddSeatForm } from '@/components/add-seat-form';
import { BulkSeatForm } from '@/components/bulk-seat-form';
import { CubicleSection } from '@/components/cubicle-section';
import { OccupancySeatList } from '@/components/occupancy-seat-list';
import type { ProblemCopy } from '@/lib/problem-copy';
import { SEAT_LIMIT, seatCountText } from '@/lib/seat-values';

/** Seats page body (ui/02 section 7). The layout owns the space's 404 and loading. */
export function SeatManager({ spaceId }: { spaceId: string }) {
  const seatsQuery = useOwnerSeatsListSeats(spaceId);
  const cubiclesQuery = useOwnerSeatsListCubicles(spaceId);
  const seats = seatsQuery.data?.data.items;
  const cubicles = cubiclesQuery.data?.data.items;
  const [problem, setProblem] = useState<ProblemCopy | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  const count = seats?.length ?? 0;
  const options = {
    cubicles,
    failed: cubiclesQuery.isError,
    onRetry: () => void cubiclesQuery.refetch(),
  };
  const onPageProblem = (copy: ProblemCopy) => {
    setProblem({ ...copy });
  };

  return (
    <div className="grid max-w-4xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Seats</h1>
        {seats ? (
          <p className="text-muted-foreground">
            {count >= SEAT_LIMIT
              ? `${count} seats. You've reached the limit of ${SEAT_LIMIT}.`
              : seatCountText(count)}
          </p>
        ) : (
          !seatsQuery.isError && <Skeleton className="h-4 w-24" />
        )}
        <p className="text-muted-foreground">A space can have up to {SEAT_LIMIT} seats.</p>
      </div>

      {problem && (
        <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>
            {problem.description.map((p) => (typeof p === 'string' ? p : p.text))}
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="add-heading" className="grid gap-4">
        <h2 id="add-heading" className="text-lg font-medium">
          Add seats
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <AddSeatForm spaceId={spaceId} seatCount={count} cubicles={options} />
          <BulkSeatForm spaceId={spaceId} seatCount={count} cubicles={options} />
        </div>
      </section>

      <CubicleSection
        spaceId={spaceId}
        cubicles={cubicles}
        failed={cubiclesQuery.isError}
        onRetry={options.onRetry}
        onPageProblem={onPageProblem}
      />

      <OccupancySeatList
        spaceId={spaceId}
        seats={seats}
        failed={seatsQuery.isError}
        onRetry={() => void seatsQuery.refetch()}
        cubicles={options}
        onPageProblem={onPageProblem}
      />
    </div>
  );
}
