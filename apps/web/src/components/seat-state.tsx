import type { OwnerSeat } from '@bseat/api-client';
import { Badge } from '@bseat/ui/components/badge';
import { CircleIcon, LockIcon, UserIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * Today's state of a seat, always as icon plus word (ui/04 2.1).
 * `bookingsHref` is the seam for the owner bookings page (T058): the link shows only when given.
 */
export function SeatState({ seat, bookingsHref }: { seat: OwnerSeat; bookingsHref?: string }) {
  const { state, note } = seat.today;
  return (
    <div className="grid min-w-0 gap-1 text-sm sm:justify-items-start">
      {state === 'vacant' && (
        <Badge variant="outline">
          <CircleIcon aria-hidden="true" /> Vacant
        </Badge>
      )}
      {state === 'occupied' && (
        <>
          <Badge variant="secondary">
            <LockIcon aria-hidden="true" /> Occupied by you
          </Badge>
          {note && <span className="text-muted-foreground break-words">Note: {note}</span>}
        </>
      )}
      {state === 'booked' && (
        <>
          <Badge variant="secondary">
            <UserIcon aria-hidden="true" /> Booked by a renter
          </Badge>
          {bookingsHref && (
            <Link
              href={bookingsHref as Route}
              className="text-primary underline underline-offset-4"
            >
              See bookings <span className="sr-only">for seat {seat.label}</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
