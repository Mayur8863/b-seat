'use client';

import {
  ApiError,
  getOwnerSpacesGetPricingQueryKey,
  getOwnerSpacesGetQueryKey,
  getOwnerSpacesListQueryKey,
  type SpacePricing,
  type UpdatePricingInput,
  useOwnerSpacesGet,
  useOwnerSpacesGetPricing,
  useOwnerSpacesUpdatePricing,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Checkbox } from '@bseat/ui/components/checkbox';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormField } from '@/components/space-form/form-field';
import { formatMoney } from '@/lib/format';
import { describeOwnerProblem } from '@/lib/marketplace-problems';
import { derivedTimes, moneyError, type PassKind, type SlotKind } from '@/lib/pricing-values';

const PASSES: readonly { key: PassKind; label: string; sub: string }[] = [
  { key: 'day', label: 'Day pass', sub: '1 day' },
  { key: 'week', label: 'Weekly pass', sub: '7 days in a row' },
  { key: 'month', label: 'Monthly pass', sub: '30 days in a row' },
];
const SLOT_NAMES: Record<SlotKind, string> = {
  day: 'Day',
  night: 'Night',
  full_day: '24-hour',
  working_hours: 'Working hours',
};

const makeSchema = (alwaysOpen: boolean) =>
  z
    .object({
      shiftChangeAt: z.string(),
      slots: z.array(
        z.object({
          slot: z.enum(['day', 'night', 'full_day', 'working_hours']),
          enabled: z.boolean(),
          day: z.string(),
          week: z.string(),
          month: z.string(),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      if (alwaysOpen) {
        if (!v.shiftChangeAt) {
          ctx.addIssue({
            code: 'custom',
            path: ['shiftChangeAt'],
            message: 'Enter a shift change time',
          });
        } else if (!derivedTimes(v.shiftChangeAt)) {
          ctx.addIssue({
            code: 'custom',
            path: ['shiftChangeAt'],
            message: 'Use a time from 00:00 to 11:59',
          });
        }
      }
      v.slots.forEach((s, i) => {
        for (const { key } of PASSES) {
          const message = moneyError(s[key]);
          if (message) ctx.addIssue({ code: 'custom', path: ['slots', i, key], message });
        }
      });
    });

type Values = z.infer<ReturnType<typeof makeSchema>>;

const toValues = (p: SpacePricing): Values => ({
  shiftChangeAt: p.openingHours.mode === 'always_open' ? p.openingHours.shiftChangeAt : '',
  slots: p.slots.map((s) => ({
    slot: s.slot,
    enabled: s.enabled,
    day: s.prices.day ?? '',
    week: s.prices.week ?? '',
    month: s.prices.month ?? '',
  })),
});

const price = (v: string) => (v.trim() === '' ? null : v.trim());

const toInput = (v: Values, alwaysOpen: boolean): UpdatePricingInput => ({
  ...(alwaysOpen ? { shiftChangeAt: v.shiftChangeAt } : {}),
  slots: v.slots.map((s) => ({
    slot: s.slot,
    enabled: s.enabled,
    prices: { day: price(s.day), week: price(s.week), month: price(s.month) },
  })),
});

const currencyName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const timeText = (start: string, end: string, nextDay: boolean) =>
  `${start} to ${end}${nextDay ? ' next day' : ''}`;

/** A new hours mode or currency means different slots and prices, so the form starts again from the server. */
const formKey = (p: SpacePricing) =>
  `${p.openingHours.mode}|${p.currency}|${p.slots.map((s) => s.slot).join(',')}`;

interface FormProps {
  spaceId: string;
  pricing: SpacePricing;
  timeZone: string;
}

function Form({ spaceId, pricing, timeZone }: FormProps) {
  const queryClient = useQueryClient();
  const update = useOwnerSpacesUpdatePricing();
  const alwaysOpen = pricing.openingHours.mode === 'always_open';
  const [serverSlots, setServerSlots] = useState(pricing.slots);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [slotsError, setSlotsError] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);
  const schema = useMemo(() => makeSchema(alwaysOpen), [alwaysOpen]);
  const currency = pricing.currency;
  const detailsHref = `/owner/spaces/${spaceId}` as Route;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(pricing) });

  useEffect(() => {
    if (failure) alertRef.current?.focus();
  }, [failure]);

  const values = useWatch({ control }) as Values;
  // The status disappears on the next change: it only shows while the form still equals what was saved.
  const saved = savedSnapshot === JSON.stringify(values);
  const derived = alwaysOpen ? derivedTimes(values.shiftChangeAt) : undefined;

  const onSubmit = (v: Values) => {
    setFailure(null);
    setSlotsError(undefined);
    update.mutate(
      { spaceId, data: toInput(v, alwaysOpen) },
      {
        onSuccess: (res) => {
          const next = res.data;
          queryClient.setQueryData(getOwnerSpacesGetPricingQueryKey(spaceId), res);
          void queryClient.invalidateQueries({ queryKey: getOwnerSpacesGetQueryKey(spaceId) });
          void queryClient.invalidateQueries({ queryKey: getOwnerSpacesListQueryKey() });
          setServerSlots(next.slots);
          reset(toValues(next));
          setSavedSnapshot(JSON.stringify(toValues(next)));
        },
        onError: (error) => {
          const items =
            error instanceof ApiError && error.status === 400 ? error.problem?.errors : undefined;
          let unmapped = !items?.length;
          for (const item of items ?? []) {
            const m = /^slots\.(\d+)\.prices\.(day|week|month)$/.exec(item.path);
            if (m) {
              setError(`slots.${m[1] ?? 0}.${m[2] ?? 'day'}` as `slots.${number}.day`, {
                type: 'server',
                message: 'Enter an amount like 1500 or 1500.50',
              });
            } else if (item.path === 'shiftChangeAt') {
              setError('shiftChangeAt', { type: 'server', message: item.message });
            } else if (item.path === 'slots') {
              setSlotsError(item.message);
            } else {
              unmapped = true;
            }
          }
          if (unmapped) setFailure(error);
        },
      },
    );
  };

  const busy = update.isPending;
  const copy = failure ? describeOwnerProblem(failure, 'save your space') : undefined;
  const slotErrors = errors.slots;

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <p className="text-muted-foreground">
        Times are in {timeZone}. Prices are in {currencyName(currency)} ({currency}). Change the
        currency under{' '}
        <Link href={detailsHref} className="underline underline-offset-4">
          Details
        </Link>
        .
      </p>

      {alwaysOpen ? (
        <FormField
          id="shiftChangeAt"
          label="Shift change time"
          className="max-w-xs"
          hint="The day slot starts at this time and runs for 12 hours. The night slot runs for the next 12. The 24-hour slot runs from this time to the same time the next day."
          error={errors.shiftChangeAt?.message}
        >
          {(aria) => (
            <Input
              {...aria}
              type="time"
              min="00:00"
              max="11:59"
              disabled={busy}
              {...register('shiftChangeAt')}
            />
          )}
        </FormField>
      ) : (
        <p className="text-muted-foreground">
          Your space has fixed working hours, so it has one slot. Change the hours under{' '}
          <Link href={detailsHref} className="underline underline-offset-4">
            Details
          </Link>
          .
        </p>
      )}

      <p id="pricing-hint" className="text-muted-foreground text-sm">
        Leave a price empty if you don&apos;t offer that pass.
      </p>

      {slotsError && (
        <p id="slots-error" role="alert" className="text-destructive text-sm">
          {slotsError}
        </p>
      )}

      {values.slots.map((s, i) => {
        const server = serverSlots[i];
        const d = alwaysOpen
          ? s.slot === 'day' || s.slot === 'night' || s.slot === 'full_day'
            ? derived?.[s.slot]
            : undefined
          : server && { start: server.startTime, end: server.endTime, nextDay: server.endsNextDay };
        const off = alwaysOpen && !s.enabled;
        return (
          <fieldset key={s.slot} className="bg-card grid gap-3 rounded-xl border p-4">
            <legend className={`px-1 font-medium ${off ? 'text-muted-foreground' : ''}`}>
              {SLOT_NAMES[s.slot]}
            </legend>
            <p className="text-muted-foreground text-sm">
              {d ? timeText(d.start, d.end, d.nextDay) : '–'}
            </p>
            {alwaysOpen ? (
              <Controller
                control={control}
                name={`slots.${i}.enabled`}
                render={({ field }) => (
                  <div className="hover:bg-muted/50 flex items-center gap-2 rounded-md py-1">
                    <Checkbox
                      id={`${s.slot}-enabled`}
                      checked={field.value}
                      disabled={busy}
                      onCheckedChange={(c) => {
                        field.onChange(c === true);
                      }}
                    />
                    <Label htmlFor={`${s.slot}-enabled`}>Offer this slot</Label>
                  </div>
                )}
              />
            ) : (
              <p className="text-sm">This is your only slot, so it is always offered.</p>
            )}
            {off && (
              <p className="text-muted-foreground text-sm">
                Off. Renters can&apos;t book this slot. Its prices are kept for when you turn it
                back on.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {PASSES.map(({ key, label, sub }) => {
                const f = `${s.slot}-${key}`;
                const error = slotErrors?.[i]?.[key]?.message;
                const raw = s[key].trim();
                const preview = raw !== '' && !moneyError(raw);
                const describedBy = [
                  'pricing-hint',
                  slotsError ? 'slots-error' : undefined,
                  preview ? `${f}-preview` : undefined,
                  error ? `${f}-error` : undefined,
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={key} className="grid content-start gap-2">
                    <Label htmlFor={f}>
                      {label}
                      <span className="sr-only"> price in {currency}</span>
                    </Label>
                    <span className="text-muted-foreground -mt-1 text-sm">{sub}</span>
                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
                      >
                        {currency}
                      </span>
                      <Input
                        id={f}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Not offered"
                        style={{ paddingLeft: `${currency.length * 0.8 + 1.5}rem` }}
                        disabled={busy}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy}
                        {...register(`slots.${i}.${key}`)}
                      />
                    </div>
                    {preview && (
                      <p id={`${f}-preview`} className="text-muted-foreground text-sm">
                        Shows as {formatMoney({ amount: raw, currency })}
                      </p>
                    )}
                    {error && (
                      <p id={`${f}-error`} className="text-destructive text-sm">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {failure !== null && copy && (
        <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
          <AlertTitle>We couldn&apos;t save your prices</AlertTitle>
          <AlertDescription>
            {copy.description.map((p) => (typeof p === 'string' ? p : p.text))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="max-sm:min-h-11 max-sm:w-full"
        >
          {busy ? 'Saving…' : 'Save prices'}
        </Button>
        {saved && (
          <p role="status" className="flex items-center gap-1 text-sm font-medium">
            <CircleCheckIcon aria-hidden="true" className="size-4" />
            Prices saved
          </p>
        )}
      </div>
    </form>
  );
}

/** Passes and prices page body (ui/02 section 8). The layout owns the space's 404 and loading. */
export function PricingForm({ spaceId }: { spaceId: string }) {
  const space = useOwnerSpacesGet(spaceId);
  const query = useOwnerSpacesGetPricing(spaceId);
  const pricing = query.data?.data;
  const timeZone = space.data?.data.timeZone;
  const empty =
    pricing?.slots.every(
      (s) => s.prices.day === null && s.prices.week === null && s.prices.month === null,
    ) ?? false;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Passes and prices</h1>
      <p className="text-muted-foreground">
        Choose which slots you offer and set a price for each pass. Renters pay you directly,
        outside BSeat.
      </p>
      {query.error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load prices</AlertTitle>
          <AlertDescription>
            <p>Try again in a moment.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : pricing && timeZone ? (
        <>
          {empty && (
            <p className="text-muted-foreground">
              You haven&apos;t set any prices yet. Set at least one to publish this space.
            </p>
          )}
          <Form key={formKey(pricing)} spaceId={spaceId} pricing={pricing} timeZone={timeZone} />
        </>
      ) : (
        <div aria-busy="true">
          <span role="status" aria-live="polite" className="sr-only">
            Loading prices…
          </span>
          <div aria-hidden="true" className="grid gap-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
