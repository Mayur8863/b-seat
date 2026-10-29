import { z } from 'zod';

import {
  CountryCode,
  CurrencyCode,
  Instant,
  LocalDate,
  LocalTime,
  PlainText,
  StandardUtility,
  TimeZone,
} from '../common/schemas/field-formats.js';
import { PhotoImageSchema } from '../photos/space-photos.schemas.js';
import { PassTypeEnum, SlotKindEnum } from '../marketplace/enums.js';

const Money = z.string().describe('Decimal amount with two fraction digits');
const Saving = z.object({ amount: Money, percent: z.int() });

export const ListingCoverSchema = z
  .object({ altText: z.string(), card: PhotoImageSchema })
  .meta({ id: 'ListingCover' });

export const ListingPhotoSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(1).max(10),
    description: z.string().nullable().describe('Shown as a caption when not null'),
    altText: z.string(),
    card: PhotoImageSchema.describe('Gallery thumbnail'),
    display: PhotoImageSchema.describe('Main image and large view'),
  })
  .meta({ id: 'ListingPhoto' });

const PhotoUrlsExpireAt = Instant.nullable().describe(
  'When the signed photo URLs expire; null when there are none',
);

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
        slot: SlotKindEnum,
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
    photos: z.array(ListingPhotoSchema).describe('In position order; empty means no photos'),
    photoUrlsExpireAt: PhotoUrlsExpireAt,
  })
  .meta({ id: 'Listing' });
export type Listing = z.infer<typeof ListingSchema>;

const UtilityList = z
  .union([StandardUtility, z.array(StandardUtility)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

export const SearchListingsInputSchema = z
  .strictObject({
    country: CountryCode,
    city: PlainText.trim().max(100).optional(),
    area: PlainText.trim().max(100).optional(),
    startDate: LocalDate.optional().describe(
      'Only spaces with a seat free for the whole pass from this date; no pass means a day pass, no slot any offered slot',
    ),
    pass: PassTypeEnum.optional(),
    slot: SlotKindEnum.optional(),
    utilities: UtilityList.optional().describe('Repeat the parameter; every one must be present'),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'SearchListingsInput' });
export type SearchListingsInput = z.output<typeof SearchListingsInputSchema>;

export const ListingSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    country: CountryCode,
    city: z.string(),
    area: z.string(),
    utilities: z.array(StandardUtility),
    customUtilities: z.array(z.string()),
    currency: CurrencyCode,
    lowestPrices: z.object({
      day: Money.nullable(),
      week: Money.nullable(),
      month: Money.nullable(),
    }),
    hasLayout: z.boolean(),
    cover: ListingCoverSchema.nullable().describe('The first photo; null shows a placeholder'),
  })
  .meta({ id: 'ListingSummary' });

export const ListingSearchResultsSchema = z
  .object({
    items: z.array(ListingSummarySchema),
    nextCursor: z.string().nullable(),
    photoUrlsExpireAt: PhotoUrlsExpireAt,
  })
  .meta({ id: 'ListingSearchResults' });
export type ListingSearchResults = z.infer<typeof ListingSearchResultsSchema>;

export const LocationSuggestionsInputSchema = z
  .strictObject({
    country: CountryCode,
    field: z.enum(['city', 'area']),
    city: PlainText.trim().min(1).max(100).optional(),
    q: PlainText.trim().min(1).max(100),
  })
  .refine((v) => v.field !== 'area' || v.city !== undefined, {
    message: 'city is required when field is area',
    path: ['city'],
  })
  .meta({ id: 'LocationSuggestionsInput' });
export type LocationSuggestionsInput = z.output<typeof LocationSuggestionsInputSchema>;

export const LocationSuggestionsSchema = z
  .object({ items: z.array(z.object({ value: z.string(), count: z.int() })) })
  .meta({ id: 'LocationSuggestions' });
export type LocationSuggestions = z.infer<typeof LocationSuggestionsSchema>;

/** Query of the seat availability read. Past and far dates are viewable; the booking rules apply on POST. */
export const SeatAvailabilityInputSchema = z
  .strictObject({ pass: PassTypeEnum, slot: SlotKindEnum, startDate: LocalDate })
  .meta({ id: 'SeatAvailabilityInput' });
export type SeatAvailabilityInput = z.infer<typeof SeatAvailabilityInputSchema>;

/** Who holds a taken seat is never exposed (FR-022). */
export const ListingSeatAvailabilitySchema = z
  .object({
    space: z.object({ id: z.uuid(), name: z.string(), timeZone: TimeZone }),
    pass: PassTypeEnum,
    slot: SlotKindEnum,
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
