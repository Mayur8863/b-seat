'use client';

import {
  type Cubicle,
  useOwnerSeatsCreateCubicle,
  useOwnerSeatsDeleteCubicle,
  useOwnerSeatsRenameCubicle,
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
import { Input } from '@bseat/ui/components/input';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField } from '@/components/space-form/form-field';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import type { ProblemCopy } from '@/lib/problem-copy';
import { describeSeatProblem } from '@/lib/seat-problems';
import { seatCountText } from '@/lib/seat-values';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Use 100 characters or fewer'),
});
type Values = z.infer<typeof schema>;

interface Props {
  spaceId: string;
  cubicles: Cubicle[] | undefined;
  failed: boolean;
  onRetry: () => void;
  onPageProblem: (copy: ProblemCopy) => void;
}

function NameForm({
  id,
  label,
  defaultValue,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  focusOnMount,
}: {
  id: string;
  label: string;
  defaultValue: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string, setFieldError: (message: string) => void) => void;
  onCancel?: () => void;
  focusOnMount?: boolean;
}) {
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: defaultValue } });
  useEffect(() => {
    if (focusOnMount) setFocus('name');
  }, [focusOnMount, setFocus]);
  return (
    <form
      noValidate
      onSubmit={(e) =>
        void handleSubmit((v) => {
          onSubmit(v.name, (message) => {
            setError('name', { type: 'server', message });
          });
        })(e)
      }
      className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <FormField
        id={id}
        label={label}
        hint={defaultValue ? undefined : 'Groups seats, for example Bay 1.'}
        error={errors.name?.message}
      >
        {(aria) => <Input {...aria} autoComplete="off" disabled={pending} {...register('name')} />}
      </FormField>
      <Button type="submit" disabled={pending} className="max-sm:min-h-11">
        {pending ? 'Saving…' : submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} className="max-sm:min-h-11">
          Cancel
        </Button>
      )}
    </form>
  );
}

/** ui/02 7.3. Removing a cubicle removes its seats, so it always goes through a dialog. */
export function CubicleSection({ spaceId, cubicles, failed, onRetry, onPageProblem }: Props) {
  const refresh = useSeatRefresh(spaceId);
  const create = useOwnerSeatsCreateCubicle();
  const rename = useOwnerSeatsRenameCubicle();
  const remove = useOwnerSeatsDeleteCubicle();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Cubicle | null>(null);
  const [addKey, setAddKey] = useState(0);
  // After a removal the trigger is gone, so focus is placed by hand instead of restored.
  const placedFocus = useRef(false);

  const onAdd = (name: string, setFieldError: (m: string) => void) => {
    create.mutate(
      { spaceId, data: { name } },
      {
        onSuccess: () => {
          toast.success(`Cubicle ${name} added`);
          refresh();
          setAddKey((k) => k + 1);
          requestAnimationFrame(() => document.getElementById('cubicle-name')?.focus());
        },
        onError: (error) => {
          const p = describeSeatProblem(error, 'add cubicle', { name });
          if (p.field) setFieldError(p.field);
          else if (p.alert) onPageProblem(p.alert);
        },
      },
    );
  };

  const onRename = (c: Cubicle, name: string, setFieldError: (m: string) => void) => {
    rename.mutate(
      { spaceId, cubicleId: c.id, data: { name } },
      {
        onSuccess: () => {
          toast.success(`Cubicle ${name} saved`);
          refresh();
          setEditing(null);
          requestAnimationFrame(() => document.getElementById(`cubicle-edit-${c.id}`)?.focus());
        },
        onError: (error) => {
          const p = describeSeatProblem(error, 'rename cubicle', { name });
          if (p.field) setFieldError(p.field);
          else if (p.alert) onPageProblem(p.alert);
        },
      },
    );
  };

  const onRemove = (c: Cubicle) => {
    remove.mutate(
      { spaceId, cubicleId: c.id },
      {
        onSuccess: () => {
          toast.success(`Cubicle ${c.name} removed`);
          refresh();
          placedFocus.current = true;
          setRemoving(null);
          requestAnimationFrame(() => document.getElementById('cubicle-name')?.focus());
        },
        onError: (error) => {
          placedFocus.current = true;
          setRemoving(null);
          const p = describeSeatProblem(error, 'remove cubicle', { name: c.name });
          if (p.alert) onPageProblem(p.alert);
        },
      },
    );
  };

  return (
    <section aria-labelledby="cubicles-heading" className="grid gap-4">
      <h2 id="cubicles-heading" className="text-lg font-medium">
        Cubicles
      </h2>
      <NameForm
        key={addKey}
        id="cubicle-name"
        label="Cubicle name"
        defaultValue=""
        submitLabel="Add cubicle"
        pending={create.isPending}
        onSubmit={onAdd}
      />
      {failed ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load your cubicles</AlertTitle>
          <AlertDescription>
            <p>Try again in a moment.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : !cubicles ? (
        <div aria-busy="true">
          <span role="status" aria-live="polite" className="sr-only">
            Loading cubicles…
          </span>
          <div aria-hidden="true" className="grid gap-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        </div>
      ) : cubicles.length === 0 ? (
        <p className="text-muted-foreground">
          No cubicles yet. Use cubicles to group seats, for example Bay 1.
        </p>
      ) : (
        <ul aria-label="Cubicles" className="bg-card divide-y rounded-xl border">
          {cubicles.map((c) => (
            <li key={c.id} className="grid gap-2 p-3 sm:flex sm:items-center sm:gap-3">
              {editing === c.id ? (
                <div className="flex-1">
                  <NameForm
                    id={`cubicle-rename-${c.id}`}
                    label="Cubicle name"
                    defaultValue={c.name}
                    submitLabel="Save"
                    pending={rename.isPending}
                    focusOnMount
                    onSubmit={(name, setErr) => {
                      onRename(c, name, setErr);
                    }}
                    onCancel={() => {
                      setEditing(null);
                      requestAnimationFrame(() =>
                        document.getElementById(`cubicle-edit-${c.id}`)?.focus(),
                      );
                    }}
                  />
                </div>
              ) : (
                <>
                  <span className="font-medium break-words sm:flex-1">{c.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {seatCountText(c.seatCount)}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      id={`cubicle-edit-${c.id}`}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(c.id);
                      }}
                    >
                      Rename <span className="sr-only">cubicle {c.name}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRemoving(c);
                      }}
                    >
                      Remove <span className="sr-only">cubicle {c.name}</span>
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
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
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && removing.seatCount > 0
                ? `This removes the cubicle and its ${removing.seatCount} ${removing.seatCount === 1 ? 'seat' : 'seats'} together. Bookings that ended keep the seat and cubicle names. You can't remove it while any of its seats has upcoming bookings.`
                : 'This removes the cubicle.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep cubicle</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removing) onRemove(removing);
              }}
            >
              {remove.isPending ? 'Removing…' : 'Remove cubicle'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
