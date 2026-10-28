'use client';

import {
  type OwnerSeat,
  useOwnerSeatsDeleteSeat,
  useOwnerSeatsUpdateSeat,
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
} from '@bseat/ui/components/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button, buttonVariants } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CubicleField, type CubicleOptions, FEATURES_HINT } from '@/components/seat-fields';
import { FormField } from '@/components/space-form/form-field';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import type { ProblemCopy } from '@/lib/problem-copy';
import { describeSeatProblem } from '@/lib/seat-problems';
import { featuresError, LABEL_MAX, parseFeatures } from '@/lib/seat-values';

const schema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Enter a label')
    .max(LABEL_MAX, `Use ${LABEL_MAX} characters or fewer`),
  cubicleId: z.string(),
  features: z.string().superRefine((v, ctx) => {
    const message = featuresError(parseFeatures(v));
    if (message) ctx.addIssue({ code: 'custom', message });
  }),
});
type Values = z.infer<typeof schema>;

const editId = (id: string) => `seat-edit-${id}`;
const focusSoon = (id: string) => {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
};

function EditSeatForm({
  spaceId,
  seat,
  cubicles,
  onDone,
  onPageProblem,
}: {
  spaceId: string;
  seat: OwnerSeat;
  cubicles: CubicleOptions;
  onDone: () => void;
  onPageProblem: (copy: ProblemCopy) => void;
}) {
  const update = useOwnerSeatsUpdateSeat();
  const refresh = useSeatRefresh(spaceId);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: seat.label,
      cubicleId: seat.cubicle?.id ?? '',
      features: seat.features.join(', '),
    },
  });
  const pending = update.isPending;
  useEffect(() => {
    setFocus('label');
  }, [setFocus]);

  const onSubmit = (v: Values) => {
    update.mutate(
      {
        spaceId,
        seatId: seat.id,
        data: {
          label: v.label,
          cubicleId: v.cubicleId || null,
          features: parseFeatures(v.features),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Seat ${v.label} saved`);
          refresh();
          onDone();
        },
        onError: (error) => {
          const p = describeSeatProblem(error, 'edit seat', { label: v.label });
          if (p.field) setError('label', { type: 'server', message: p.field });
          else if (p.alert) onPageProblem(p.alert);
        },
      },
    );
  };

  return (
    <form
      noValidate
      aria-label={`Edit seat ${seat.label}`}
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="grid gap-3 p-3"
    >
      <FormField
        id={`seat-label-${seat.id}`}
        label="Label"
        hint="Up to 20 characters, for example A-12."
        error={errors.label?.message}
      >
        {(aria) => <Input {...aria} autoComplete="off" disabled={pending} {...register('label')} />}
      </FormField>
      <CubicleField
        id={`seat-cubicle-${seat.id}`}
        options={cubicles}
        disabled={pending}
        {...register('cubicleId')}
      />
      <FormField
        id={`seat-features-${seat.id}`}
        label="Features (optional)"
        hint={FEATURES_HINT}
        error={errors.features?.message}
      >
        {(aria) => (
          <Input {...aria} autoComplete="off" disabled={pending} {...register('features')} />
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button type="submit" disabled={pending} className="max-sm:min-h-11">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onDone}
          className="max-sm:min-h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface Props {
  spaceId: string;
  seats: OwnerSeat[] | undefined;
  failed: boolean;
  onRetry: () => void;
  cubicles: CubicleOptions;
  onPageProblem: (copy: ProblemCopy) => void;
  /** Seam for T048: extra per-seat content (occupancy state and actions) rendered after the details. */
  renderExtra?: (seat: OwnerSeat) => ReactNode;
}

/** ui/02 7.4: loading, error, empty and list states, with inline edit and a remove dialog. */
export function SeatList({
  spaceId,
  seats,
  failed,
  onRetry,
  cubicles,
  onPageProblem,
  renderExtra,
}: Props) {
  const refresh = useSeatRefresh(spaceId);
  const remove = useOwnerSeatsDeleteSeat();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OwnerSeat | null>(null);
  const placedFocus = useRef(false);
  const pendingFocus = useRef<{ removedId: string; target: string } | null>(null);

  // Focus moves once the refreshed list no longer has the removed row (ui/02 7.4).
  useEffect(() => {
    const p = pendingFocus.current;
    if (p && seats && !seats.some((s) => s.id === p.removedId)) {
      pendingFocus.current = null;
      focusSoon(p.target);
    }
  }, [seats]);

  const onRemove = (seat: OwnerSeat) => {
    const list = seats ?? [];
    const i = list.findIndex((s) => s.id === seat.id);
    const neighbour = list[i + 1] ?? list[i - 1];
    remove.mutate(
      { spaceId, seatId: seat.id },
      {
        onSuccess: () => {
          toast.success(`Seat ${seat.label} removed`);
          placedFocus.current = true;
          pendingFocus.current = {
            removedId: seat.id,
            target: neighbour ? editId(neighbour.id) : 'seat-label',
          };
          setRemoving(null);
          refresh();
        },
        onError: (error) => {
          placedFocus.current = true;
          setRemoving(null);
          const p = describeSeatProblem(error, 'remove seat', { label: seat.label });
          if (p.alert) onPageProblem(p.alert);
        },
      },
    );
  };

  let body: ReactNode;
  if (failed) {
    body = (
      <Alert variant="destructive" role="alert">
        <AlertTitle>We couldn&apos;t load your seats</AlertTitle>
        <AlertDescription>
          <p>Try again in a moment.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!seats) {
    body = (
      <div aria-busy="true">
        <span role="status" aria-live="polite" className="sr-only">
          Loading seats…
        </span>
        <div aria-hidden="true" className="grid gap-2">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14" />
          ))}
        </div>
      </div>
    );
  } else if (seats.length === 0) {
    body = (
      <Card>
        <CardContent className="grid gap-1">
          <p className="font-medium">No seats yet.</p>
          <p className="text-muted-foreground">
            Add seats one at a time or many at once with a label pattern. You need at least one seat
            to publish.
          </p>
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <ul aria-label="Seats" className="bg-card divide-y rounded-xl border">
        {seats.map((s) => (
          <li key={s.id}>
            {editing === s.id ? (
              <EditSeatForm
                spaceId={spaceId}
                seat={s}
                cubicles={cubicles}
                onPageProblem={onPageProblem}
                onDone={() => {
                  setEditing(null);
                  focusSoon(editId(s.id));
                }}
              />
            ) : (
              <div className="grid gap-2 p-3 sm:flex sm:items-center sm:gap-4">
                <div className="grid min-w-0 gap-0.5 sm:flex-1 sm:grid-cols-[8rem_1fr] sm:items-baseline sm:gap-4">
                  <span className="font-medium break-words">{s.label}</span>
                  <span className="text-muted-foreground text-sm break-words">
                    {[s.cubicle?.name ?? 'No cubicle', ...s.features].join(', ')}
                  </span>
                </div>
                {renderExtra?.(s)}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    id={editId(s.id)}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(s.id);
                    }}
                  >
                    Edit <span className="sr-only">seat {s.label}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRemoving(s);
                    }}
                  >
                    Remove <span className="sr-only">seat {s.label}</span>
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="seats-heading" className="grid gap-4">
      <h2 id="seats-heading" className="text-lg font-medium">
        Your seats
      </h2>
      {body}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o && !remove.isPending) setRemoving(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            if (placedFocus.current) e.preventDefault();
            placedFocus.current = false;
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove seat {removing?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be listed or bookable. Bookings that ended keep its label.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep seat</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removing) onRemove(removing);
              }}
            >
              {remove.isPending ? 'Removing…' : 'Remove seat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
