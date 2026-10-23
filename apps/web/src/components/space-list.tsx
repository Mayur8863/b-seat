'use client';

import { type Space, useSpacesList } from '@bseat/api-client';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { type ReactNode, type Ref, useId } from 'react';

import { ProblemAlert } from '@/components/problem-alert';

function Legend({ id }: { id?: string }) {
  return (
    <legend id={id} className="mb-3">
      <h2 className="text-lg font-medium">Office space</h2>
    </legend>
  );
}

interface ChoiceProps {
  spaces: Space[];
  value: string;
  onChange: (spaceId: string) => void;
  onBlur?: () => void;
  error?: string;
  ref?: Ref<HTMLDivElement>;
}

/** The "Office space" fieldset: one radio card per space. Controlled, for use inside a form. */
export function SpaceChoice({ spaces, value, onChange, onBlur, error, ref }: ChoiceProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const legendId = `${id}-legend`;
  return (
    <fieldset className="grid gap-3">
      <Legend id={legendId} />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
      <RadioGroup
        ref={ref}
        value={value}
        onValueChange={onChange}
        onBlur={onBlur}
        aria-labelledby={legendId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {spaces.map((space) => {
          const itemId = `${id}-${space.id}`;
          const nameId = `${itemId}-name`;
          const locationId = `${itemId}-location`;
          const metaId = `${itemId}-meta`;
          return (
            <Label
              key={space.id}
              htmlFor={itemId}
              className="bg-card hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-primary has-[[data-state=checked]]:bg-primary/5 has-[:focus-visible]:outline-ring flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[[data-state=checked]]:ring-1"
            >
              <RadioGroupItem
                id={itemId}
                value={space.id}
                className="mt-0.5"
                aria-labelledby={nameId}
                aria-describedby={`${locationId} ${metaId}`}
              />
              <span className="grid gap-0.5">
                <span id={nameId} className="font-medium">
                  {space.name}
                </span>
                <span id={locationId} className="text-muted-foreground text-sm font-normal">
                  {space.location}
                </span>
                <span id={metaId} className="text-muted-foreground text-xs font-normal">
                  {space.timeZone} · {space.seatCount} {space.seatCount === 1 ? 'seat' : 'seats'}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

/** Loads the spaces and renders `children` once there is at least one. Owns loading, empty and error. */
export function SpaceList({ children }: { children: (spaces: Space[]) => ReactNode }) {
  const { data, isPending, error, refetch } = useSpacesList();

  if (isPending) {
    return (
      <fieldset aria-busy="true" className="grid gap-3">
        <Legend />
        <span className="sr-only" role="status">
          Loading office spaces…
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-18 rounded-lg" />
          <Skeleton className="h-18 rounded-lg" />
        </div>
      </fieldset>
    );
  }

  // A failed background refetch keeps the form (and what the user typed) on screen.
  if (!data) {
    return (
      <section className="grid gap-3">
        <ProblemAlert
          error={error}
          action="availability"
          context={{ fallbackTitle: "We couldn't load office spaces" }}
          onRetry={() => void refetch()}
        />
      </section>
    );
  }

  const spaces = data.data.items;
  if (spaces.length === 0) {
    return (
      <section className="grid gap-3">
        <h2 className="text-lg font-medium">Office space</h2>
        <p className="text-muted-foreground">There are no office spaces to book yet.</p>
      </section>
    );
  }

  return <>{children(spaces)}</>;
}
