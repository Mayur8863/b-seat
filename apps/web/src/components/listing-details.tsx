'use client';

import { ApiError, type Booking, type Listing, useListingsGet, useMeGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { ArrowLeftIcon, InfoIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BookingConfirmation, BookProblemAlert, ReviewDialog } from '@/components/book-pass';
import { ListingSeatList, type SeatSelection } from '@/components/listing-seat-list';
import { type PassChoice, PassOptions } from '@/components/pass-options';
import { StartDateField } from '@/components/start-date-field';
import { type BookingSelection, YourSelection } from '@/components/your-selection';
import { slotTitle, utilityLabel } from '@/lib/format';
import { parseListingParams, withListingParams } from '@/lib/listing-params';
import { describeBookProblem, SLOT_STARTED } from '@/lib/marketplace-problems';
import type { ProblemCopy } from '@/lib/problem-copy';
import { isStartDateAllowed, slotHasStarted, startDateRange } from '@/lib/seat-picker';

const FRAME = 'mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6';

function hoursText(hours: Listing['openingHours']): string {
  return hours.mode === 'always_open'
    ? 'Open 24 hours'
    : `Working hours, ${hours.opensAt} to ${hours.closesAt}`;
}

function countryName(code: string): string {
  return new Intl.DisplayNames('en', { type: 'region' }).of(code) ?? code;
}

function Details({ listing }: { listing: Listing }) {
  const utilities = [...listing.utilities.map(utilityLabel), ...listing.customUtilities];
  return (
    <section aria-labelledby="about-heading" className="grid gap-3">
      <h2 id="about-heading" className="text-lg font-medium">
        About this space
      </h2>
      <p className="break-words whitespace-pre-line">{listing.description}</p>
      <dl className="grid gap-2">
        <div>
          <dt className="text-muted-foreground text-sm">Address</dt>
          <dd className="break-words">{listing.streetAddress}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Hours</dt>
          <dd>{hoursText(listing.openingHours)}</dd>
        </div>
      </dl>
      {utilities.length > 0 && (
        <ul aria-label="Utilities" className="flex flex-wrap gap-2">
          {utilities.map((u) => (
            <li key={u}>
              <Badge variant="outline">{u}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-sm">Times are in {listing.timeZone}.</p>
    </section>
  );
}

function Body({ listing, onRefetch }: { listing: Listing; onRefetch: () => void }) {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMeGet();
  // The selection: pass and slot, start date, seat. A search that carried them preselects (OQ-T29-3).
  const [initial] = useState(() =>
    parseListingParams(params, listing.offers, startDateRange(listing.timeZone)),
  );
  const [choice, setChoiceState] = useState<PassChoice | null>(initial.choice);
  const [startDate, setStartDateState] = useState(initial.startDate);
  const [seat, setSeatState] = useState<SeatSelection | null>(null);
  const [reviewing, setReviewing] = useState<BookingSelection | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [problem, setProblem] = useState<ProblemCopy | null>(null);
  const reviewButton = useRef<HTMLElement | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const passesRef = useRef<HTMLDivElement>(null);
  const seatsRef = useRef<HTMLDivElement>(null);

  // Changing an earlier piece clears the later ones and any booking problem.
  const setChoice = (c: PassChoice | null) => {
    setChoiceState(c);
    setSeatState(null);
    setProblem(null);
  };
  const setStartDate = (d: string) => {
    setStartDateState(d);
    setSeatState(null);
    setProblem(null);
  };
  const setSeat = (s: SeatSelection | null) => {
    setSeatState(s);
    if (s) setProblem(null);
  };

  // The URL mirrors pass, slot and date with replace, so the history has one entry (ui/03 4.3).
  useEffect(() => {
    const query = withListingParams(new URLSearchParams(window.location.search), choice, startDate);
    if (query !== window.location.search.slice(1)) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
    }
  }, [choice, startDate]);

  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  const refetchSeats = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/listings/${listing.id}/seats`] });

  const onBooked = (booking: Booking) => {
    setReviewing(null);
    setConfirmed(booking);
    void refetchSeats();
    void queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/api/bookings'),
    });
  };

  const onFailed = (error: unknown) => {
    const result = describeBookProblem(error, {
      spaceId: listing.id,
      seatLabel: reviewing?.selection.seat.label,
      path: window.location.pathname,
    });
    setReviewing(null);
    setProblem(result.copy);
    if (result.clearSeat) setSeatState(null);
    if (result.clearPass) {
      setChoiceState(null);
      setSeatState(null);
    }
    if (result.refetch === 'seats') void refetchSeats();
    if (result.refetch === 'listing') onRefetch();
  };

  const focusMissing = (missing: 'pass' | 'date' | 'seat') => {
    if (missing === 'date') dateRef.current?.focus();
    else {
      const root = missing === 'pass' ? passesRef.current : seatsRef.current;
      const target =
        root?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
        root?.querySelector<HTMLElement>('[role="radio"]:not([disabled])') ??
        root?.querySelector<HTMLElement>('button:not([disabled])');
      target?.focus();
    }
  };

  const validDate = isStartDateAllowed(startDate, startDateRange(listing.timeZone));
  const offer = choice ? listing.offers.find((o) => o.slot === choice.slot) : undefined;
  const started = Boolean(
    offer && validDate && slotHasStarted(startDate, offer.startTime, listing.timeZone),
  );
  return (
    <div className="grid gap-8">
      <Details listing={listing} />
      {listing.isOwnSpace ? (
        <Alert role="status">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>This is your space</AlertTitle>
          <AlertDescription>
            You can&apos;t book a seat in it. To block seats, mark them occupied.{' '}
            <Link
              href={`/owner/spaces/${listing.id}/seats` as Route}
              className="underline underline-offset-4"
            >
              Manage seats
            </Link>
          </AlertDescription>
        </Alert>
      ) : listing.offers.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-start gap-2">
            <p className="font-medium">This space isn&apos;t offering passes right now.</p>
            <p className="text-muted-foreground">Check back later or find another space.</p>
            <Button asChild>
              <Link href="/find">Find a space</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {problem && <BookProblemAlert copy={problem} ref={alertRef} />}
          {confirmed ? (
            <BookingConfirmation booking={confirmed} email={me.data?.data.email} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
              <div className="grid gap-8">
                <div ref={passesRef}>
                  <PassOptions listing={listing} value={choice} onChange={setChoice} />
                </div>
                {choice && (
                  <StartDateField
                    ref={dateRef}
                    value={startDate}
                    onChange={setStartDate}
                    timeZone={listing.timeZone}
                    note={
                      started
                        ? `${SLOT_STARTED.title}. ${SLOT_STARTED.description.map((d) => (typeof d === 'string' ? d : d.text)).join(' ')}`
                        : undefined
                    }
                  />
                )}
                <div ref={seatsRef}>
                  {choice && validDate ? (
                    <ListingSeatList
                      spaceId={listing.id}
                      hasLayout={listing.hasLayout}
                      choice={choice}
                      startDate={startDate}
                      timeZone={listing.timeZone}
                      selectedSeatId={seat?.seat.id ?? null}
                      onSelect={setSeat}
                      onPassNotOffered={onRefetch}
                    />
                  ) : (
                    <p className="text-muted-foreground">
                      Choose a pass and a start date to see which seats are free.
                    </p>
                  )}
                </div>
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start">
                <YourSelection
                  choice={choice}
                  startDate={validDate ? startDate : ''}
                  selection={seat}
                  currency={listing.currency}
                  timeZone={listing.timeZone}
                  slotText={offer ? slotTitle(offer) : null}
                  onReview={(b) => {
                    reviewButton.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    setReviewing(b);
                  }}
                  onMissing={focusMissing}
                />
              </div>
            </div>
          )}
          <ReviewDialog
            spaceId={listing.id}
            booking={reviewing}
            currency={listing.currency}
            timeZone={listing.timeZone}
            slotText={offer ? slotTitle(offer) : ''}
            onClose={() => {
              setReviewing(null);
            }}
            restoreFocus={() => reviewButton.current?.focus()}
            onBooked={onBooked}
            onFailed={onFailed}
          />
        </>
      )}
    </div>
  );
}

/** Listing page v1 (ui/03 section 4): details and pass options. Seats and booking attach in T040/T041. */
export function ListingDetails({ spaceId }: { spaceId: string }) {
  const { data, isPending, error, refetch } = useListingsGet(spaceId);
  const listing = data?.data;
  const onRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);
  // The search that led here; a link without one (or a shared deep link) just says "Find a space".
  const params = useSearchParams();
  // Captured once: the booking choice is mirrored into the URL later, and the link must return
  // to the search exactly as it came, filters included (ui/03 2.1).
  const [carried] = useState(() => (params.get('country') ? params.toString() : ''));

  const back = (
    <Button variant="link" size="sm" asChild className="justify-self-start px-0">
      <Link href={carried ? `/find?${carried}` : '/find'}>
        {carried ? (
          <>
            <ArrowLeftIcon aria-hidden="true" />
            Back to results
          </>
        ) : (
          'Find a space'
        )}
      </Link>
    </Button>
  );

  if (isPending) {
    return (
      <main id="main" aria-busy="true" className={FRAME}>
        {back}
        <h1 className="sr-only">Loading</h1>
        <span role="status" aria-live="polite" className="sr-only">
          Loading this space…
        </span>
        <div aria-hidden="true" className="grid gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </main>
    );
  }

  if (error || !listing) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return (
        <main id="main" className={`${FRAME} justify-items-start`}>
          <h1 className="text-2xl font-semibold tracking-tight">
            We couldn&apos;t find that space
          </h1>
          <p className="text-muted-foreground">It may have been unlisted.</p>
          <Button asChild>
            <Link href="/find">Find a space</Link>
          </Button>
        </main>
      );
    }
    return (
      <main id="main" className={FRAME}>
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">Space</h1>
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load this space</AlertTitle>
          <AlertDescription>
            <p>Try again in a moment.</p>
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main id="main" className={FRAME}>
      {back}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{listing.name}</h1>
        <p className="text-muted-foreground">
          {listing.area}, {listing.city}, {countryName(listing.country)}
        </p>
      </div>
      <Body listing={listing} onRefetch={onRefetch} />
    </main>
  );
}
