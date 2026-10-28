'use client';

import type { Cubicle, OwnerSeat } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { useEffect, useRef, useState } from 'react';

import type { DraftState } from '@/lib/layout-editor/model';

export interface PlaceRequest {
  kind: 'seat' | 'cubicle';
  ref: string;
  label: string;
  cubicleId?: string;
}

interface Props {
  state: DraftState;
  seats: OwnerSeat[] | undefined;
  cubicles: Cubicle[] | undefined;
  failed: boolean;
  onRetry: () => void;
  /** Returns false when the grid had no free space. */
  onPlace: (request: PlaceRequest) => boolean;
  disabled: boolean;
}

/** "Not on the plan" (ui/05 5.4): seats and cubicles that have no element in the draft. */
export function UnplacedTray({
  state,
  seats,
  cubicles,
  failed,
  onRetry,
  onPlace,
  disabled,
}: Props) {
  const [full, setFull] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (full) alertRef.current?.focus();
  }, [full]);

  const placedSeats = new Set(state.elements.map((e) => e.seatId).filter(Boolean));
  const placedCubicles = new Set(
    state.elements.filter((e) => e.kind === 'cubicle').map((e) => e.cubicleId),
  );
  const rows: (PlaceRequest & { name: string })[] = [
    ...(seats ?? [])
      .filter((s) => !placedSeats.has(s.id))
      .map((s) => ({
        kind: 'seat' as const,
        ref: s.id,
        label: s.label,
        name: 'Seat',
        ...(s.cubicle ? { cubicleId: s.cubicle.id } : {}),
      })),
    ...(cubicles ?? [])
      .filter((c) => !placedCubicles.has(c.id))
      .map((c) => ({ kind: 'cubicle' as const, ref: c.id, label: c.name, name: 'Cubicle' })),
  ];
  const seatCount = rows.filter((r) => r.kind === 'seat').length;

  let body;
  if (failed) {
    body = (
      <Alert variant="destructive">
        <AlertTitle>We couldn&apos;t load your seats</AlertTitle>
        <AlertDescription>
          <p>Try again in a moment.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!seats || !cubicles) {
    body = (
      <div aria-busy="true" className="grid gap-2">
        <span role="status" className="sr-only">
          Loading seats…
        </span>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm">
        {seats.length === 0
          ? "You haven't added any seats yet. Add one above."
          : 'Every seat is on the plan.'}
      </p>
    );
  } else {
    body = (
      <ul aria-label="Items not on the plan" className="grid gap-2">
        {rows.map((r) => (
          <li key={`${r.kind}:${r.ref}`} className="flex items-center justify-between gap-2">
            <span>
              <span className="font-medium">{r.label}</span>{' '}
              <span className="text-muted-foreground text-sm">{r.name}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setFull(!onPlace(r));
              }}
            >
              Place on plan{' '}
              <span className="sr-only">
                {r.name.toLowerCase()} {r.label}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Not on the plan</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {full && (
          <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
            <AlertTitle>No free space on the grid</AlertTitle>
            <AlertDescription>
              Make the grid bigger or move items, then add it again.
            </AlertDescription>
          </Alert>
        )}
        {body}
        {seatCount > 0 && (
          <p role="status" className="text-muted-foreground text-sm">
            {seatCount} {seatCount === 1 ? 'seat' : 'seats'} not on the plan
          </p>
        )}
      </CardContent>
    </Card>
  );
}
