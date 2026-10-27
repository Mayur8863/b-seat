# Contract: listings (renter catalogue)

Module `apps/api/src/listings/`. `@UseGuards(AuthGuard)`; any signed-in user. Every query filters
`space.status = 'published'`; drafts and unpublished spaces are 404 here (R-3). Responses never include
occupancy notes, renter identities or owner contact details.

## GET /api/listings (search, T034; availability filter T038)

`Listings_search`, hook `useListingsSearch`.

```ts
const SearchListingsInput = z
  .strictObject({
    country: CountryCode, // required (FR-014)
    city: z.string().trim().max(100).optional(), // matched on lower(btrim()) (AC 4.2)
    area: z.string().trim().max(100).optional(),
    startDate: LocalDate.optional(),
    pass: PassType.optional(),
    slot: SlotKind.optional(),
    utilities: z.array(StandardUtility).optional(), // all must be present (AC 4.3); repeated query param
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20), // OQ-12
  })
  .meta({ id: 'SearchListingsInput' });

const ListingSummary = z
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
    }), // FR-015
    hasLayout: z.boolean(),
  })
  .meta({ id: 'ListingSummary' });
const ListingSearchResults = z
  .object({ items: z.array(ListingSummary), nextCursor: z.string().nullable() })
  .meta({ id: 'ListingSearchResults' });
```

- `pass` and/or `slot` without `startDate` keep spaces that **offer** that pass/slot.
- With `startDate`: keep spaces with at least one seat free for the whole period of (`pass`, `slot`); without a
  pass or slot, the default in OQ-4 applies (T038).
- No match → `{ items: [], nextCursor: null }`. The web shows the "widen to the whole country" empty state.

## GET /api/listings/locations (suggestions, T034)

`Listings_locations`. Query `LocationSuggestionsInput { country, field: 'city' | 'area', city?, q (1–100) }`.
Returns `LocationSuggestions { items: [{ value: string, count: int }] }`, at most 10, from published listings,
matched by prefix on the trimmed, lower-cased key (AC 4.2, R-9). `field: 'area'` requires `city`.

## GET /api/listings/{spaceId} (detail, T028)

`Listings_get`. 200 `Listing` · 404.

```ts
const Listing = z
  .object({
    id,
    name,
    description,
    country,
    city,
    area,
    streetAddress,
    timeZone,
    currency,
    utilities,
    customUtilities,
    hasLayout: z.boolean(),
    openingHours: OpeningHours,
    offers: z.array(
      z.object({
        // offered slots only (enabled, valid for the mode, priced)
        slot: SlotKind,
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
      .object({
        // FR-012, AC 3.5; only when full_day < day + night
        day: Saving.nullable(),
        week: Saving.nullable(),
        month: Saving.nullable(),
      })
      .nullable(),
    isOwnSpace: z.boolean(), // lets the UI hide booking (edge: owners can't book their own)
  })
  .meta({ id: 'Listing' });
const Saving = z.object({ amount: Money, percent: z.int() }); // percent rounded half-up (R-8)
```

## GET /api/listings/{spaceId}/seats (seat availability for a pass, T035)

`Listings_seatAvailability`. Query `SeatAvailabilityInput { pass: PassType, slot: SlotKind, startDate: LocalDate }`.

```ts
const ListingSeatAvailability = z
  .object({
    space: z.object({ id: z.uuid(), name: z.string(), timeZone: TimeZone }),
    pass: PassType,
    slot: SlotKind,
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
        status: z.enum(['free', 'taken', 'closed']), // closed: the seat's calendar closes the start date (AC 6.4)
        firstStartsAt: Instant.nullable(),
        lastEndsAt: Instant.nullable(), // end date and time (AC 4.4); null when closed
        includedDates: z.number().int(),
        closedDates: z.array(LocalDate), // skipped days (AC 6.4)
      }),
    ), // ordered by label
  })
  .meta({ id: 'ListingSeatAvailability' });
```

- `taken` = an active hold (booking or occupancy) overlaps any occurrence. Who holds it is never exposed.
- Pass not offered → 422 `booking-rule:pass-not-offered`. Unknown or unpublished space → 404. Past or far start
  dates are viewable (the booking rules apply on `POST`), mirroring 001's "rule-breaking windows are viewable".
- Performance: SC-004 (research R-10).

## GET /api/listings/{spaceId}/layout (renter plan, T062)

`Listings_layout`. 200 `ListingLayout { columns, rows, elements: [{ kind, seatId (nullable), label, x, y, w, h }] }`
· 404 when the space has no layout or is not published (AC 8.5). Free and taken states come from the seat
availability response, joined by `seatId` in the web (AC 8.4).

## POST /api/listings/{spaceId}/bookings (create, T036)

See [bookings.md](./bookings.md#post-apilistingsspaceidbookings).
