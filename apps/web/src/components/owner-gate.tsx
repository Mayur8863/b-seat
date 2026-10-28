'use client';

import { ApiError, useMeGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Skeleton } from '@bseat/ui/components/skeleton';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { describeOwnerProblem } from '@/lib/marketplace-problems';

function GateMessage({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto grid max-w-2xl gap-4 px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </main>
  );
}

/** UX gate for /owner pages (FR-004). The API still enforces the role on every request. */
export function OwnerGate({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = useMeGet();
  const pathname = usePathname();

  if (isPending) {
    return (
      <GateMessage>
        <span role="status" aria-live="polite" className="sr-only">
          Loading…
        </span>
        <div aria-busy="true" aria-hidden="true" className="grid gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </GateMessage>
    );
  }

  if (data?.data.accountType === 'owner') return <>{children}</>;

  if (error instanceof ApiError && error.status === 401) {
    const copy = describeOwnerProblem(error, 'load this space', pathname);
    return (
      <GateMessage>
        <Alert>
          <AlertTitle>{copy.title}</AlertTitle>
          <AlertDescription>
            {copy.description.map((part) =>
              typeof part === 'string' ? (
                part
              ) : (
                <Link key={part.href} href={part.href} className="underline underline-offset-4">
                  {part.text}
                </Link>
              ),
            )}
          </AlertDescription>
        </Alert>
      </GateMessage>
    );
  }

  if (data) {
    return (
      <GateMessage>
        <h1 className="text-2xl font-semibold tracking-tight">Owners only</h1>
        <Alert>
          <AlertTitle>This area is for space owners</AlertTitle>
          <AlertDescription>Your account can find and book spaces.</AlertDescription>
        </Alert>
        <Button asChild className="w-fit">
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
      </GateMessage>
    );
  }

  return (
    <GateMessage>
      <Alert variant="destructive" role="alert">
        <AlertTitle>We couldn&apos;t check your account</AlertTitle>
        <AlertDescription>Try again in a moment.</AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => {
          void refetch();
        }}
      >
        Try again
      </Button>
    </GateMessage>
  );
}
