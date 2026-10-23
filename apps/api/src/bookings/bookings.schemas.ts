import { z } from 'zod';

import { Instant, LocalDate, LocalTime, TimeZone } from '../common/schemas/field-formats.js';

// Contract: specs/001-seat-booking/contracts/bookings.md.

// ---- Requests ----

/**
 * Always books for the caller (no user id input). Only the format is validated here: a
 * well-formed window that breaks a booking rule (including end before start) is a 422.
 */
export const CreateBookingInputSchema = z
  .object({
    seatId: z.uuid(),
    date: LocalDate,
    startTime: LocalTime,
    endTime: LocalTime,
  })
  .meta({
    id: 'CreateBookingInput',
    description: "Book one seat for a window in its space's time",
  });

export type CreateBookingInput = z.infer<typeof CreateBookingInputSchema>;

// ---- Responses ----

export const BookingSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    date: LocalDate,
    startTime: LocalTime,
    endTime: LocalTime,
    timeZone: TimeZone.describe("The space's IANA time zone; label local times with it"),
    startsAt: Instant,
    endsAt: Instant.describe('UTC instant (ISO 8601), exclusive'),
    seat: z.object({ id: z.uuid(), label: z.string() }),
    space: z.object({ id: z.uuid(), name: z.string(), location: z.string() }),
    createdAt: Instant,
    cancelledAt: Instant.nullable(),
  })
  .meta({ id: 'Booking', description: "One of the caller's seat bookings" });

export type Booking = z.infer<typeof BookingSchema>;
