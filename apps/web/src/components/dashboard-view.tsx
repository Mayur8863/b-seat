'use client';

import { ApiError, useMeGet } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { CalendarIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';

function RenterBody() {
  return (
    <>
      <nav aria-label="Quick links" className="grid gap-3 sm:flex">
        <Button asChild className="max-sm:min-h-11">
          <Link href="/book">
            <SearchIcon aria-hidden="true" />
            Find a space
          </Link>
        </Button>
      </nav>
      {/* T057 fills the summary and the true empty state in this same frame. */}
      <section aria-labelledby="next-heading" className="grid gap-3">
        <h2 id="next-heading" className="text-lg font-medium">
          Next booking
        </h2>
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <CalendarIcon aria-hidden="true" className="text-muted-foreground size-5" />
            <p className="text-muted-foreground">
              Find a space and book a seat by the day, week or month.
            </p>
            <Button asChild className="max-sm:min-h-11">
              <Link href="/book">Find a space</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function OwnerBody() {
  return (
    <section aria-labelledby="spaces-heading" className="grid gap-3">
      <h2 id="spaces-heading" className="text-lg font-medium">
        My spaces
      </h2>
      {/* Slot for the spaces list (T023): loading, empty, error and cards render here. */}
      <Card>
        <CardContent>
          <p className="text-muted-foreground">Your spaces will appear here.</p>
        </CardContent>
      </Card>
    </section>
  );
}

/** Dashboard body: the h1 always shows; the rest depends on the account role. */
export function DashboardView() {
  const { data, isPending, error } = useMeGet();
  const unauthorized = error instanceof ApiError && error.status === 401;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      {isPending ? (
        <>
          <span role="status" aria-live="polite" className="sr-only">
            Loading your dashboard…
          </span>
          <div aria-busy="true" aria-hidden="true" className="grid gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        </>
      ) : unauthorized || !data ? null : (
        <>
          <p className="text-muted-foreground">Signed in as {data.data.name}</p>
          {data.data.accountType === 'owner' ? <OwnerBody /> : <RenterBody />}
        </>
      )}
    </>
  );
}
