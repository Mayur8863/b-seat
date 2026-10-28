'use client';

import { type OccupancyConflict, useOccupancyMark } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { Textarea } from '@bseat/ui/components/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { OccupancyConflicts } from '@/components/occupancy-conflicts';
import { FormField } from '@/components/space-form/form-field';
import { describeOccupancyProblem } from '@/lib/occupancy-problems';
import { validateMarkDates } from '@/lib/occupancy-values';
import type { ProblemCopy } from '@/lib/problem-copy';

const NOTE_MAX = 200;

const schema = z
  .object({
    start: z.string(),
    ends: z.enum(['open', 'date']),
    end: z.string(),
    note: z.string().max(NOTE_MAX, `Use ${NOTE_MAX} characters or fewer.`),
  })
  .superRefine((v, ctx) => {
    const errors = validateMarkDates(v);
    if (errors.start) ctx.addIssue({ code: 'custom', path: ['start'], message: errors.start });
    if (errors.end) ctx.addIssue({ code: 'custom', path: ['end'], message: errors.end });
  });
type Values = z.infer<typeof schema>;

interface Props {
  spaceId: string;
  seats: { id: string; label: string }[];
  today: string;
  timeZone: string;
  onCancel: () => void;
  onMarked: (count: number) => void;
}

/** Inline panel (not a dialog) that marks the selected seats occupied (ui/04 2.4). */
export function MarkOccupiedPanel({ spaceId, seats, today, timeZone, onCancel, onMarked }: Props) {
  const mark = useOccupancyMark();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<{
    alert: ProblemCopy;
    conflicts?: OccupancyConflict[];
  } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { start: today, ends: 'open', end: '', note: '' },
  });
  const ends = useWatch({ control, name: 'ends' });
  const note = useWatch({ control, name: 'note' });
  const pending = mark.isPending;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  const onSubmit = (v: Values) => {
    setProblem(null);
    mark.mutate(
      {
        spaceId,
        data: {
          seatIds: seats.map((s) => s.id),
          startDate: v.start,
          endDate: v.ends === 'date' ? v.end : null,
          note: v.note.trim() === '' ? null : v.note.trim(),
        },
      },
      {
        onSuccess: () => {
          onMarked(seats.length);
        },
        onError: (error) => {
          setProblem({ ...describeOccupancyProblem(error, 'mark occupied') });
        },
      },
    );
  };

  const labels = seats.slice(0, 10).map((s) => s.label);
  const more = seats.length - labels.length;

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          aria-labelledby="mark-heading"
          aria-busy={pending}
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="grid gap-4 md:max-w-2xl"
        >
          <h3 id="mark-heading" ref={headingRef} tabIndex={-1} className="text-base font-medium">
            Mark seats occupied
          </h3>
          {problem && (
            <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
              <AlertTitle>{problem.alert.title}</AlertTitle>
              <AlertDescription>
                <p>{problem.alert.description.map((p) => (typeof p === 'string' ? p : p.text))}</p>
                {problem.conflicts && <OccupancyConflicts conflicts={problem.conflicts} />}
              </AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-sm">
            Seats: {labels.join(', ')}
            {more > 0 && ` and ${more} more`}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="mark-start"
              label="Start date"
              hint={`Dates are in ${timeZone}.`}
              error={errors.start?.message}
            >
              {(aria) => <Input {...aria} type="date" disabled={pending} {...register('start')} />}
            </FormField>
            {ends === 'date' && (
              <FormField
                id="mark-end"
                label="End date"
                hint="The seats stay occupied through this day."
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
                  onValueChange={field.onChange}
                  aria-label="Ends"
                  className="gap-2"
                >
                  <div className="flex items-center gap-2 max-sm:min-h-11">
                    <RadioGroupItem id="mark-ends-open" value="open" />
                    <Label htmlFor="mark-ends-open">Until I mark them vacant</Label>
                  </div>
                  <div className="flex items-center gap-2 max-sm:min-h-11">
                    <RadioGroupItem id="mark-ends-date" value="date" />
                    <Label htmlFor="mark-ends-date">On a date</Label>
                  </div>
                </RadioGroup>
              )}
            />
          </fieldset>
          <FormField
            id="mark-note"
            label="Note (optional)"
            hint="Only you can see this. Up to 200 characters."
            error={errors.note?.message}
          >
            {(aria) => <Textarea {...aria} rows={2} disabled={pending} {...register('note')} />}
          </FormField>
          <p className="text-muted-foreground -mt-2 text-sm">
            {note.length} of {NOTE_MAX}
          </p>
          <div className="grid gap-2 sm:flex">
            <Button type="submit" disabled={pending} className="max-sm:min-h-11">
              {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {pending ? 'Marking…' : 'Mark occupied'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
              className="max-sm:min-h-11"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
