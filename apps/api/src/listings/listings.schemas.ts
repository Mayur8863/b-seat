import { z } from 'zod';

import {
  CountryCode,
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
