'use client';

import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { useId, useState } from 'react';

import type { SeatSelection } from '@/components/listing-seat-list';
import type { PassChoice } from '@/components/pass-options';
import { formatMoney, PASS_LABELS } from '@/lib/format';
import { formatInstant } from '@/lib/seat-picker';

/** What T041 books: the pass, slot, start date and seat. */
export interface BookingSelection {
  choice: PassChoice;
  startDate: string;
  selection: SeatSelection;
}

/** "Your selection" summary (ui/03 5.1). `onReview` is the T041 seam; without it the button only validates. */
export function YourSelection({
  choice,
  startDate,
  selection,
  currency,
  timeZone,
  slotText,
  onReview,
  onMissing,
}: {
  choice: PassChoice | null;
  startDate: string;
  selection: SeatSelection | null;
  currency: string;
  timeZone: string;
  slotText: string | null;
  onReview?: (booking: BookingSelection) => void;
  /** Called with the first missing piece so the page can move focus to its control (ui/03 5.1). */
  onMissing?: (missing: 'pass' | 'date' | 'seat') => void;
}) {
  const headingId = useId();
  const errorId = useId();
  const [error, setError] = useState('');
  const { seat, availability } = selection ?? {};
  const complete = choice && startDate && seat && availability;

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardContent className="grid gap-3">
          <h2 id={headingId} className="text-lg font-medium">
            Your selection
          </h2>
          {complete ? (
            <dl className="grid gap-2">
              <Row label="Space" value={availability.space.name} />
              <Row
                label="Seat"
                value={`${seat.label}${seat.cubicle ? `, ${seat.cubicle.name}` : ''}`}
              />
              <Row label="Pass" value={`${PASS_LABELS[choice.pass].name} · ${slotText ?? ''}`} />
              {seat.firstStartsAt && (
                <Row label="Starts" value={formatInstant(seat.firstStartsAt, timeZone)} />
              )}
              {seat.lastEndsAt && (
                <Row label="Ends" value={formatInstant(seat.lastEndsAt, timeZone)} />
              )}
              <Row
                label="Price"
                value={formatMoney({ amount: availability.price, currency })}
                strong
              />
            </dl>
          ) : (
            <p className="text-muted-foreground">Choose a pass, a start date and a seat.</p>
          )}
          {complete && (
            <p className="text-muted-foreground text-sm">
              You&apos;ll pay the owner directly. BSeat doesn&apos;t take payments.
            </p>
          )}
          {error && (
            <p id={errorId} className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            type="button"
            aria-describedby={error ? errorId : undefined}
            onClick={() => {
              if (!choice) {
                setError('Choose a pass.');
                onMissing?.('pass');
                return;
              }
              if (!startDate) {
                setError('Choose a start date.');
                onMissing?.('date');
                return;
              }
              if (!complete) {
                setError('Choose a seat.');
                onMissing?.('seat');
                return;
              }
              setError('');
              onReview?.({ choice, startDate, selection: { seat, availability } });
            }}
          >
            Review booking
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={strong ? 'font-medium' : undefined}>{value}</dd>
    </div>
  );
}
