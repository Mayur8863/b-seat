'use client';

import {
  getOwnerSpacesGetQueryKey,
  getOwnerSpacesListQueryKey,
  type OwnerSpace,
  useOwnerSpacesGet,
  useOwnerSpacesPublish,
  useOwnerSpacesUnpublish,
} from '@bseat/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@bseat/ui/components/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button, buttonVariants } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { useQueryClient } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { SpaceForm } from '@/components/space-form';
import { describeOwnerProblem, publishMissing } from '@/lib/marketplace-problems';

const TEXT: Record<OwnerSpace['status'], string> = {
  draft:
    "This space is a draft, so renters can't see it. Before you publish, add seats and set prices.",
  published: 'This space is published. Renters can find it in search.',
  unpublished:
    'This space is hidden from search. Existing bookings stay valid and renters can still see them.',
};

const MISSING_COPY = {
  seat: 'Add at least one seat',
  pricedPass: 'Price at least one pass',
} as const;

interface Failure {
  action: 'publish this space' | 'unpublish this space';
  error: unknown;
}

function PublishingCard({ space }: { space: OwnerSpace }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const publish = useOwnerSpacesPublish();
  const unpublish = useOwnerSpacesUnpublish();
  const pending = publish.isPending || unpublish.isPending;

  useEffect(() => {
    if (failure) alertRef.current?.focus();
  }, [failure]);

  const done = (updated: { data: OwnerSpace }, message: string) => {
    queryClient.setQueryData(getOwnerSpacesGetQueryKey(space.id), (old: unknown) =>
      old && typeof old === 'object' ? { ...old, data: updated.data } : old,
    );
    void queryClient.invalidateQueries({ queryKey: getOwnerSpacesListQueryKey() });
    setNotice(message);
  };

  const onPublish = () => {
    setFailure(null);
    setNotice(null);
    publish.mutate(
      { spaceId: space.id },
      {
        onSuccess: (res) => {
          done(res, 'Published. Renters can now find this space.');
        },
        onError: (error) => {
          setFailure({ action: 'publish this space', error });
        },
      },
    );
  };

  const onUnpublish = () => {
    setFailure(null);
    setNotice(null);
    unpublish.mutate(
      { spaceId: space.id },
      {
        onSuccess: (res) => {
          setConfirming(false);
          done(res, 'Unpublished. This space is hidden from search.');
        },
        onError: (error) => {
          setConfirming(false);
          setFailure({ action: 'unpublish this space', error });
        },
      },
    );
  };

  const missing = failure ? publishMissing(failure.error) : undefined;
  const copy = failure ? describeOwnerProblem(failure.error, failure.action) : undefined;
  const published = space.status === 'published';

  return (
    <Card>
      <CardContent>
        <section aria-labelledby="publish-heading" className="grid gap-3">
          <h2 id="publish-heading" className="text-lg font-medium">
            Publishing
          </h2>
          <p className="text-muted-foreground">{TEXT[space.status]}</p>
          {published ? (
            <AlertDialog
              open={confirming}
              onOpenChange={(o) => {
                if (!pending) setConfirming(o);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="justify-self-start max-sm:min-h-11">
                  Unpublish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unpublish this space?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It will disappear from search. Existing bookings stay valid and renters can
                    still see them.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Keep published</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: 'destructive' })}
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      onUnpublish();
                    }}
                  >
                    {unpublish.isPending ? 'Unpublishing…' : 'Unpublish'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              onClick={onPublish}
              aria-busy={publish.isPending}
              className="justify-self-start max-sm:min-h-11"
            >
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          )}
          {notice && (
            <p role="status" className="text-sm font-medium">
              {notice}
            </p>
          )}
          {failure && copy && (
            <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
              <AlertTitle>{missing ? "Add what's missing to publish" : copy.title}</AlertTitle>
              <AlertDescription>
                {missing ? (
                  <>
                    <p>To publish this space you still need to:</p>
                    <ul className="list-disc pl-5">
                      {missing.map((m) => (
                        <li key={m}>{MISSING_COPY[m]}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  copy.description.map((part) =>
                    typeof part === 'string' ? (
                      part
                    ) : (
                      <Link
                        key={part.href}
                        href={part.href as Route}
                        className="underline underline-offset-4"
                      >
                        {part.text}
                      </Link>
                    ),
                  )
                )}
              </AlertDescription>
            </Alert>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/** Details page: publishing card, then the edit form (ui/02 section 6). The layout owns 404 and loading. */
export function SpaceDetails({ spaceId }: { spaceId: string }) {
  const { data, error, refetch } = useOwnerSpacesGet(spaceId);
  const space = data?.data;
  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Details</h1>
      {space ? (
        <>
          <PublishingCard space={space} />
          <SpaceForm mode="edit" space={space} />
        </>
      ) : error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load this space</AlertTitle>
          <AlertDescription>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <p role="status" className="text-muted-foreground">
          Loading details…
        </p>
      )}
    </main>
  );
}
