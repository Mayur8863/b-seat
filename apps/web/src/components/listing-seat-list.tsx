'use client';

import {
  ApiError,
  type ListingSeatAvailability,
  type ListingSeatAvailabilitySeatsItem as Seat,
  useListingLayoutGet,
  useListingsSeats,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Checkbox } from '@bseat/ui/components/checkbox';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { BanIcon, CalendarXIcon, CircleCheckIcon, LayoutGridIcon, ListIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { ListingPlan, placeSeats } from '@/components/listing-plan';
import type { PassChoice } from '@/components/pass-options';
import { formatLocalDate } from '@/lib/booking-format';
import { formatInstant } from '@/lib/format';
import { filterSeats } from '@/lib/seat-picker';

export interface SeatSelection {
  seat: Seat;
  availability: ListingSeatAvailability;
}

interface Props {
  spaceId: string;
  /** From the listing; the layout is only fetched when true. */
  hasLayout?: boolean;
  choice: PassChoice;
  startDate: string;
  timeZone: string;
  selectedSeatId: string | null;
  onSelect: (selection: SeatSelection | null) => void;
  /** Called when the server says the pass is no longer offered, so the listing can be refetched. */
  onPassNotOffered?: () => void;
}

function isPassNotOffered(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 422 &&
    (error.problem?.type ?? '').endsWith('pass-not-offered')
  );
}

function lostSeat(availability: ListingSeatAvailability, id: string): string | null {
  const seat = availability.seats.find((s) => s.id === id);
  if (seat?.status === 'free') return null;
  return `Seat ${seat?.label ?? ''} is no longer free. Choose another seat.`.replace('  ', ' ');
}

function SeatTile({
  seat,
  startDate,
  timeZone,
  closedDays,
}: {
  seat: Seat;
  startDate: string;
  timeZone: string;
  closedDays: number;
}) {
  const id = useId();
  const free = seat.status === 'free';
  const stateText =
    seat.status === 'free'
      ? 'Free'
      : seat.status === 'taken'
        ? 'Taken'
        : `Closed on ${formatLocalDate(startDate)}`;
  const Icon = free ? CircleCheckIcon : seat.status === 'taken' ? BanIcon : CalendarXIcon;
  const name = `${seat.label}, ${seat.cubicle ? `${seat.cubicle.name}, ` : ''}${stateText}`;
  return (
    <Label
      htmlFor={id}
      className={
        free
          ? 'bg-card hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[:focus-visible]:outline-ring flex min-h-16 cursor-pointer items-start gap-2 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'
          : 'bg-muted flex min-h-16 items-start gap-2 rounded-lg border border-dashed p-3'
      }
    >
      <RadioGroupItem
        id={id}
        value={seat.id}
        disabled={!free}
        aria-label={name}
        className="mt-0.5"
      />
      <span className="grid gap-1 font-normal">
        <span className="font-medium break-words">{seat.label}</span>
        {seat.cubicle && (
          <span className="text-muted-foreground text-sm break-words">{seat.cubicle.name}</span>
        )}
        {seat.features.length > 0 && (
          <span className="text-muted-foreground text-sm break-words">
            {seat.features.join(', ')}
          </span>
        )}
        <span
          className={`flex items-center gap-1 text-sm ${free ? 'text-success' : 'text-muted-foreground'}`}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {stateText}
        </span>
        {free && seat.lastEndsAt && (
          <span className="text-muted-foreground text-sm">
            Ends {formatInstant(seat.lastEndsAt, timeZone)}
          </span>
        )}
        {free && closedDays > 0 && (
          <span className="text-muted-foreground text-sm">
            Skips {closedDays} closed {closedDays === 1 ? 'day' : 'days'}
          </span>
        )}
      </span>
    </Label>
  );
}

