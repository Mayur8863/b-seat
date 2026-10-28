import { z } from 'zod';

import {
  CountryCode,
  Instant,
  LocalDate,
  CurrencyCode,
  LocalTime,
  StandardUtility,
  TimeZone,
} from '../common/schemas/field-formats.js';

const Money = z.string().describe('Decimal amount with two fraction digits');
const Saving = z.object({ amount: Money, percent: z.int() });
const SLOT_KINDS = z.enum(['day', 'night', 'full_day', 'working_hours']);

/** Renter-facing detail: no owner identity, contact or occupancy data (R-3). */
export const ListingSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    country: CountryCode,
    city: z.string(),
    area: z.string(),
    streetAddress: z.string(),
    timeZone: TimeZone,
    currency: CurrencyCode,
    utilities: z.array(StandardUtility),
    customUtilities: z.array(z.string()),
    hasLayout: z.boolean(),
    openingHours: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('always_open'), shiftChangeAt: LocalTime }),
      z.object({ mode: z.literal('fixed_hours'), opensAt: LocalTime, closesAt: LocalTime }),
    ]),
    offers: z.array(
      z.object({
        slot: SLOT_KINDS,
        startTime: LocalTime,
        endTime: LocalTime,
        endsNextDay: z.boolean(),
        prices: z.object({
          day: Money.nullable(),
          week: Money.nullable(),
          month: Money.nullable(),
        }),
      }),
    ),
    fullDaySavings: z
      .object({ day: Saving.nullable(), week: Saving.nullable(), month: Saving.nullable() })
      .nullable(),
    isOwnSpace: z.boolean(),
  })
  .meta({ id: 'Listing' });
export type Listing = z.infer<typeof ListingSchema>;

export const PassTypeSchema = z.enum(['day', 'week', 'month']);

/** Query of the seat availability read. Past and far dates are viewable; the booking rules apply on POST. */
export const SeatAvailabilityInputSchema = z
  .object({ pass: PassTypeSchema, slot: SLOT_KINDS, startDate: LocalDate })
  .meta({ id: 'SeatAvailabilityInput' });
export type SeatAvailabilityInput = z.infer<typeof SeatAvailabilityInputSchema>;

/** Who holds a taken seat is never exposed (FR-022). */
export const ListingSeatAvailabilitySchema = z
  .object({
    space: z.object({ id: z.uuid(), name: z.string(), timeZone: TimeZone }),
    pass: PassTypeSchema,
    slot: SLOT_KINDS,
    startDate: LocalDate,
    endDate: LocalDate,
    slotTimes: z.object({ startTime: LocalTime, endTime: LocalTime, endsNextDay: z.boolean() }),
    price: Money,
    seats: z.array(
      z.object({
        id: z.uuid(),
        label: z.string(),
        features: z.array(z.string()),
        cubicle: z.object({ id: z.uuid(), name: z.string() }).nullable(),
        status: z.enum(['free', 'taken', 'closed']),
        firstStartsAt: Instant.nullable(),
        lastEndsAt: Instant.nullable(),
        includedDates: z.int(),
        closedDates: z.array(LocalDate),
      }),
    ),
  })
  .meta({ id: 'ListingSeatAvailability' });
export type ListingSeatAvailability = z.infer<typeof ListingSeatAvailabilitySchema>;
