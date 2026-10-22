'use client';

import { useMeGet } from '@bseat/api-client';
import { Alert, AlertDescription } from '@bseat/ui/components/alert';
import { Skeleton } from '@bseat/ui/components/skeleton';

/** Greets the signed-in user. Shows loading, error and success states. */
export function Welcome() {
  const { data, isPending, error } = useMeGet();

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your profile…</span>
        <Skeleton className="h-9 w-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>We couldn&apos;t load your profile. {error.message}</AlertDescription>
      </Alert>
    );
  }

  return <h1 className="text-3xl font-semibold">Welcome, {data.data.name}</h1>;
}
