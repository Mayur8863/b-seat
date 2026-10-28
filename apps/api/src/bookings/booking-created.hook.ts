import { Injectable } from '@nestjs/common';

import type { Booking } from './bookings.schemas.js';

export interface BookingCreatedEvent {
  bookingId: string;
  seatId: string;
  spaceId: string;
  userId: string;
  /** The response body, so listeners need no second read of what was just written. */
  booking: Booking;
}

/**
 * The seam for what happens after a booking commits (the renter and owner emails, T037).
 * `BookingsService` calls it after the transaction, never inside it, and swallows its failures:
 * a late or failed notification must not fail a booking that already exists (FR-021).
 */
export abstract class BookingCreatedHook {
  abstract onCreated(event: BookingCreatedEvent): Promise<void>;
}

@Injectable()
export class NoopBookingCreatedHook extends BookingCreatedHook {
  onCreated(): Promise<void> {
    return Promise.resolve();
  }
}
