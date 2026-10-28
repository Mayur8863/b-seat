'use client';

import { ApiError, type Listing, useListingsGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { ArrowLeftIcon, InfoIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ListingSeatList, type SeatSelection } from '@/components/listing-seat-list';
import { type PassChoice, PassOptions } from '@/components/pass-options';
import { StartDateField } from '@/components/start-date-field';
import { YourSelection } from '@/components/your-selection';
import { slotTitle, utilityLabel } from '@/lib/format';
import { isStartDateAllowed, startDateRange } from '@/lib/seat-picker';

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
  // The selection T041 books: pass and slot, start date, seat. Changing any earlier piece clears the later ones.
  const [choice, setChoiceState] = useState<PassChoice | null>(null);
  const [startDate, setStartDateState] = useState('');
  const [seat, setSeat] = useState<SeatSelection | null>(null);
  const setChoice = (c: PassChoice) => {
    setChoiceState(c);
    setSeat(null);
  };
  const setStartDate = (d: string) => {
    setStartDateState(d);
    setSeat(null);
  };
  const validDate = isStartDateAllowed(startDate, startDateRange(listing.timeZone));
  const offer = choice ? listing.offers.find((o) => o.slot === choice.slot) : undefined;
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
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="grid gap-8">
            <PassOptions listing={listing} value={choice} onChange={setChoice} />
            {choice && (
              <StartDateField
                value={startDate}
                onChange={setStartDate}
                timeZone={listing.timeZone}
              />
            )}
            {choice && validDate ? (
              <ListingSeatList
                spaceId={listing.id}
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
          <div className="lg:sticky lg:top-4 lg:self-start">
            <YourSelection
              choice={choice}
              startDate={validDate ? startDate : ''}
              selection={seat}
              currency={listing.currency}
              timeZone={listing.timeZone}
              slotText={offer ? slotTitle(offer) : null}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Listing page v1 (ui/03 section 4): details and pass options. Seats and booking attach in T040/T041. */
export function ListingDetails({ spaceId }: { spaceId: string }) {
  const { data, isPending, error, refetch } = useListingsGet(spaceId);
  const listing = data?.data;
  // The search that led here; a link without one (or a shared deep link) just says "Find a space".
  const params = useSearchParams();
  const carried = params.get('country') ? params.toString() : '';

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
    if (error instanceof ApiError && error.status === 404) {
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
      <Body listing={listing} onRefetch={() => void refetch()} />
    </main>
  );
}
