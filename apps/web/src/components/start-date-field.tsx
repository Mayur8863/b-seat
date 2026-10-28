'use client';

import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { useId } from 'react';

import { formatLocalDate } from '@/lib/booking-format';
import { isStartDateAllowed, startDateRange } from '@/lib/seat-picker';

/** Start date limited to today..+30 days in the space's zone (ui/03 4.3). Reports only valid dates, else ''. */
export function StartDateField({
  value,
  onChange,
  timeZone,
}: {
  value: string;
  onChange: (date: string) => void;
  timeZone: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const range = startDateRange(timeZone);
  const [raw, setRaw] = [value, onChange];
  const invalid = raw !== '' && !isStartDateAllowed(raw, range);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Start date</Label>
      <Input
        id={id}
        type="date"
        min={range.min}
        max={range.max}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
        className="max-w-xs"
      />
      <p id={hintId} className="text-muted-foreground text-sm">
        Passes start on a day you choose, up to 30 days ahead. Dates are in {timeZone}.
      </p>
      {invalid && (
        <p id={errorId} className="text-destructive text-sm">
          Choose a date from {formatLocalDate(range.min)} to {formatLocalDate(range.max)}.
        </p>
      )}
    </div>
  );
}
