'use client';

import {
  ApiError,
  type ListingSummary,
  listingsSearch,
  useListingsSearch,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { Loader2Icon, MapPinIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  type FindFilters,
  describeFilters,
  filtersToApiParams,
  filtersToQuery,
} from '@/lib/find-filters';
import { type PassType, formatMoney, utilityLabel } from '@/lib/format';

const MAX_BADGES = 5;
const PASS_ORDER: PassType[] = ['day', 'week', 'month'];
const NOUN: Record<PassType, string> = {
  day: 'day pass',
  week: 'weekly pass',
  month: 'monthly pass',
};

function Prices({ item }: { item: ListingSummary }) {
  const entries = PASS_ORDER.flatMap((p) => {
    const amount = item.lowestPrices[p];
    return amount ? [{ pass: p, text: formatMoney({ amount, currency: item.currency }) }] : [];
  });
  if (entries.length === 0) return null;
  return (
    <p>
      From{' '}
      {entries.map((e, i) => (
        <span key={e.pass}>
          {i > 0 && ' · '}
          <span className="font-medium">{e.text}</span> per {NOUN[e.pass]}
        </span>
      ))}
    </p>
  );
}

function ResultCard({
  item,
  query,
  linkRef,
}: {
  item: ListingSummary;
  query: string;
  linkRef?: React.Ref<HTMLAnchorElement>;
}) {
  const utilities = [...item.utilities.map(utilityLabel), ...item.customUtilities];
  return (
    <li>
      <Card className="hover:bg-muted/50 h-full p-4">
        <div className="grid gap-2">
          <h3 className="text-base font-medium">
            <Link
              ref={linkRef}
              href={`/spaces/${item.id}${query ? `?${query}` : ''}` as Route}
              className="text-primary underline-offset-4 hover:underline"
            >
              {item.name}
            </Link>
          </h3>
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <MapPinIcon aria-hidden="true" className="size-4" />
            {item.area}, {item.city}
          </p>
          {utilities.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <ul aria-label="Utilities" className="flex flex-wrap gap-2">
                {utilities.slice(0, MAX_BADGES).map((u) => (
                  <li key={u}>
                    <Badge variant="outline">{u}</Badge>
                  </li>
                ))}
              </ul>
              {utilities.length > MAX_BADGES && (
                <span className="text-muted-foreground text-sm">
                  +{utilities.length - MAX_BADGES} more
                </span>
              )}
            </div>
          )}
          <Prices item={item} />
          {item.hasLayout && (
            <div>
              <Badge variant="secondary">Floor plan</Badge>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}

function errorText(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.status === 400) {
    return { title: 'Check your search', detail: 'One of the filters is not valid.' };
  }
  return { title: "We couldn't load spaces", detail: 'Try again in a moment.' };
}

interface Props {
  filters: FindFilters;
  countryName: string;
  /** "Search all of {country}": drops city and area, keeps the rest. */
  onSearchWholeCountry: () => void;
  /** Empty-state "Clear filters": keeps the country. */
  onClearFilters: () => void;
}

/** Results for one submitted search (ui/03 3.4 and 3.6). Remount with a new `key` per search. */
export function ListingResults({
  filters,
  countryName,
  onSearchWholeCountry,
  onClearFilters,
}: Props) {
  const query = filtersToQuery(filters);
  const first = useListingsSearch(filtersToApiParams(filters), { query: { retry: false } });
  const [more, setMore] = useState<ListingSummary[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const firstNewLink = useRef<HTMLAnchorElement>(null);
  const moreAlert = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const page = first.data?.data;
  const items = [...(page?.items ?? []), ...more];
  const nextCursor = cursor === undefined ? (page?.nextCursor ?? null) : cursor;

  useEffect(() => {
    if (moreFailed) moreAlert.current?.focus();
  }, [moreFailed]);

  const showMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const res = await listingsSearch(filtersToApiParams(filters, nextCursor));
      setMore((m) => [...m, ...res.data.items]);
      setCursor(res.data.nextCursor);
      setTimeout(() => firstNewLink.current?.focus(), 0);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const where = filters.city ? `${filters.city}, ${countryName}` : countryName;
  const count = items.length;
  const status = first.isPending
    ? ''
    : nextCursor
      ? `Showing ${count} spaces`
      : `${count === 1 ? '1 space' : `${count} spaces`} in ${where}`;
  const applied = describeFilters(filters);
  const firstNewIndex = page?.items.length ?? 0;

  let body: React.ReactNode;
  if (first.isPending) {
    body = (
      <ul aria-busy="true" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((n) => (
          <li key={n} aria-hidden="true">
            <Skeleton className="h-40 rounded-xl" />
          </li>
        ))}
      </ul>
    );
  } else if (first.isError) {
    const { title, detail } = errorText(first.error);
    body = (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{detail}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void first.refetch();
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (items.length === 0) {
    const located = Boolean(filters.city || filters.area);
    const narrowed = Boolean(
      filters.startDate || filters.pass || filters.slot || filters.utilities.length,
    );
    body = (
      <Card>
        <CardContent className="grid justify-items-start gap-2">
          {!located && !narrowed ? (
            <>
              <p className="font-medium">No spaces are listed in {countryName} yet.</p>
              <p className="text-muted-foreground">Check back later, or try another country.</p>
            </>
          ) : (
            <>
              <p className="font-medium">No spaces match your search.</p>
              <p className="text-muted-foreground">
                {located
                  ? 'Try a different area, or look across the whole country.'
                  : 'Try fewer filters or a different start date.'}
              </p>
              {located ? (
                <Button onClick={onSearchWholeCountry}>Search all of {countryName}</Button>
              ) : (
                <Button variant="outline" onClick={onClearFilters}>
                  Clear filters
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <>
        <ul aria-label="Spaces" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, n) => (
            <ResultCard
              key={item.id}
              item={item}
              query={query}
              linkRef={n === firstNewIndex && more.length > 0 ? firstNewLink : undefined}
            />
          ))}
        </ul>
        {moreFailed && (
          <Alert ref={moreAlert} tabIndex={-1} variant="destructive" role="alert">
            <AlertTitle>We couldn&apos;t load more spaces</AlertTitle>
            <AlertDescription>
              <p>Try again in a moment.</p>
              <Button variant="outline" size="sm" onClick={() => void showMore()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {nextCursor && !moreFailed && (
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={loadingMore}
            onClick={() => void showMore()}
          >
            {loadingMore ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Loading…
              </>
            ) : (
              'Show more spaces'
            )}
          </Button>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="results-heading" className="grid gap-4">
      <h2 id="results-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium">
        Results
      </h2>
      <p role="status" className="text-muted-foreground">
        {first.isPending ? <span className="sr-only">Searching…</span> : status}
      </p>
      {applied && !first.isPending && <p className="text-muted-foreground text-sm">{applied}</p>}
      {body}
    </section>
  );
}
