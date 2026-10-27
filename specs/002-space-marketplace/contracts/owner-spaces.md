# Contract: owner spaces (listing, seats, cubicles, pricing)

Module `apps/api/src/owner-spaces/`. Every controller: `@UseGuards(AuthGuard, RolesGuard)`, `@RequireRole('owner')`
(a renter gets 403). Every query is scoped by `space.owner_id = caller` in SQL; another owner's space and a
random UUID give the identical 404 (FR-009, AC 2.6). Path ids are `z.uuid()`.

## Shared schemas

```ts
const OpeningHoursInput = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('always_open'), shiftChangeAt: LocalTime }),
  z.strictObject({ mode: z.literal('fixed_hours'), opensAt: LocalTime, closesAt: LocalTime })
    .refine((v) => v.closesAt > v.opensAt, { path: ['closesAt'] }),           // OQ-7
]);                                                                            // unnamed, request only
const OpeningHours = /* same shape, response */;

const OwnerSpace = z.object({
  id: z.uuid(), status: z.enum(['draft', 'published', 'unpublished']),
  name: z.string(), description: z.string(),
  country: CountryCode, city: z.string(), area: z.string(), streetAddress: z.string(),
  timeZone: TimeZone, currency: CurrencyCode, openingHours: OpeningHours,
  utilities: z.array(StandardUtility), customUtilities: z.array(z.string()),
  seatCount: z.number().int(), hasOfferedPass: z.boolean(), hasLayout: z.boolean(),
  createdAt: Instant, updatedAt: Instant,
}).meta({ id: 'OwnerSpace' });

const OwnerSpaceSummary = z.object({
  id, status, name, city, area, country, seatCount, hasOfferedPass, upcomingBookingCount: z.number().int(),
}).meta({ id: 'OwnerSpaceSummary' });
```

Legacy spaces without an owner never appear here. **Decided (T001):** the schemas stay **non-nullable**, and the
database guarantees it. `space_owned_complete` requires every listing field once `owner_id` is set, and the seed
claims a legacy row by setting the owner and all fields in one `UPDATE` (data-model.md).

## Listing

| Route                                        | Handler / hook                            | Body                                     | Responses                                                                                                  |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/owner/spaces`                      | `OwnerSpaces_list` / `useOwnerSpacesList` |                                          | 200 `OwnerSpaceList { items: OwnerSpaceSummary[] }`, by name (AC 1.4)                                      |
| `POST /api/owner/spaces`                     | `OwnerSpaces_create`                      | `CreateSpaceInput`                       | 201 `OwnerSpace` (status `draft`; shared calendar created, AC 6.1) · 400                                   |
| `GET /api/owner/spaces/{spaceId}`            | `OwnerSpaces_get`                         |                                          | 200 `OwnerSpace` · 404                                                                                     |
| `PATCH /api/owner/spaces/{spaceId}`          | `OwnerSpaces_update`                      | `UpdateSpaceInput` (all fields optional) | 200 `OwnerSpace` · 400 · 404                                                                               |
| `POST /api/owner/spaces/{spaceId}/publish`   | `OwnerSpaces_publish`                     |                                          | 200 `OwnerSpace` · 404 · 422 `PublishIncompleteProblem` (`listing:publish-incomplete` + `missing`, AC 2.4) |
| `POST /api/owner/spaces/{spaceId}/unpublish` | `OwnerSpaces_unpublish`                   |                                          | 200 `OwnerSpace` (bookings untouched, AC 2.5) · 404                                                        |

```ts
const CreateSpaceInput = z
  .strictObject({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(2000),
    country: CountryCode,
    city: z.string().trim().min(1).max(100),
    area: z.string().trim().min(1).max(100),
    streetAddress: z.string().trim().min(1).max(200),
    timeZone: TimeZone /* refine isValidTimeZone */,
    currency: CurrencyCode,
    openingHours: OpeningHoursInput,
    utilities: z.array(StandardUtility).default([]), // unique
    customUtilities: z.array(z.string().trim().min(1).max(40)).max(5).default([]), // unique, case-insensitive
  })
  .meta({ id: 'CreateSpaceInput' });
