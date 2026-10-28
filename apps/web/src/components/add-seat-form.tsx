'use client';

import { useOwnerSeatsCreateSeats } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { toast } from '@bseat/ui/components/sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CubicleField, type CubicleOptions, FEATURES_HINT } from '@/components/seat-fields';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import { FormField } from '@/components/space-form/form-field';
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

interface Props {
  spaceId: string;
  seatCount: number;
  cubicles: CubicleOptions;
}

/** ui/02 7.1. The Label field has a stable id so removing the last seat can send focus here. */
export function AddSeatForm({ spaceId, seatCount, cubicles }: Props) {
  const create = useOwnerSeatsCreateSeats();
  const refresh = useSeatRefresh(spaceId);
  const [alert, setAlert] = useState<ReturnType<typeof describeSeatProblem>['alert']>();
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    resetField,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', cubicleId: '', features: '' },
  });

  const onSubmit = (v: Values) => {
    setAlert(undefined);
    const features = parseFeatures(v.features);
    const text = v.label;
    create.mutate(
      {
        spaceId,
        data: {
          seats: [
            {
              label: text,
              ...(v.cubicleId ? { cubicleId: v.cubicleId } : {}),
              ...(features.length ? { features } : {}),
            },
          ],
        },
      },
      {
        onSuccess: () => {
          toast.success(`Seat ${text} added`);
          refresh();
          resetField('label');
          setFocus('label');
        },
        onError: (error) => {
          const p = describeSeatProblem(error, 'add one', { label: text, current: seatCount });
          if (p.field) setError('label', { type: 'server', message: p.field });
          setAlert(p.alert);
        },
      },
    );
  };

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="grid gap-4"
          aria-labelledby="add-one-heading"
        >
          <h3 id="add-one-heading" className="font-medium">
            Add one seat
          </h3>
          <FormField
            id="seat-label"
            label="Label"
            hint="Up to 20 characters, for example A-12."
            error={errors.label?.message}
          >
            {(aria) => (
              <Input
                {...aria}
                {...register('label')}
                autoComplete="off"
                disabled={create.isPending}
              />
            )}
          </FormField>
          <CubicleField
            id="seat-cubicle"
            options={cubicles}
            disabled={create.isPending}
            {...register('cubicleId')}
          />
          <FormField
            id="seat-features"
            label="Features (optional)"
            hint={FEATURES_HINT}
            error={errors.features?.message}
          >
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                disabled={create.isPending}
                {...register('features')}
              />
            )}
          </FormField>
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
            disabled={create.isPending}
            aria-busy={create.isPending}
            className="justify-self-start max-sm:min-h-11 max-sm:w-full"
          >
            {create.isPending ? 'Adding…' : 'Add seat'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
