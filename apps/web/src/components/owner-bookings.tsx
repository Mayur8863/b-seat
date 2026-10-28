'use client';

import {
  ApiError,
  getOwnerOperationsListBookingsQueryKey,
  type OwnerBooking,
  ownerOperationsListBookings,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formatLocalDate } from '@/lib/booking-format';
import {
  appliedLine,
  type DateRange,
  parseRange,
  rangeError,
  rangeToQuery,
} from '@/lib/bookings-filter';
import { formatMoney, PASS_LABELS, SLOT_NAMES } from '@/lib/format';

const schema = z.object({ from: z.string(), to: z.string() }).superRefine((v, ctx) => {
  const message = rangeError(v.from, v.to);
  if (message) ctx.addIssue({ code: 'custom', path: ['to'], message });
});

const headingId = (id: string) => `owner-booking-${id}`;

/** "Tue 3 Nov, 09:00 (Asia/Kolkata)": the instant in the space's zone, never the browser's. */
function formatInstant(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} (${timeZone})`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BookingItem({ b }: { b: OwnerBooking }) {
  const period =
    b.startDate === b.endDate
      ? formatLocalDate(b.startDate)
      : `${formatLocalDate(b.startDate)} to ${formatLocalDate(b.endDate)}`;
  return (
    <li>
      <Card className="grid gap-2 p-4">
        <h2 id={headingId(b.id)} tabIndex={-1} className="text-base font-medium break-words">
          {b.renter.name}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-3">
          <Field label="Email">
            <a
              href={`mailto:${b.renter.email}`}
              className="text-primary break-all underline-offset-4 hover:underline"
            >
              {b.renter.email}
            </a>
          </Field>
          <Field label="Seat">{b.seat.label}</Field>
          <Field label="Pass">{`${PASS_LABELS[b.pass].name} · ${SLOT_NAMES[b.slot]}`}</Field>
          <Field label="Period">{period}</Field>
          <Field label="First slot">{formatInstant(b.firstStartsAt, b.timeZone)}</Field>
          <Field label="Ends">{formatInstant(b.lastEndsAt, b.timeZone)}</Field>
          <Field label="Price">
            <span className="font-medium">{formatMoney(b.price)}</span>
          </Field>
        </dl>
      </Card>
    </li>
  );
}

export function OwnerBookings({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const range = parseRange(new URLSearchParams(urlKey));
  const base = `/owner/spaces/${spaceId}/bookings`;
  const go = (r: DateRange) => {
    router.push(`${base}${rangeToQuery(r)}` as Route);
  };

  const form = useForm<DateRange>({ resolver: zodResolver(schema), defaultValues: range });
  useEffect(() => {
    form.reset({ from: range.from, to: range.to });
    // Reset on URL change only; `form` and `range` are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  const query = useInfiniteQuery({
    queryKey: [...getOwnerOperationsListBookingsQueryKey(spaceId, { ...range }), 'pages'],
    queryFn: ({ pageParam, signal }) =>
      ownerOperationsListBookings(
        spaceId,
        { from: range.from || undefined, to: range.to || undefined, cursor: pageParam },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((p) => p.data.items) ?? [];
  const hasMore = query.hasNextPage;
  const filtering = query.isFetching && !query.isFetchingNextPage;
  const filterError = form.formState.errors.to;
  const line = appliedLine(range);
  const errorRef = useRef<HTMLDivElement>(null);
  const moreFailed = query.isFetchNextPageError;

  useEffect(() => {
    if (moreFailed) errorRef.current?.focus();
  }, [moreFailed]);

  const showMore = async () => {
    const before = items.length;
    const result = await query.fetchNextPage();
    const next = result.data?.pages.flatMap((p) => p.data.items)[before];
    if (!result.isError && next) {
      requestAnimationFrame(() => document.getElementById(headingId(next.id))?.focus());
    }
  };

  const firstError = query.error;
  const rangeProblem = firstError instanceof ApiError && firstError.status === 400;
  const clear = () => {
    go({ from: '', to: '' });
  };

  const zone = items[0]?.timeZone;
  const count = `${items.length} ${items.length === 1 ? 'booking' : 'bookings'}`;

  return (
    <div className="grid max-w-6xl gap-4">
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <p className="text-muted-foreground">
        Upcoming bookings for this space. Renters pay you directly; BSeat doesn&apos;t record
        payments.
      </p>
      {zone && <p className="text-muted-foreground">Dates and times are in {zone}.</p>}

      <form
        role="search"
        aria-label="Filter bookings"
        noValidate
        onSubmit={(e) => {
          void form.handleSubmit((v) => {
            go(v);
          })(e);
        }}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="bookings-from">From (optional)</Label>
          <Input
            id="bookings-from"
            type="date"
            disabled={filtering}
            aria-describedby="bookings-hint"
            {...form.register('from')}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bookings-to">To (optional)</Label>
          <Input
            id="bookings-to"
            type="date"
            disabled={filtering}
            aria-invalid={filterError ? true : undefined}
            aria-describedby={filterError ? 'bookings-to-error bookings-hint' : 'bookings-hint'}
            {...form.register('to')}
          />
          {filterError && (
            <p id="bookings-to-error" className="text-destructive text-sm">
              {filterError.message}
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:flex sm:items-end sm:self-end">
          <Button type="submit" disabled={filtering}>
            {filtering ? 'Filtering…' : 'Filter'}
          </Button>
          {line && (
            <Button type="button" variant="ghost" onClick={clear}>
              Clear dates
            </Button>
          )}
        </div>
        <p id="bookings-hint" className="text-muted-foreground text-sm sm:col-span-3">
          Shows bookings with a day in this range.
        </p>
      </form>
      {line && <p className="text-muted-foreground text-sm">{line}</p>}

      {query.isPending && (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            Loading bookings…
          </span>
          <div aria-hidden="true" className="grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {query.isError && !query.data && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{rangeProblem ? 'Check the dates' : "We couldn't load bookings"}</AlertTitle>
          <AlertDescription>
            {rangeProblem ? "To can't be before From." : 'Try again in a moment.'}
            {!rangeProblem && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                >
                  Try again
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {query.data && items.length === 0 && (
        <Card className="grid gap-2 p-6">
          <p className="font-medium">
            {line ? 'No bookings in that date range.' : 'No upcoming bookings yet.'}
          </p>
          <p className="text-muted-foreground">
            {line ? 'Try different dates.' : 'Bookings appear here when renters book a seat.'}
          </p>
          {line && (
            <div>
              <Button type="button" variant="outline" onClick={clear}>
                Clear dates
              </Button>
            </div>
          )}
        </Card>
      )}

      {items.length > 0 && (
        <>
          <p role="status" className="text-sm">
            {hasMore ? `Showing ${count}` : count}
          </p>
          <ul aria-label="Bookings" aria-busy={filtering} className="grid gap-3">
            {items.map((b) => (
              <BookingItem key={b.id} b={b} />
            ))}
          </ul>
          {moreFailed && (
            <Alert variant="destructive" role="alert" tabIndex={-1} ref={errorRef}>
              <AlertTitle>We couldn&apos;t load more bookings</AlertTitle>
              <AlertDescription>
                {query.error instanceof ApiError && query.error.status === 400
                  ? 'The list changed. Start again from the first page.'
                  : 'Try again in a moment.'}
                <div className="mt-3">
                  {query.error instanceof ApiError && query.error.status === 400 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void query.refetch()}
                    >
                      Reload list
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void showMore()}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {hasMore && (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void showMore()}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Show more bookings'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
