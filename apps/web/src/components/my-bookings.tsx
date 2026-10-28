'use client';

import { type Booking, useBookingsCancel, useBookingsListMine } from '@bseat/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@bseat/ui/components/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button, buttonVariants } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { formatLocalDate } from '@/lib/booking-format';
import { formatInstant, formatMoney, PASS_LABELS, slotTitle } from '@/lib/format';
import { bookingStatus, cancelProblem, periodText } from '@/lib/my-bookings';
import type { ProblemCopy } from '@/lib/problem-copy';

// The API has no cursor for this list yet (follow-up), so the page is capped.
const PAGE_LIMIT = 50;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BookingCard({
  booking,
  onCancel,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
}) {
  const started = bookingStatus(booking) === 'in-progress';
  const { space, seat } = booking;
  return (
    <li>
      <Card className="p-4">
        <CardContent className="grid gap-3 p-0">
          <div className="grid gap-2 md:flex md:items-start md:justify-between">
            <div className="grid gap-1">
              <h2 tabIndex={-1} data-booking-heading={booking.id} className="text-lg font-medium">
                {space.name}
              </h2>
              <p className="text-muted-foreground text-sm">
                {space.area}, {space.city}
              </p>
              <div>
                <Badge variant={started ? 'secondary' : 'outline'}>
                  {started ? 'In progress' : 'Upcoming'}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/spaces/${space.id}`}>
                  View space<span className="sr-only"> {space.name}</span>
                </Link>
              </Button>
              {started ? (
                <p className="text-muted-foreground text-sm">
                  Started. It can&apos;t be cancelled.
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    onCancel(booking);
                  }}
                >
                  Cancel booking
                  <span className="sr-only">
                    {' '}
                    at {space.name} starting {formatLocalDate(booking.startDate)}
                  </span>
                </Button>
              )}
            </div>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Row label="Seat">
              {seat.label}
              {seat.cubicleName ? `, ${seat.cubicleName}` : ''}
            </Row>
            <Row label="Pass">
              {PASS_LABELS[booking.pass].name} ·{' '}
              {slotTitle({ slot: booking.slot, ...booking.slotTimes })}
            </Row>
            <Row label="Period">{periodText(booking.startDate, booking.endDate)}</Row>
            <Row label="First slot">{formatInstant(booking.firstStartsAt, booking.timeZone)}</Row>
            <Row label="Ends">{formatInstant(booking.lastEndsAt, booking.timeZone)}</Row>
            {booking.skippedDates.length > 0 && (
              <Row label="Closed days skipped">
                {booking.skippedDates.map(formatLocalDate).join(', ')}
              </Row>
            )}
            <Row label="Price">{formatMoney(booking.price)}</Row>
          </dl>
        </CardContent>
      </Card>
    </li>
  );
}

function CancelDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking | null;
  onClose: () => void;
  onDone: (booking: Booking, problem: ProblemCopy | null) => void;
}) {
  const cancel = useBookingsCancel();
  const confirm = () => {
    if (!booking) return;
    cancel.mutate(
      { bookingId: booking.id },
      {
        onSuccess: () => {
          toast.success('Booking cancelled');
          onDone(booking, null);
        },
        onError: (error) => {
          onDone(booking, cancelProblem(error));
        },
      },
    );
  };
  return (
    <AlertDialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open && !cancel.isPending) onClose();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // Focus is placed on a card heading or the alert once the list refreshes.
          e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            {booking
              ? `${PASS_LABELS[booking.pass].name} at ${booking.space.name}, seat ${booking.seat.label}, ${formatLocalDate(booking.startDate)} to ${formatLocalDate(booking.endDate)}. The whole pass is cancelled and the seat is freed. This can't be undone.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter aria-busy={cancel.isPending}>
          <AlertDialogCancel disabled={cancel.isPending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={cancel.isPending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The renter's bookings that haven't ended (ui/03 section 6). */
export function MyBookings() {
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch } = useBookingsListMine({ limit: PAGE_LIMIT });
  const [target, setTarget] = useState<Booking | null>(null);
  const [problem, setProblem] = useState<ProblemCopy | null>(null);
  const [status, setStatus] = useState('');
  const alertRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLAnchorElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfter = useRef<string[] | null>(null);
  const items = data?.data.items ?? [];

  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  // Runs when the refetched list arrives after a cancel: next card, else previous, else the empty state.
  useEffect(() => {
    const candidates = focusAfter.current;
    if (!candidates || !data) return;
    focusAfter.current = null;
    for (const id of candidates) {
      const heading = listRef.current?.querySelector<HTMLElement>(`[data-booking-heading="${id}"]`);
      if (heading) {
        heading.focus();
        return;
      }
    }
    findRef.current?.focus();
  }, [data]);

  const done = (booking: Booking, failure: ProblemCopy | null) => {
    setTarget(null);
    setProblem(failure);
    if (!failure) {
      const index = items.findIndex((b) => b.id === booking.id);
      focusAfter.current = [items[index + 1]?.id, items[index - 1]?.id].filter(
        (id): id is string => id !== undefined,
      );
      setStatus(`Booking at ${booking.space.name} cancelled.`);
    }
    void queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === 'string' &&
        (q.queryKey[0].startsWith('/api/bookings') || q.queryKey[0].includes('/seats')),
    });
  };

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <p className="text-muted-foreground">Bookings that haven&apos;t ended, soonest first.</p>
        <p className="text-muted-foreground text-sm">Prices are paid directly to the owner.</p>
      </div>
      {problem && (
        <Alert variant="destructive" role="alert" tabIndex={-1} ref={alertRef}>
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>
            {problem.description
              .map((part) => (typeof part === 'string' ? part : part.text))
              .join('')}
          </AlertDescription>
        </Alert>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {isPending ? (
        <div aria-busy="true" className="grid gap-3">
          <span role="status" className="sr-only">
            Loading your bookings…
          </span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t load your bookings</AlertTitle>
          <AlertDescription>
            Try again in a moment.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <p className="font-medium">You have no upcoming bookings.</p>
            <p className="text-muted-foreground">
              Find a space and book a seat by the day, week or month.
            </p>
            <Button asChild>
              <Link href="/find" ref={findRef}>
                Find a space
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul aria-label="Bookings" ref={listRef} className="grid gap-4">
          {items.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onCancel={setTarget} />
          ))}
        </ul>
      )}
      {items.length >= PAGE_LIMIT && (
        <p role="note" className="text-muted-foreground text-sm">
          Showing your next {PAGE_LIMIT} bookings. Later ones appear as these end.
        </p>
      )}
      <CancelDialog
        booking={target}
        onClose={() => {
          setTarget(null);
        }}
        onDone={done}
      />
    </>
  );
}