/** Seats for the chosen pass, slot and start date (ui/03 4.4). Selecting only reports the choice; booking is T041. */
export function ListingSeatList({
  spaceId,
  hasLayout = false,
  choice,
  startDate,
  timeZone,
  selectedSeatId,
  onSelect,
  onPassNotOffered,
}: Props) {
  const { data, isPending, isFetching, error, refetch } = useListingsSeats(
    spaceId,
    { pass: choice.pass, slot: choice.slot, startDate },
    { query: { retry: false } },
  );
  const layoutQuery = useListingLayoutGet(spaceId, {
    query: { enabled: hasLayout, retry: false },
  });
  const layout = layoutQuery.data?.data;
  const hasPlan = hasLayout && layout !== undefined && layout.elements.length > 0;
  // Plan from md, list below (ui/05 8.1); the switch overrides it. matchMedia is absent in some test envs.
  const [view, setView] = useState<'plan' | 'list'>(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
      ? 'plan'
      : 'list',
  );
  const layoutFailed =
    hasLayout &&
    layoutQuery.isError &&
    !(layoutQuery.error instanceof ApiError && layoutQuery.error.status === 404);
  const [hide, setHide] = useState(false);
  const [notice, setNotice] = useState('');
  const [announce, setAnnounce] = useState('');
  const availability = data?.data;
  const notOffered = isPassNotOffered(error);

  useEffect(() => {
    if (notOffered) onPassNotOffered?.();
  }, [notOffered, onPassNotOffered]);

  // A refetch can turn the selected seat into a taken one; say so and clear it.
  const lost = availability && selectedSeatId ? lostSeat(availability, selectedSeatId) : null;
  if (lost && notice !== lost) setNotice(lost);
  useEffect(() => {
    if (lost) onSelect(null);
  }, [lost, onSelect]);

  const headingId = useId();
  const hideId = useId();

  let body;
  if (isPending) {
    body = (
      <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <span role="status" aria-live="polite" className="sr-only">
          Loading seats…
        </span>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-24 rounded-lg" />
        ))}
      </div>
    );
  } else if (error || !availability) {
    body = (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{notOffered ? "That pass isn't offered" : "We couldn't load seats"}</AlertTitle>
        <AlertDescription>
          <p>{notOffered ? 'Choose another pass or slot.' : 'Try again in a moment.'}</p>
          {!notOffered && (
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  } else if (availability.seats.length === 0) {
    body = <p className="text-muted-foreground">This space has no seats right now.</p>;
  } else {
    const seats = availability.seats;
    const free = seats.filter((s) => s.status === 'free').length;
    const shown = filterSeats(seats, hide);
    const onPlan = new Set(hasPlan ? placeSeats(layout, seats).map((p) => p.id) : []);
    const offPlan = seats.filter((s) => !onPlan.has(s.id));
    const choose = (id: string) => {
      const seat = seats.find((s) => s.id === id);
      if (!seat) return;
      setNotice('');
      setAnnounce(`Seat ${seat.label} selected.`);
      onSelect({ seat, availability });
    };
    const seatGroup = (list: Seat[]) => (
      <RadioGroup
        aria-labelledby={headingId}
        value={selectedSeatId ?? ''}
        onValueChange={choose}
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 ${isFetching ? 'opacity-50' : ''}`}
      >
        {list.map((seat) => (
          <SeatTile
            key={seat.id}
            seat={seat}
            startDate={startDate}
            timeZone={timeZone}
            closedDays={seat.closedDates.length}
          />
        ))}
      </RadioGroup>
    );
    body = (
      <>
        <p role="status" className="text-muted-foreground">
          {free} of {seats.length} seats are free for this pass.
        </p>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {free === 0 && (
          <Card>
            <CardContent className="grid gap-1">
              <p className="font-medium">No seat is free for the whole period.</p>
              <p className="text-muted-foreground">Try another start date, pass or slot.</p>
            </CardContent>
          </Card>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id={hideId}
            checked={hide}
            onCheckedChange={(v) => {
              setHide(v === true);
            }}
          />
          <Label htmlFor={hideId}>Hide seats that aren&apos;t free</Label>
        </div>
        {hasPlan && (
          <div role="group" aria-label="Seat view" className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={view === 'plan'}
              className={
                view === 'plan' ? 'bg-secondary text-secondary-foreground font-medium' : ''
              }
              onClick={() => {
                setView('plan');
              }}
            >
              <LayoutGridIcon aria-hidden="true" />
              Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={view === 'list'}
              className={
                view === 'list' ? 'bg-secondary text-secondary-foreground font-medium' : ''
              }
              onClick={() => {
                setView('list');
              }}
            >
              <ListIcon aria-hidden="true" />
              List
            </Button>
          </div>
        )}
        {layoutFailed && (
          <p role="status" className="text-muted-foreground text-sm">
            The floor plan isn&apos;t available right now. Choose a seat from the list.{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void layoutQuery.refetch()}
            >
              Try again
            </Button>
          </p>
        )}
        {hasLayout && layoutQuery.isPending && (
          <div aria-busy="true">
            <span role="status" aria-live="polite" className="sr-only">
              Loading the floor plan…
            </span>
            <Skeleton aria-hidden="true" className="h-72 rounded-xl" />
          </div>
        )}
        {hasPlan && view === 'plan' ? (
          <>
            <ListingPlan
              layout={layout}
              seats={seats}
              startDate={startDate}
              selectedSeatId={selectedSeatId}
              labelledBy={headingId}
              onSelect={choose}
            />
            {offPlan.length > 0 && (
              <div className="grid gap-2">
                <h3 className="font-medium">Seats not on the plan</h3>
                {seatGroup(offPlan)}
              </div>
            )}
          </>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground">No free seats to show.</p>
        ) : (
          seatGroup(shown)
        )}
        <span role="status" className="sr-only">
          {announce}
        </span>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-lg font-medium">
        Choose a seat
      </h2>
      {body}
    </section>
  );
}
