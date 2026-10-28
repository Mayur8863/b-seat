'use client';

import { ApiError, type OwnerSpaceSummary, useOwnerSpacesList } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import { MANAGE_LINKS, manageHref } from '@/components/space-manage-nav';
import { describeOwnerProblem } from '@/lib/marketplace-problems';

const STATUS: Record<
  OwnerSpaceSummary['status'],
  { text: string; variant: 'default' | 'outline' | 'secondary' }
> = {
  published: { text: 'Published', variant: 'default' },
  draft: { text: 'Draft', variant: 'outline' },
  unpublished: { text: 'Unpublished', variant: 'secondary' },
};

export const statusBadge = (status: OwnerSpaceSummary['status']) => STATUS[status];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function facts(space: OwnerSpaceSummary): string {
  const seats = space.seatCount > 0 ? plural(space.seatCount, 'seat') : 'No seats yet';
  const bookings =
    space.upcomingBookingCount > 0
      ? plural(space.upcomingBookingCount, 'upcoming booking')
      : 'No upcoming bookings';
  return `${seats} · ${bookings}`;
}

function toPublish(space: OwnerSpaceSummary): string | null {
  if (space.status === 'published') return null;
  const missing = [
    ...(space.seatCount === 0 ? ['add seats'] : []),
    ...(space.hasOfferedPass ? [] : ['price a pass']),
  ];
  return missing.length > 0 ? `To publish: ${missing.join(', ')}` : null;
}

function SpaceCard({ space }: { space: OwnerSpaceSummary }) {
  const headingId = useId();
  const badge = statusBadge(space.status);
  const missing = toPublish(space);
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={headingId} className="text-base font-medium break-words">
            {space.name}
          </h3>
          <Badge variant={badge.variant}>{badge.text}</Badge>
        </div>
        <p className="text-muted-foreground">
          {space.area}, {space.city}
        </p>
        <p className="text-muted-foreground text-sm">{facts(space)}</p>
        {missing && <p className="text-muted-foreground text-sm">{missing}</p>}
        <ul aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {MANAGE_LINKS.map(({ label, segment }) => (
            <li key={label}>
              <Button variant="outline" size="sm" asChild className="max-sm:min-h-11">
                <Link href={manageHref(space.id, segment)}>
                  {/* One wrapper: the button is a flex row, which would drop the space. */}
                  <span>
                    {label} <span className="sr-only">for {space.name}</span>
                  </span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** "My spaces" on the owner dashboard (ui/02 section 3). */
export function OwnerSpaces() {
  const { data, isPending, error, refetch } = useOwnerSpacesList();
  const spaces = data?.data.items;

  return (
    <section aria-labelledby="spaces-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="spaces-heading" className="text-lg font-medium">
          My spaces
        </h2>
        <Button asChild className="max-sm:min-h-11 max-sm:w-full">
          <Link href="/owner/spaces/new">
            <PlusIcon aria-hidden="true" />
            List a space
          </Link>
        </Button>
      </div>
      {isPending ? (
        <>
          <span role="status" aria-live="polite" className="sr-only">
            Loading your spaces…
          </span>
          <div aria-busy="true" aria-hidden="true" className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        </>
      ) : error ? (
        <ListError error={error} onRetry={() => void refetch()} />
      ) : spaces?.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <p className="font-medium">You haven&apos;t listed a space yet.</p>
            <p className="text-muted-foreground">
              Add your space&apos;s details and seats, then set pass prices to start taking
              bookings.
            </p>
            <Button asChild className="max-sm:min-h-11 max-sm:w-full">
              <Link href="/owner/spaces/new">List your first space</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {spaces?.map((space) => (
            <li key={space.id} className="grid">
              <SpaceCard space={space} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const copy = describeOwnerProblem(error, 'load your spaces');
  const keepCopy = !(error instanceof ApiError) || error.status === 401;
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {keepCopy
          ? copy.description.map((part) =>
              typeof part === 'string' ? (
                part
              ) : (
                <Link key={part.href} href={part.href} className="underline underline-offset-4">
                  {part.text}
                </Link>
              ),
            )
          : 'Try again in a moment.'}
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
