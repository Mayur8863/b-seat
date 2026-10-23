'use client';

import type { Space } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@bseat/ui/components/native-select';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { SpaceChoice } from '@/components/space-list';
import { timeSlots, tomorrow } from '@/lib/booking-format';

const START_TIMES = timeSlots('07:00', '19:45');
const END_TIMES = timeSlots('07:15', '20:00');

const windowSchema = z
  .object({
    spaceId: z.string().min(1, 'Choose an office space'),
    date: z.string().min(1, 'Choose a date'),
    startTime: z.string().min(1, 'Choose a start time'),
    endTime: z.string().min(1, 'Choose an end time'),
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'End time must be after start time',
  });

export type WindowValues = z.infer<typeof windowSchema>;

interface Props {
  spaces: Space[];
  /** True while the seats for the last submit are loading. */
  pending?: boolean;
  onSubmit: (values: WindowValues) => void;
  /** Reports every change, so the page can tell when the shown seats are stale. */
  onValuesChange?: (values: WindowValues) => void;
}

/** Space, date and time-range picker. Submitting asks for the seats in that window. */
export function BookingWindowForm({ spaces, pending = false, onSubmit, onValuesChange }: Props) {
  const id = useId();
  // useForm reads these once, on mount.
  const defaultValues: WindowValues = {
    spaceId: spaces.length === 1 ? (spaces[0]?.id ?? '') : '',
    date: tomorrow(),
    startTime: '09:00',
    endTime: '17:00',
  };
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<WindowValues>({ resolver: zodResolver(windowSchema), defaultValues });

  const values = useWatch({ control });
  const { spaceId, date, startTime, endTime } = values;
  useEffect(() => {
    onValuesChange?.({
      spaceId: spaceId ?? '',
      date: date ?? '',
      startTime: startTime ?? '',
      endTime: endTime ?? '',
    });
  }, [spaceId, date, startTime, endTime, onValuesChange]);

  const space = spaces.find((s) => s.id === spaceId);
  const helpId = `${id}-help`;
  const helpText = space
    ? `Times are local to ${space.name} (${space.timeZone}).`
    : 'Times are local to the office you choose.';

  const field = (name: 'date' | 'startTime' | 'endTime') => {
    const message = errors[name]?.message;
    const errorId = `${id}-${name}-error`;
    return {
      id: `${id}-${name}`,
      errorId,
      message,
      'aria-invalid': message ? (true as const) : undefined,
      'aria-describedby': message ? `${helpId} ${errorId}` : helpId,
    };
  };
  const dateField = field('date');
  const startField = field('startTime');
  const endField = field('endTime');

  const error = (f: { errorId: string; message?: string }) =>
    f.message ? (
      <p id={f.errorId} className="text-destructive text-sm">
        {f.message}
      </p>
    ) : null;

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="grid gap-6"
    >
      <Controller
        control={control}
        name="spaceId"
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <SpaceChoice
            spaces={spaces}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            ref={ref}
            error={errors.spaceId?.message}
          />
        )}
      />

      <fieldset className="grid gap-3">
        <legend className="mb-1">
          <h2 className="text-lg font-medium">When</h2>
        </legend>
        <p id={helpId} className="text-muted-foreground text-sm">
          {helpText}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <div className="col-span-2 grid content-start gap-2 sm:col-span-1">
            <Label htmlFor={dateField.id}>Date</Label>
            <Input
              id={dateField.id}
              type="date"
              aria-invalid={dateField['aria-invalid']}
              aria-describedby={dateField['aria-describedby']}
              {...register('date')}
            />
            {error(dateField)}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={startField.id}>Start time</Label>
            <NativeSelect
              id={startField.id}
              className="w-full"
              aria-invalid={startField['aria-invalid']}
              aria-describedby={startField['aria-describedby']}
              {...register('startTime')}
            >
              {START_TIMES.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {t}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {error(startField)}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor={endField.id}>End time</Label>
            <NativeSelect
              id={endField.id}
              className="w-full"
              aria-invalid={endField['aria-invalid']}
              aria-describedby={endField['aria-describedby']}
              {...register('endTime')}
            >
              {END_TIMES.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {t}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {error(endField)}
          </div>
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="col-span-2 w-full sm:col-span-3 sm:w-auto lg:col-span-1"
          >
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" aria-hidden="true" />
                Loading seats…
              </>
            ) : (
              'Show seats'
            )}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
