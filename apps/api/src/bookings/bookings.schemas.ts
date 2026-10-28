import { z } from 'zod';

import {
  CountryCode,
  CurrencyCode,
  Instant,
  LocalDate,
  LocalTime,
  TimeZone,
} from '../common/schemas/field-formats.js';
import { PassTypeEnum, SlotKindEnum } from '../marketplace/enums.js';

const Money = z.object({
  amount: z.string().describe('Decimal amount with two fraction digits'),
  currency: CurrencyCode,
});

/** Always books for the caller; the body never names a user. */
export const CreateBookingInputSchema = z
  .strictObject({
    seatId: z.uuid(),
    pass: PassTypeEnum,
    slot: SlotKindEnum,
    startDate: LocalDate,
  })
  .meta({ id: 'CreateBookingInput' });
export type CreateBookingInput = z.infer<typeof CreateBookingInputSchema>;

/** Renter-facing booking. No user id: the caller is the only one who can see it. */
export const BookingSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    pass: PassTypeEnum,
    slot: SlotKindEnum,
    startDate: LocalDate,
    endDate: LocalDate,
    timeZone: TimeZone,
    slotTimes: z.object({ startTime: LocalTime, endTime: LocalTime, endsNextDay: z.boolean() }),
    firstStartsAt: Instant,
    lastEndsAt: Instant,
    days: z.array(z.object({ date: LocalDate, startsAt: Instant, endsAt: Instant })),
    skippedDates: z.array(LocalDate),
    seat: z.object({ id: z.uuid(), label: z.string(), cubicleName: z.string().nullable() }),
    space: z.object({
      id: z.uuid(),
      name: z.string(),
      area: z.string(),
      city: z.string(),
      country: CountryCode,
    }),
    price: Money,
    createdAt: Instant,
    cancelledAt: Instant.nullable(),
  })
  .meta({ id: 'Booking' });
export type Booking = z.infer<typeof BookingSchema>;

export const BookingListSchema = z
  .object({ items: z.array(BookingSchema) })
  .meta({ id: 'BookingList' });
export type BookingList = z.infer<typeof BookingListSchema>;

export const ListMyBookingsInputSchema = z
  .strictObject({ limit: z.coerce.number().int().min(1).max(50).default(50) })
  .meta({ id: 'ListMyBookingsInput' });
export type ListMyBookingsInput = z.infer<typeof ListMyBookingsInputSchema>;