```

Publish and unpublish are idempotent (publishing a published space returns 200). Changing `openingHours` never
changes existing bookings (edge case); only new bookings use the new slots. Log `listing.published` /
`listing.unpublished` with ids.

## Seats and cubicles (T021)

```ts
const OwnerSeat = z
  .object({
    id: z.uuid(),
    label: z.string(),
    features: z.array(z.string()),
    cubicle: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    calendar: z.enum(['shared', 'own']), // T051 fills 'own'
    today: z.object({
      // T047 (additive)
      state: z.enum(['vacant', 'occupied', 'booked']),
      note: z.string().nullable(),
      markId: z.uuid().nullable(),
    }),
  })
  .meta({ id: 'OwnerSeat' });

const CreateSeatsInput = z
  .union([
    z.strictObject({
      seats: z
        .array(z.strictObject({ label, cubicleId: z.uuid().optional(), features }))
        .min(1)
        .max(200),
    }),
    z.strictObject({
      pattern: z.strictObject({
        prefix: z.string().max(15),
        from: z.int().min(0),
        to: z.int(),
        padTo: z.int().min(1).max(4).optional(),
      }),
      cubicleId: z.uuid().optional(),
      features,
    }),
  ])
  .meta({ id: 'CreateSeatsInput' });
```

| Route                           | Body                                                           | Responses                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET …/seats`                   |                                                                | 200 `OwnerSeatList { items }` (active seats, by label)                                                                                         |
| `POST …/seats`                  | `CreateSeatsInput`                                             | 201 `OwnerSeatList` (created) · 409 `LabelTakenProblem` (`listing:label-taken` + `labels`) · 422 `listing:seat-limit` · 404 (space or cubicle) |
| `PATCH …/seats/{seatId}`        | `UpdateSeatInput { label?, cubicleId? (nullable), features? }` | 200 `OwnerSeat` · 409 `LabelTakenProblem` · 404                                                                                                |
| `DELETE …/seats/{seatId}`       |                                                                | 204 (soft removal, layout element removed) · 409 `listing:seat-has-future-bookings` · 404                                                      |
| `GET …/cubicles`                |                                                                | 200 `CubicleList { items: Cubicle { id, name, seatCount } }` (active cubicles)                                                                 |
| `POST …/cubicles`               | `CreateCubicleInput { name }`                                  | 201 `Cubicle` · 409 `listing:cubicle-name-taken` · 404                                                                                         |
| `PATCH …/cubicles/{cubicleId}`  | `UpdateCubicleInput { name }`                                  | 200 `Cubicle` · 409 `listing:cubicle-name-taken` · 404                                                                                         |
| `DELETE …/cubicles/{cubicleId}` |                                                                | 204 (soft-removes the cubicle and its seats as one unit, OQ-6) · 409 `listing:seat-has-future-bookings` · 404                                  |

All-or-nothing for bulk creation. Pattern `{ prefix: 'A-', from: 1, to: 20 }` → `A-1` … `A-20` (AC 2.3). Removal
of a seat or a cubicle is soft (`removed_at`), so past bookings keep their seat label and cubicle name.

## Pricing (T027)

```ts
const SpacePricing = z
  .object({
    currency: CurrencyCode,
    openingHours: OpeningHours,
    slots: z.array(
      z.object({
        slot: SlotKind,
        enabled: z.boolean(),
        startTime: LocalTime,
        endTime: LocalTime,
        endsNextDay: z.boolean(), // derived (R-4)
        prices: z.object({
          day: Money.nullable(),
          week: Money.nullable(),
          month: Money.nullable(),
        }),
      }),
    ), // only the kinds offered by the opening mode, in order day, night, full_day / working_hours
  })
  .meta({ id: 'SpacePricing' });

const UpdatePricingInput = z
  .strictObject({
    shiftChangeAt: LocalTime.optional(), // 24-hour spaces only (AC 3.1)
    slots: z.array(
      z.strictObject({
        slot: SlotKind,
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
```

`GET` and `PUT /api/owner/spaces/{spaceId}/pricing` (`OwnerSpaces_getPricing`, `OwnerSpaces_updatePricing`).
A slot kind not valid for the opening mode → 400. `working_hours` cannot be disabled for fixed-hours spaces
(AC 3.2). Null price → row deleted (not offered, AC 3.3). Existing bookings keep their snapshot (AC 3.6).
**200** `SpacePricing` · 400 · 404.
