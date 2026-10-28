'use client';

import { ApiError, useOwnerSpacesGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Skeleton } from '@bseat/ui/components/skeleton';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { statusBadge } from '@/components/owner-spaces';
import { SpaceManageNav } from '@/components/space-manage-nav';
import { describeOwnerProblem } from '@/lib/marketplace-problems';

// minmax(0,1fr) lets wide children (tab strip, plan canvas, tables) scroll inside themselves instead of widening the page.
const FRAME = 'mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-4 px-4 py-8 sm:px-6';
const PAGE = 'mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6';

/** Header, sub-nav and 404/error/loading states shared by every page of one space (ui/02 section 5). */
export function SpaceShell({ spaceId, children }: { spaceId: string; children: ReactNode }) {
  const { data, isPending, error, refetch } = useOwnerSpacesGet(spaceId);
  const space = data?.data;

  if (isPending) {
    return (
      <main id="main" aria-busy="true" className={FRAME}>
        <h1 className="sr-only">Loading</h1>
        <span role="status" aria-live="polite" className="sr-only">
          Loading space…
        </span>
        <div aria-hidden="true" className="grid gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </main>
    );
  }

  if (error || !space) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return (
        <main id="main" className={`${FRAME} justify-items-start`}>
          <h1 className="text-2xl font-semibold tracking-tight">
            We couldn&apos;t find that space
          </h1>
          <p className="text-muted-foreground">Check the address, or go back to your dashboard.</p>
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </main>
      );
    }
    const copy = describeOwnerProblem(error, 'load this space');
    return (
      <main id="main" className={FRAME}>
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t load this space</h1>
        <Alert variant="destructive" role="alert">
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

  const badge = statusBadge(space.status);
  return (
    <>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-3 px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 text-lg font-semibold break-words">{space.name}</p>
          <Badge variant={badge.variant}>{badge.text}</Badge>
        </div>
        <SpaceManageNav spaceId={spaceId} />
      </div>
      <main id="main" className={PAGE}>
        {children}
      </main>
    </>
  );
}
