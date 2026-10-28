import { z } from 'zod';

import { STANDARD_UTILITIES } from '../reference/utilities.js';

import {
  CountryCode,
  CurrencyCode,
  Instant,
  LocalTime,
  MultilineText,
  OfferedTimeZone,
  PlainText,
  StandardUtility,
  TimeZone,
} from '../common/schemas/field-formats.js';

/* Request and response schemas never share a definition (AGENTS.md). Shapes that repeat are
 * built from unnamed helpers, so no shared component appears in OpenAPI. */

const ShiftChangeAt = LocalTime.refine((v) => v < '12:00', 'Shift change must be 00:00 to 11:59');

const OpeningHoursInput = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('always_open'), shiftChangeAt: ShiftChangeAt }),
  z
    .strictObject({ mode: z.literal('fixed_hours'), opensAt: LocalTime, closesAt: LocalTime })
    .refine((v) => v.closesAt > v.opensAt, {
      path: ['closesAt'],
      message: 'Closing time must be after opening time',
    }),
]);

const OpeningHoursOutput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('always_open'), shiftChangeAt: LocalTime }),
  z.object({ mode: z.literal('fixed_hours'), opensAt: LocalTime, closesAt: LocalTime }),
]);

const Text = (max: number) => PlainText.trim().min(1).max(max);
const unique = (values: string[]) =>
  new Set(values.map((v) => v.toLowerCase())).size === values.length;

const fields = {
  name: Text(100),
  description: MultilineText.trim().min(1).max(2000),
  country: CountryCode,
  city: Text(100),
  area: Text(100),
  streetAddress: Text(200),
  timeZone: OfferedTimeZone,
  currency: CurrencyCode,
  openingHours: OpeningHoursInput,
};
const utilities = z
  .array(StandardUtility)
  .max(STANDARD_UTILITIES.length)
  .refine(unique, 'Utilities must be unique');
const customUtilities = z
  .array(Text(40))
  .max(5)
  .refine(unique, 'Custom utilities must be unique (ignoring case)');

export const CreateSpaceInputSchema = z
  .strictObject({
    ...fields,
    utilities: utilities.default([]),
    customUtilities: customUtilities.default([]),
  })
  .meta({ id: 'CreateSpaceInput' });
export type CreateSpaceInput = z.infer<typeof CreateSpaceInputSchema>;

// No defaults: an absent utilities list is left alone, not reset.
export const UpdateSpaceInputSchema = z
  .strictObject({
    name: fields.name.optional(),
    description: fields.description.optional(),
    country: fields.country.optional(),
    city: fields.city.optional(),
    area: fields.area.optional(),
    streetAddress: fields.streetAddress.optional(),
    timeZone: fields.timeZone.optional(),
    currency: fields.currency.optional(),
    openingHours: fields.openingHours.optional(),
    utilities: utilities.optional(),
    customUtilities: customUtilities.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field')
  .meta({ id: 'UpdateSpaceInput' });
export type UpdateSpaceInput = z.infer<typeof UpdateSpaceInputSchema>;

const status = z.enum(['draft', 'published', 'unpublished']);

export const OwnerSpaceSchema = z
  .object({
    id: z.uuid(),
    status,
    name: z.string(),
    description: z.string(),
    country: CountryCode,
    city: z.string(),
    area: z.string(),
    streetAddress: z.string(),
    timeZone: TimeZone,
    currency: CurrencyCode,
    openingHours: OpeningHoursOutput,
    utilities: z.array(StandardUtility),
    customUtilities: z.array(z.string()),
    seatCount: z.number().int(),
    hasOfferedPass: z.boolean(),
    hasLayout: z.boolean(),
    createdAt: Instant,
    updatedAt: Instant,
  })
  .meta({ id: 'OwnerSpace' });
export type OwnerSpace = z.infer<typeof OwnerSpaceSchema>;

export const OwnerSpaceSummarySchema = z
  .object({
    id: z.uuid(),
    status,
    name: z.string(),
    city: z.string(),
    area: z.string(),
    country: CountryCode,
    seatCount: z.number().int(),
    hasOfferedPass: z.boolean(),
    upcomingBookingCount: z.number().int(),
  })
  .meta({ id: 'OwnerSpaceSummary' });

export const OwnerSpaceListSchema = z
  .object({ items: z.array(OwnerSpaceSummarySchema) })
  .meta({ id: 'OwnerSpaceList' });
export type OwnerSpaceList = z.infer<typeof OwnerSpaceListSchema>;

/* Pricing (T027). Money is a string, never a number: Postgres rounds sub-cent values silently. */

const SLOT_KINDS = z.enum(['day', 'night', 'full_day', 'working_hours']);

const DecimalString = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Expected a positive amount with at most two decimals')
  .refine((v) => /[1-9]/.test(v), 'Amount must be greater than zero');

const Money = z.string().describe('Decimal amount with two fraction digits');

export const UpdatePricingInputSchema = z
  .strictObject({
    shiftChangeAt: ShiftChangeAt.optional(),
    slots: z.array(
      z.strictObject({
        slot: SLOT_KINDS,
        enabled: z.boolean(),
        prices: z.strictObject({
          day: DecimalString.nullable(),
          week: DecimalString.nullable(),
          month: DecimalString.nullable(),
        }),
      }),
    ),
  })
  .meta({ id: 'UpdatePricingInput' });
export type UpdatePricingInput = z.infer<typeof UpdatePricingInputSchema>;

export const SpacePricingSchema = z
  .object({
    currency: CurrencyCode,
    openingHours: OpeningHoursOutput,
    slots: z.array(
      z.object({
        slot: SLOT_KINDS,
        enabled: z.boolean(),
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
  })
  .meta({ id: 'SpacePricing' });
export type SpacePricing = z.infer<typeof SpacePricingSchema>;
