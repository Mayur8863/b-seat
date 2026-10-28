'use client';

import { type Booking, useBookingsCreate } from '@bseat/api-client';
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
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { CircleCheckIcon, Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode, Ref } from 'react';
import { useEffect, useRef } from 'react';

import type { BookingSelection } from '@/components/your-selection';
import { formatLocalDate } from '@/lib/booking-format';
import { formatMoney, PASS_LABELS, slotTitle } from '@/lib/format';
import type { ProblemCopy } from '@/lib/problem-copy';
import { formatInstant } from '@/lib/seat-picker';

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={strong ? 'font-medium' : undefined}>{children}</dd>
    </div>
  );
}

function datesText(dates: string[]): string {
  return dates.map(formatLocalDate).join(', ');
}

/** Page-level alert for a failed booking (ui/03 5.2); replaced, never stacked, and focused when it appears. */
export function BookProblemAlert({ copy, ref }: { copy: ProblemCopy; ref?: Ref<HTMLDivElement> }) {
  return (
    <Alert variant="destructive" role="alert" tabIndex={-1} ref={ref}>
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {copy.description.map((part) =>
          typeof part === 'string' ? (
            part
          ) : (
            <Link
              key={part.href}
              href={part.href as Route}
              className="underline underline-offset-4"
            >
              {part.text}
            </Link>
          ),
        )}
      </AlertDescription>
    </Alert>
  );
}

/** The confirmation step (ui/03 5.2). Closing without booking returns focus to "Review booking". */
export function ReviewDialog({
  spaceId,
  booking,
  currency,
  timeZone,
  slotText,
  onClose,
  restoreFocus,
  onBooked,
  onFailed,
}: {
  spaceId: string;
  booking: BookingSelection | null;
  currency: string;
  timeZone: string;
  slotText: string;
  onClose: () => void;
  /** Puts focus back on "Review booking" when the dialog closes without booking. */
  restoreFocus: () => void;
  onBooked: (booking: Booking) => void;
  onFailed: (error: unknown) => void;
}) {
  const create = useBookingsCreate();
  // Success and failure place focus themselves (confirmation heading, page alert).
  const placedFocus = useRef(false);
  const { choice, startDate, selection } = booking ?? {};
  const price = selection ? formatMoney({ amount: selection.availability.price, currency }) : '';
  const closed = selection?.seat.closedDates ?? [];
  const multiDay = choice !== undefined && choice.pass !== 'day';

  const confirm = () => {
    if (!booking || create.isPending) return;
    create.mutate(
      {
        spaceId,
        data: {
          seatId: booking.selection.seat.id,
          pass: booking.choice.pass,
          slot: booking.choice.slot,
          startDate: booking.startDate,
        },
      },
      {
        onSuccess: (res) => {
          placedFocus.current = true;
          onBooked(res.data);
        },
        onError: (error) => {
          placedFocus.current = true;
          onFailed(error);
        },
      },
    );
  };

  return (
    <AlertDialog
      open={booking !== null}
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(e) => {
          // There is no Radix trigger, so focus is placed by hand in every case.
          e.preventDefault();
          if (!placedFocus.current) restoreFocus();
          placedFocus.current = false;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm your booking</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-3">
              {choice && selection && startDate && (
                <dl className="text-foreground grid gap-2">
                  <Row label="Space">{selection.availability.space.name}</Row>
                  <Row label="Seat">
                    {selection.seat.label}
                    {selection.seat.cubicle ? `, ${selection.seat.cubicle.name}` : ''}
                  </Row>
                  <Row label="Pass and slot">
                    {PASS_LABELS[choice.pass].name} · {slotText}
                  </Row>
                  {selection.seat.firstStartsAt && (
                    <Row label="Starts">
                      {formatInstant(selection.seat.firstStartsAt, timeZone)}
                    </Row>
                  )}
                  {selection.seat.lastEndsAt && (
                    <Row label="Ends">{formatInstant(selection.seat.lastEndsAt, timeZone)}</Row>
                  )}
                  {multiDay && closed.length > 0 && (
                    <Row label="Closed days skipped">{datesText(closed)}</Row>
                  )}
                  <Row label="Price" strong>
                    {price}
                  </Row>
                </dl>
              )}
              <p>
                You&apos;ll pay {price} directly to the owner. BSeat doesn&apos;t take payments.
              </p>
              <p>Times are in {timeZone}.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={create.isPending}>Change selection</AlertDialogCancel>
          <AlertDialogAction
            disabled={create.isPending}
            aria-busy={create.isPending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {create.isPending ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Booking…
              </>
            ) : (
              'Confirm booking'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Success state (ui/03 5.3), shown from the Booking response; its heading takes focus. */
export function BookingConfirmation({
  booking,
  email,
}: {
  booking: Booking;
  email: string | undefined;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const price = formatMoney(booking.price);
  const slot = slotTitle({ slot: booking.slot, ...booking.slotTimes });
  return (
    <section aria-labelledby="booking-confirmed" className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <CircleCheckIcon aria-hidden="true" className="text-success size-6" />
            <h2
              id="booking-confirmed"
              tabIndex={-1}
              ref={headingRef}
              className="text-lg font-medium"
            >
              Booking confirmed
            </h2>
          </div>
          <dl className="grid gap-2">
            <Row label="Space">{booking.space.name}</Row>
            <Row label="Seat">
              {booking.seat.label}
              {booking.seat.cubicleName ? `, ${booking.seat.cubicleName}` : ''}
            </Row>
            <Row label="Pass and slot">
              {PASS_LABELS[booking.pass].name} · {slot}
            </Row>
            <Row label="Starts">{formatInstant(booking.firstStartsAt, booking.timeZone)}</Row>
            <Row label="Ends">{formatInstant(booking.lastEndsAt, booking.timeZone)}</Row>
            {booking.skippedDates.length > 0 && (
              <Row label="Closed days skipped">{datesText(booking.skippedDates)}</Row>
            )}
            <Row label="Price" strong>
              {price}
            </Row>
          </dl>
          <p>
            Pay <span className="font-medium">{price}</span> directly to the owner. BSeat
            doesn&apos;t take payments.
          </p>
          {email && (
            <p className="text-muted-foreground">We&apos;re sending the details to {email}.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/bookings">View my bookings</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/find">Find another space</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
