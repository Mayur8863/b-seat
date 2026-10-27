# Contract: owner operations (calendars, occupancy, owner bookings, layout)

Module `apps/api/src/owner-operations/`. Same guards and scoping as [owner-spaces.md](./owner-spaces.md).

## Calendars (T051)

```ts
const Calendar = z
  .object({
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
    weekdays: z.array(Weekday).min(1),
  })
  .meta({ id: 'Calendar' });
const CalendarInput = z
  .strictObject({
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
    weekdays: z.array(Weekday).min(1),
  })
  .refine((c) => c.endDate === null || c.endDate >= c.startDate, { path: ['endDate'] })
  .meta({ id: 'CalendarInput' });
const CalendarChange = z // renamed from `CalendarUpdate` in T001: `Update…` reads as a request name
  .object({
    calendar: Calendar.nullable(), // null after switching a seat back to shared
    bookingsOutsideCalendar: z.number().int().nonnegative(), // FR-025, AC 6.5
  })
  .meta({ id: 'CalendarChange' });
```

| Route                                                        | Body            | Responses                                                                                                        |
| ------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/owner/spaces/{spaceId}/calendars`                  |                 | 200 `SpaceCalendars { shared: Calendar, seats: [{ seatId, label, calendar: Calendar }] }` (seats with their own) |
| `PUT /api/owner/spaces/{spaceId}/calendars/shared`           | `CalendarInput` | 200 `CalendarChange` (counts bookings on seats using shared)                                                     |
| `PUT /api/owner/spaces/{spaceId}/seats/{seatId}/calendar`    | `CalendarInput` | 200 `CalendarChange` (seat switches to its own, AC 6.3)                                                          |
| `DELETE /api/owner/spaces/{spaceId}/seats/{seatId}/calendar` |                 | 200 `CalendarChange` (`calendar: null`; back to shared)                                                          |

`bookingsOutsideCalendar` = active pass bookings that have not ended, on the affected seats, with at least one
occurrence (`seat_hold.service_date`, still active) on a date the new calendar closes. Bookings are never changed.

## Occupancy (T047)

```ts
const MarkOccupiedInput = z
  .strictObject({
    seatIds: z.array(z.uuid()).min(1).max(200),
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
    note: z.string().trim().max(200).nullable(),
  })
  .meta({ id: 'MarkOccupiedInput' });
const OccupancyMark = z
  .object({
    id: z.uuid(),
    seat: z.object({ id: z.uuid(), label: z.string() }),
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
    note: z.string().nullable(),
    startsAt: Instant,
    endsAt: Instant.nullable(),
    status: z.enum(['active', 'ended']),
  })
  .meta({ id: 'OccupancyMark' });
```

| Route                                                     | Body                       | Responses                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/owner/spaces/{spaceId}/occupancy?seatId=`       | query `ListOccupancyInput` | 200 `OccupancyMarkList` (marks that have not ended, on active seats)                                                                                                               |
| `POST /api/owner/spaces/{spaceId}/occupancy`              | `MarkOccupiedInput`        | 201 `OccupancyMarkList` · 409 `OccupancyConflictProblem` (`occupancy:conflicts-with-bookings` or `occupancy:already-occupied`, with `conflicts`) · 404 (any seat not in the space) |
| `POST /api/owner/spaces/{spaceId}/occupancy/{markId}/end` |                            | 200 `OccupancyMark` (`status: ended`; idempotent) · 404                                                                                                                            |

The hold range follows research R-11: day boundary to day boundary, open-ended when `endDate` is null. All seats
go in one transaction, with holds inserted in `(seat_id, starts_at)` order. On `40P01` the whole transaction
retries, at most 3 attempts in total (ADR-0009 section 2). On `23P01` it rolls back, then the overlapping holds
are read to build `conflicts`:

- any renter booking hold → `conflicts-with-bookings`
- only the owner's own marks → `already-occupied`

`seatIds` are de-duplicated before insert. `OccupancyMark.status`, `startsAt` and `endsAt` come from the mark's
hold, which is the source of truth (ADR-0009 section 3). Renters only ever see `taken`; notes appear only here and
in `OwnerSeat.today` (FR-022, AC 5.4). Log `occupancy.marked` / `occupancy.ended` with ids, never the note.

## Owner bookings (T056)

`GET /api/owner/spaces/{spaceId}/bookings?from=&to=&cursor=&limit=` (`OwnerOperations_listBookings`), query
`ListOwnerBookingsInput`. `from` and `to` are optional `LocalDate`s. The list holds active bookings that have not
ended and have an occurrence (`seat_hold.service_date`) in `[from, to]`, soonest first (`starts_at, id`)
(FR-027, AC 7.3). It is **paged** (architect, T001): a 200-seat space can hold thousands of upcoming bookings.
`limit` is 1–100 (default 50), and `cursor` is opaque (`starts_at`, `id` keyset). A malformed cursor gives 400.

```ts
const OwnerBooking = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    renter: z.object({ name: z.string(), email: z.email() }),
    seat: z.object({ id: z.uuid(), label: z.string() }),
    pass: PassType,
    slot: SlotKind,
    startDate: LocalDate,
    endDate: LocalDate,
    timeZone: TimeZone,
    firstStartsAt: Instant,
    lastEndsAt: Instant,
    price: Money,
    createdAt: Instant,
  })
  .meta({ id: 'OwnerBooking' });
```

**200** `OwnerBookingList { items, nextCursor }` · 400 (`to < from`, bad cursor) · 403 (renter) · 404. Cancelled bookings
are excluded.

## Layout (T062)

```ts
const LayoutElement = z.object({
  id: z.uuid(),
  kind: z.enum(['seat', 'cubicle', 'area']),
  seatId: z.uuid().nullable(),
  cubicleId: z.uuid().nullable(),
  label: z.string(), // seat label / cubicle name / area label
  x: z.int(),
  y: z.int(),
  w: z.int(),
  h: z.int(),
});
const OwnerLayout = z
  .object({
    columns: z.int(),
    rows: z.int(),
    version: z.int(),
    elements: z.array(LayoutElement),
    unplacedSeatIds: z.array(z.uuid()), // AC 8.2 tray
  })
  .meta({ id: 'OwnerLayout' });
const SaveLayoutInput = z
  .strictObject({
    version: z.int().nonnegative(),
    columns: z.int().min(10).max(80),
    rows: z.int().min(10).max(80),
    elements: z
      .array(
        z.strictObject({
          kind: z.enum(['seat', 'cubicle', 'area']),
          seatId: z.uuid().optional(),
          cubicleId: z.uuid().optional(),
          label: z.string().trim().min(1).max(40).optional(), // areas only
          x: z.int().min(0),
          y: z.int().min(0),
          w: z.int().min(1),
          h: z.int().min(1),
        }),
      )
      .max(600),
  })
  .meta({ id: 'SaveLayoutInput' });
```

| Route                                    | Responses                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/owner/spaces/{spaceId}/layout` | 200 `OwnerLayout` (an empty layout with `version: 0` when none exists) · 404                                                   |
| `PUT /api/owner/spaces/{spaceId}/layout` | 200 `OwnerLayout` (`version + 1`) · 409 `layout:stale-version` · 422 `layout:out-of-bounds` · 404 (unknown seat or cubicle id) |

The PUT replaces geometry and areas only. Seats and cubicles are created, renamed and deleted through their own
routes (research R-12).
