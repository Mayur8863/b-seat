# Contract: bookings

Module `apps/api/src/bookings/`. Controller `BookingsController` (`@ApiTags('bookings')`,
`@Controller('bookings')`, `@UseGuards(AuthGuard)`). Every query is scoped to
`session.user.id` (FR-011).

## Shared response schema

```ts
const BookingSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    date: LocalDate, // space-local
    startTime: LocalTime, // space-local
    endTime: LocalTime, // space-local
    timeZone: z.string(), // the space's IANA zone (label times with it in the UI)
    startsAt: Instant, // UTC
    endsAt: Instant, // UTC
    seat: z.object({ id: z.uuid(), label: z.string() }),
    space: z.object({ id: z.uuid(), name: z.string(), location: z.string() }),
    createdAt: Instant,
    cancelledAt: Instant.nullable(),
  })
  .meta({ id: 'Booking' });

const BookingListSchema = z.object({ items: z.array(BookingSchema) }).meta({ id: 'BookingList' });
```

The response never includes `userId` or any other user's data.

## POST /api/bookings

Book one seat for a local window (FR-004 to FR-008, AC 2.1 to 2.6).

- **Handler**: `BookingsController.create`, operation id `Bookings_create`, hook `useBookingsCreate`
- **Body** `CreateBookingInput`:

```ts
const CreateBookingInput = z
  .object({
    seatId: z.uuid(),
    date: LocalDate,
    startTime: LocalTime,
    endTime: LocalTime,
  })
  .meta({ id: 'CreateBookingInput' });
```

The booking is always for the caller. There is no `userId` input.

- **Processing**:
  1. Load the seat and its space. If it is missing, return 404 "Seat not found".
  2. `evaluateBookingRules(window, space.timeZone, clock.now())`. On a violation, return 422 with the per-rule `type`.
  3. Insert `booking(status='active')`. Map SQLSTATE `23P01` by constraint name to 409 `seat-unavailable` or 409 `user-overlap`.
  4. After commit, enqueue the confirmation email (jobId `booking-confirmed:<id>`). Enqueue errors are logged and swallowed (FR-008).
  5. Log `booking.created { bookingId, seatId }` (no email address).
- **201** `Booking` (`@ApiCreatedResponse({ standardSchema: BookingSchema })`)
- **400** validation · **401** · **404** seat not found · **409** `booking:seat-unavailable` | `booking:user-overlap` · **422** `booking-rule:*`

## GET /api/bookings

The caller's bookings that have not ended yet, soonest first (FR-009, AC 3.1, AC 3.2).

- **Handler**: `BookingsController.listMine`, operation id `Bookings_listMine`, hook `useBookingsListMine`
- **Request**: none (no query parameters in this slice; the rules bound the list size, research R-9 and plan Scale)
- **Filter**: `user_id = caller AND status = 'active' AND ends_at > $now`, ordered by `starts_at ASC, id ASC`
- **200** `BookingList`. An empty list is `{ "items": [] }`.
- **401**

## POST /api/bookings/{bookingId}/cancel

Cancel one of the caller's bookings that has not started (FR-010, AC 3.3 to 3.5). This is a soft cancel, and the row is kept.

- **Handler**: `BookingsController.cancel`, operation id `Bookings_cancel`, hook `useBookingsCancel`
- **Path**: `bookingId`, validated as `z.uuid()`
- **Processing** (`$now` = `clock.now()`, passed as a parameter so tests control time): run one `UPDATE booking SET status='cancelled', cancelled_at=$now WHERE id=$1 AND user_id=$caller AND status='active' AND starts_at > $now RETURNING *`.
  If no row is updated, re-read with `id AND user_id = caller` to choose the response:
  - no row: **404** "Booking not found" (same response for a missing booking and someone else's, FR-011, AC 3.4)
  - already `cancelled`: **200** with the booking (idempotent; open question 2)
  - `starts_at <= now`: **409** `booking:already-started` (AC 3.5)
- **200** `Booking` (status `cancelled`, `cancelledAt` set)
- **400** validation (malformed id) · **401** · **404** · **409** `booking:already-started`
- Log `booking.cancelled { bookingId }`.

Using `POST …/cancel` instead of `DELETE` makes the state transition explicit and keeps the row
for history (spec assumption: soft cancel).

## Examples

`POST /api/bookings`

```json
{ "seatId": "…", "date": "2026-10-23", "startTime": "09:00", "endTime": "12:00" }
```

`201`

```json
{
  "id": "…",
  "status": "active",
  "date": "2026-10-23",
  "startTime": "09:00",
  "endTime": "12:00",
  "timeZone": "Europe/London",
  "startsAt": "2026-10-23T08:00:00.000Z",
  "endsAt": "2026-10-23T11:00:00.000Z",
  "seat": { "id": "…", "label": "A-03" },
  "space": { "id": "…", "name": "London HQ", "location": "London, United Kingdom" },
  "createdAt": "2026-10-22T14:03:11.402Z",
  "cancelledAt": null
}
```

`409`

```json
{
  "type": "urn:bseat:problem:booking:seat-unavailable",
  "title": "Seat unavailable",
  "status": 409,
  "detail": "This seat is no longer available for that time.",
  "instance": "/api/bookings",
  "requestId": "…"
}
```
