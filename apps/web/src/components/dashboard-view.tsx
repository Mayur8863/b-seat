'use client';

import {
  ApiError,
  getMeGetQueryKey,
  type MeGetQueryResult,
  useMeGet,
  useReferenceGet,
} from '@bseat/api-client';
import type { Preferences } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { PreferencesForm } from '@/components/preferences-form';

const NO_PREFERENCES: Preferences = { country: null, city: null, area: null };

function PreferencesCard({ preferences }: { preferences: Preferences }) {
  const queryClient = useQueryClient();
  const reference = useReferenceGet();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const isEmpty = !preferences.country && !preferences.city && !preferences.area;

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const close = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const countryName = preferences.country
    ? (reference.data?.data.countries.find((c) => c.code === preferences.country)?.name ??
      preferences.country)
    : null;

  return (
    <section aria-labelledby="preferences-heading" className="grid content-start gap-3">
      <h2 id="preferences-heading" className="text-lg font-medium">
        Your preferences
      </h2>
      <Card>
        <CardContent className="grid gap-4">
          {editing ? (
            <PreferencesForm
              variant="edit"
              initial={preferences}
              onDismiss={close}
              onSaved={(_outcome, saved) => {
                // Write the response first so the old values do not flash while refetching.
                if (saved) {
                  queryClient.setQueryData<MeGetQueryResult>(getMeGetQueryKey(), (old) =>
                    old ? { ...old, data: { ...old.data, preferences: saved } } : old,
                  );
                }
                void queryClient.invalidateQueries({ queryKey: getMeGetQueryKey() });
                toast.success('Preferences saved');
                close();
              }}
            />
          ) : (
            <>
              {isEmpty ? (
                <p className="text-muted-foreground">
                  You haven&apos;t set a preferred location. Search starts empty.
                </p>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Country</dt>
                  <dd>
                    {preferences.country && reference.isPending ? (
                      <Skeleton className="h-4 w-24" />
                    ) : (
                      (countryName ?? 'Any')
                    )}
                  </dd>
                  <dt className="text-muted-foreground">City</dt>
                  <dd>{preferences.city ?? 'Any'}</dd>
                  <dt className="text-muted-foreground">Area</dt>
                  <dd>{preferences.area ?? 'Any'}</dd>
                </dl>
              )}
              <Button
                ref={editButton}
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {isEmpty ? 'Add preferences' : 'Edit preferences'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function RenterBody({ preferences }: { preferences: Preferences | null }) {
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
      <div className="grid gap-6 md:grid-cols-2">
        {/* T057 fills the summary and the true empty state in this same frame. */}
        <section aria-labelledby="next-heading" className="grid content-start gap-3">
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
        <PreferencesCard preferences={preferences ?? NO_PREFERENCES} />
      </div>
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
          {data.data.accountType === 'owner' ? (
            <OwnerBody />
          ) : (
            <RenterBody preferences={data.data.preferences} />
          )}
        </>
      )}
    </>
  );
}
