'use client';

import type { SeatAvailability as Seat, SpaceAvailability } from '@bseat/api-client';
import { Badge } from '@bseat/ui/components/badge';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { BanIcon, CircleCheckIcon, InfoIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ProblemAlert } from '@/components/problem-alert';
import { formatWhen } from '@/lib/booking-format';

interface Props {
  /** True once the user has submitted the window form at least once. */
  requested: boolean;
  data?: SpaceAvailability;
  loading: boolean;
  error: unknown;
  /** The form no longer matches the seats shown. */
  stale: boolean;
  onRetry: () => void;
}

/** Seats for the chosen window as a keyboard-friendly radio grid. Shows loading, empty, error and success. */
export function SeatAvailability({ requested, data, loading, error, stale, onRetry }: Props) {
  const id = useId();
  const headingId = `${id}-heading`;
  const statusId = `${id}-status`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (data) headingRef.current?.scrollIntoView({ block: 'start' });
  }, [data]);

  const seats = data?.seats ?? [];
  const freeCount = seats.filter((seat) => seat.status === 'free').length;
  const selected = seats.find((seat) => seat.id === selectedId && seat.status === 'free');

  let status = '';
  if (loading) status = 'Loading seats…';
  else if (data && seats.length === 0) status = 'This space has no seats yet.';
  else if (data) status = `${freeCount} of ${seats.length} seats free.`;

  return (
    <section
      aria-labelledby={requested ? headingId : undefined}
      aria-busy={loading || undefined}
      className="grid gap-3"
    >
      {requested && (
        <h2 id={headingId} ref={headingRef} className="text-lg font-medium">
          Seats
        </h2>
      )}
      {requested && data && (
        <p className="text-muted-foreground">
          {data.space.name} · {formatWhen(data.window, data.space.timeZone)}
        </p>
      )}
      <p id={statusId} role="status" className="text-sm">
        {status}
      </p>
      {requested && stale && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          You changed the details. Select Show seats to update the seats.
        </p>
      )}

      {requested && loading && !data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}
      {requested && !loading && error != null && (
        <ProblemAlert
          error={error}
          action="availability"
          title="We couldn't load seats"
          context={{ timeZone: data?.space.timeZone }}
          onRetry={onRetry}
        />
      )}
      {requested && error == null && data && seats.length > 0 && (
        <>
          <RadioGroup
            loop
            value={selected?.id ?? ''}
            onValueChange={setSelectedId}
            aria-labelledby={headingId}
            aria-describedby={statusId}
            className="grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          >
            {seats.map((seat) => (
              <SeatTile key={seat.id} seat={seat} />
            ))}
          </RadioGroup>
          {freeCount === 0 && (
            <p className="text-muted-foreground text-sm">Try a different time or another space.</p>
          )}
        </>
      )}
    </section>
  );
}

function SeatTile({ seat }: { seat: Seat }) {
  const id = useId();
  const labelId = `${id}-label`;
  const statusId = `${id}-status`;
  const featuresId = `${id}-features`;
  const free = seat.status === 'free';
  return (
    <Label
      htmlFor={id}
      className={
        free
          ? 'bg-card hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-primary has-[[data-state=checked]]:bg-primary/5 has-[:focus-visible]:outline-ring flex min-h-16 cursor-pointer scroll-mb-28 items-start gap-2 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[[data-state=checked]]:ring-1'
          : 'bg-muted flex min-h-16 scroll-mb-28 items-start gap-2 rounded-lg border border-dashed p-3'
      }
    >
      <RadioGroupItem
        id={id}
        value={seat.id}
        disabled={!free}
        className="mt-0.5"
        aria-labelledby={`${labelId} ${statusId}`}
        aria-describedby={seat.features.length > 0 ? featuresId : undefined}
      />
      <span className="grid gap-1">
        <span id={labelId} className="font-medium">
          {seat.label}
        </span>
        {free ? (
          <span id={statusId} className="text-success flex items-center gap-1 text-sm font-normal">
            <CircleCheckIcon className="size-4" aria-hidden="true" />
            Free
          </span>
        ) : (
          <span
            id={statusId}
            className="text-muted-foreground flex items-center gap-1 text-sm font-normal"
          >
            <BanIcon className="size-4" aria-hidden="true" />
            Taken
          </span>
        )}
        {seat.features.length > 0 && (
          <span id={featuresId} className="flex flex-wrap gap-1">
            {seat.features.map((feature) => (
              <Badge key={feature} variant="outline" className="font-normal">
                {feature}
              </Badge>
            ))}
          </span>
        )}
      </span>
    </Label>
  );
}
