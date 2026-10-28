'use client';

import { useBookingsListMine } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Badge } from '@bseat/ui/components/badge';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { CalendarIcon } from 'lucide-react';
import Link from 'next/link';

import { PASS_LABELS } from '@/lib/format';
import { bookingStatus } from '@/lib/my-bookings';
import { formatInstant } from '@/lib/seat-picker';

import { slotTitle } from '@/lib/format';

/** Dashboard "Next booking" card (ui/03 section 7). */
export function NextBooking() {
  const { data, isPending, error, refetch } = useBookingsListMine({ limit: 1 });
  const booking = data?.data.items[0];
  const started = booking ? bookingStatus(booking) === 'in-progress' : false;

  return (
    <section aria-labelledby="next-heading" className="grid content-start gap-3">
      <h2 id="next-heading" className="text-lg font-medium">
        Next booking
      </h2>
      {isPending ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            Loading your next booking…
          </span>
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t load your next booking</AlertTitle>
          <AlertDescription>
            Try again in a moment.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : booking ? (
        <Card>
          <CardContent className="grid justify-items-start gap-2">
            <p className="font-medium">{booking.space.name}</p>
            <Badge variant="outline">
              {PASS_LABELS[booking.pass].name} ·{' '}
              {slotTitle({ slot: booking.slot, ...booking.slotTimes })}
            </Badge>
            <p>
              {started ? 'Started' : 'Starts'}{' '}
              {formatInstant(booking.firstStartsAt, booking.timeZone)}
            </p>
            {booking.startDate !== booking.endDate && (
              <p className="text-muted-foreground text-sm">
                Ends {formatInstant(booking.lastEndsAt, booking.timeZone)}
              </p>
            )}
            <p>Seat {booking.seat.label}</p>
            <Link href="/bookings" className="text-primary underline underline-offset-4">
              View booking
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid justify-items-start gap-3">
            <CalendarIcon aria-hidden="true" className="text-muted-foreground size-5" />
            <p className="font-medium">You have no upcoming bookings.</p>
            <p className="text-muted-foreground">
              Find a space and book a seat by the day, week or month.
            </p>
            <Button asChild className="max-sm:min-h-11">
              <Link href="/find">Find a space</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
