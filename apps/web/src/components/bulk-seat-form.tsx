'use client';

import { useOwnerSeatsCreateSeats } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { toast } from '@bseat/ui/components/sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { CubicleField, type CubicleOptions, FEATURES_HINT } from '@/components/seat-fields';
import { FormField } from '@/components/space-form/form-field';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import { describeSeatProblem } from '@/lib/seat-problems';
import {
  featuresError,
  type PatternFields,
  patternErrors,
  patternPreview,
  parseFeatures,
} from '@/lib/seat-values';

const makeSchema = (current: number) =>
  z
    .object({
      prefix: z.string(),
      from: z.string(),
      to: z.string(),
      padTo: z.string(),
      cubicleId: z.string(),
      features: z.string(),
    })
    .superRefine((v, ctx) => {
      const errors = patternErrors(v, current);
      for (const path of ['prefix', 'from', 'to', 'padTo'] as const) {
        const message = errors[path];
        if (message) ctx.addIssue({ code: 'custom', path: [path], message });
      }
      const featureMessage = featuresError(parseFeatures(v.features));
      if (featureMessage)
        ctx.addIssue({ code: 'custom', path: ['features'], message: featureMessage });
    });
type Values = z.infer<ReturnType<typeof makeSchema>>;

const EMPTY: Values = { prefix: '', from: '', to: '', padTo: '', cubicleId: '', features: '' };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return v;
}

interface Props {
  spaceId: string;
  seatCount: number;
  cubicles: CubicleOptions;
}

/** ui/02 7.2. The preview plus the count-labelled button is the confirm step (OQ-C). */
export function BulkSeatForm({ spaceId, seatCount, cubicles }: Props) {
  const create = useOwnerSeatsCreateSeats();
  const refresh = useSeatRefresh(spaceId);
  const schema = useMemo(() => makeSchema(seatCount), [seatCount]);
  const [alert, setAlert] = useState<ReturnType<typeof describeSeatProblem>['alert']>();
  const {
    control,
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: EMPTY });

  const values = useWatch({ control });
  const fields: PatternFields = {
    prefix: values.prefix ?? '',
    from: values.from ?? '',
    to: values.to ?? '',
    padTo: values.padTo ?? '',
  };
  const preview = patternPreview(fields, seatCount);
  const announced = useDebounced(preview.ok ? preview.text : '', 400);
  const pending = create.isPending;

  const onSubmit = (v: Values) => {
    const p = patternPreview(v, seatCount);
    if (!p.ok) return;
    setAlert(undefined);
    const features = parseFeatures(v.features);
    create.mutate(
      {
        spaceId,
        data: {
          pattern: p.input,
          ...(v.cubicleId ? { cubicleId: v.cubicleId } : {}),
          ...(features.length ? { features } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(`${p.count} seats added`, { description: `${p.first} to ${p.last}` });
          refresh();
          reset(EMPTY);
          setFocus('prefix');
        },
        onError: (error) => {
          setAlert(describeSeatProblem(error, 'add many', { current: seatCount }).alert);
        },
      },
    );
  };

  const hints = {
    prefix: 'The text before each number, for example A-.',
    from: 'The first number, for example 1.',
    to: 'The last number, for example 20.',
    padTo: 'Digits to pad with zeros: 2 turns 1 into 01. Leave empty for none.',
  };
  const numeric = { inputMode: 'numeric', autoComplete: 'off', disabled: pending } as const;

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="grid gap-4"
          aria-labelledby="add-many-heading"
        >
          <h3 id="add-many-heading" className="font-medium">
            Add many seats
          </h3>
          <FormField
            id="bulk-prefix"
            label="Label prefix"
            hint={hints.prefix}
            error={errors.prefix?.message}
          >
            {(aria) => (
              <Input {...aria} autoComplete="off" disabled={pending} {...register('prefix')} />
            )}
          </FormField>
          <FormField
            id="bulk-from"
            label="From number"
            hint={hints.from}
            error={errors.from?.message}
          >
            {(aria) => <Input {...aria} {...numeric} {...register('from')} />}
          </FormField>
          <FormField id="bulk-to" label="To number" hint={hints.to} error={errors.to?.message}>
            {(aria) => <Input {...aria} {...numeric} {...register('to')} />}
          </FormField>
          <FormField
            id="bulk-pad"
            label="Pad numbers to (optional)"
            hint={hints.padTo}
            error={errors.padTo?.message}
          >
            {(aria) => <Input {...aria} {...numeric} {...register('padTo')} />}
          </FormField>
          <CubicleField
            id="bulk-cubicle"
            options={cubicles}
            disabled={pending}
            {...register('cubicleId')}
          />
          <FormField
            id="bulk-features"
            label="Features (optional)"
            hint={FEATURES_HINT}
            error={errors.features?.message}
          >
            {(aria) => (
              <Input {...aria} autoComplete="off" disabled={pending} {...register('features')} />
            )}
          </FormField>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-muted-foreground text-sm"
          >
            {announced}
          </p>
          {alert && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>
                {alert.description.map((p) => (typeof p === 'string' ? p : p.text))}
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="justify-self-start max-sm:min-h-11 max-sm:w-full"
          >
            {pending
              ? 'Adding…'
              : preview.ok
                ? `Add ${preview.count} ${preview.count === 1 ? 'seat' : 'seats'}`
                : 'Add seats'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
