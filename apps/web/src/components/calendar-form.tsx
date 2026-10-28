'use client';

import type { Calendar, CalendarInput } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { cn } from '@bseat/ui/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormField } from '@/components/space-form/form-field';
import {
  type CalendarValues,
  fromCalendar,
  PRESETS,
  toCalendarInput,
  validateCalendar,
  WEEKDAYS,
  type Weekday,
} from '@/lib/calendar-values';
import type { ProblemCopy } from '@/lib/problem-copy';

const schema = z
  .object({
    start: z.string(),
    ends: z.enum(['open', 'date']),
    end: z.string(),
    weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
  })
  .superRefine((v, ctx) => {
    for (const [path, message] of Object.entries(validateCalendar(v))) {
      ctx.addIssue({ code: 'custom', path: [path], message });
    }
  });

interface Props {
  /** Unique per form on the page: prefixes every control id. */
  idPrefix: string;
  initial: Calendar;
  submitLabel: string;
  pending: boolean;
  problem: ProblemCopy | null;
  onSubmit: (input: CalendarInput) => void;
  /** Save pressed with nothing changed: no request is sent (ui/04 3.1). */
  onUnchanged?: () => void;
  /** Any field changed after a save, so the parent can clear its status. */
  onChange?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  focusStart?: boolean;
}

/** The calendar fields shared by the shared calendar and a seat's own (ui/04 3.1). */
export function CalendarForm({
  idPrefix,
  initial,
  submitLabel,
  pending,
  problem,
  onSubmit,
  onUnchanged,
  onChange,
  onCancel,
  cancelLabel = 'Cancel',
  focusStart,
}: Props) {
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<CalendarValues>({
    resolver: zodResolver(schema),
    defaultValues: fromCalendar(initial),
  });
  const ends = useWatch({ control, name: 'ends' });
  const alertRef = useRef<HTMLDivElement>(null);
  const firstChipRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusStart) setFocus('start');
  }, [focusStart, setFocus]);
  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);
  useEffect(() => {
    if (errors.weekdays) firstChipRef.current?.focus();
  }, [errors.weekdays]);
  // A refetch after saving delivers the new values; they become the baseline for "unchanged".
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    reset(fromCalendar(JSON.parse(initialKey) as Calendar));
  }, [initialKey, reset]);

  const save = (v: CalendarValues) => {
    if (!isDirty && onUnchanged) onUnchanged();
    else onSubmit(toCalendarInput(v));
  };
  const weekdayError = errors.weekdays?.message;
  const weekdayDescribedBy = ['days-hint', weekdayError ? 'days-error' : undefined]
    .filter(Boolean)
    .map((x) => `${idPrefix}-${x}`)
    .join(' ');

  return (
    <form
      noValidate
      aria-busy={pending}
      onChange={onChange}
      onSubmit={(e) => void handleSubmit(save)(e)}
      className="grid gap-4 md:max-w-2xl"
    >
      {problem && (
        <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>
            <p>{problem.description.map((p) => (typeof p === 'string' ? p : p.text))}</p>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id={`${idPrefix}-start`}
          label="Start date"
          hint="The first day seats can be booked."
          error={errors.start?.message}
        >
          {(aria) => <Input {...aria} type="date" disabled={pending} {...register('start')} />}
        </FormField>
        {ends === 'date' && (
          <FormField
            id={`${idPrefix}-end`}
            label="End date"
            hint="The last day seats can be booked."
            error={errors.end?.message}
          >
            {(aria) => <Input {...aria} type="date" disabled={pending} {...register('end')} />}
          </FormField>
        )}
      </div>
      <fieldset className="grid gap-2" disabled={pending}>
        <legend className="mb-2 text-sm font-medium">Ends</legend>
        <Controller
          control={control}
          name="ends"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                onChange?.();
              }}
              aria-label="Ends"
              className="gap-2"
            >
              <div className="flex items-center gap-2 max-sm:min-h-11">
                <RadioGroupItem id={`${idPrefix}-ends-open`} value="open" />
                <Label htmlFor={`${idPrefix}-ends-open`}>No end date</Label>
              </div>
              <div className="flex items-center gap-2 max-sm:min-h-11">
                <RadioGroupItem id={`${idPrefix}-ends-date`} value="date" />
                <Label htmlFor={`${idPrefix}-ends-date`}>On a date</Label>
              </div>
            </RadioGroup>
          )}
        />
      </fieldset>
      <Controller
        control={control}
        name="weekdays"
        render={({ field }) => {
          const toggle = (day: Weekday) => {
            field.onChange(
              field.value.includes(day)
                ? field.value.filter((d) => d !== day)
                : [...field.value, day],
            );
          };
          return (
            <fieldset
              className="grid gap-2"
              disabled={pending}
              aria-describedby={weekdayDescribedBy}
            >
              <legend className="mb-2 text-sm font-medium">Days of the week</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ key, short, full }, i) => {
                  const on = field.value.includes(key);
                  const id = `${idPrefix}-day-${key}`;
                  return (
                    <Label
                      key={key}
                      htmlFor={id}
                      className={cn(
                        'has-[:focus-visible]:outline-ring inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-1 rounded-lg border px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                        on
                          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'border-muted-foreground bg-card text-foreground hover:bg-muted/50',
                        pending && 'opacity-50',
                      )}
                    >
                      <input
                        id={id}
                        ref={i === 0 ? firstChipRef : undefined}
                        type="checkbox"
                        className="sr-only"
                        aria-label={full}
                        checked={on}
                        onChange={() => {
                          toggle(key);
                        }}
                      />
                      {on && <CheckIcon aria-hidden="true" className="size-4" />}
                      <span aria-hidden="true">{short}</span>
                    </Label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['Every day', PRESETS.everyDay],
                    ['Weekdays', PRESETS.weekdays],
                    ['Weekends', PRESETS.weekends],
                  ] as const
                ).map(([label, days]) => (
                  <Button
                    key={label}
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setValue('weekdays', [...days], { shouldDirty: true });
                      onChange?.();
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p id={`${idPrefix}-days-hint`} className="text-muted-foreground text-sm">
                Seats can be booked only on the days you choose.
              </p>
              {weekdayError && (
                <p id={`${idPrefix}-days-error`} className="text-destructive text-sm">
                  {weekdayError}
                </p>
              )}
            </fieldset>
          );
        }}
      />
      <div className="grid gap-2 sm:flex">
        <Button type="submit" disabled={pending} className="max-sm:min-h-11">
          {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
            className="max-sm:min-h-11"
          >
            {cancelLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
