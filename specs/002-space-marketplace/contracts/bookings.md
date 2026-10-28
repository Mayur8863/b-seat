# Contract: pass bookings

Module `apps/api/src/bookings/` (the hourly create is removed in T008). Renter-side reads and writes are scoped to
`booking.user_id = caller` and `booking.kind = 'pass'`; not yours → the same 404 as a random UUID (FR-028).

## Shared response schema

```ts
const BookingSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    pass: PassType,
    slot: SlotKind,
    startDate: LocalDate,
    endDate: LocalDate, // local period (AC 7.1)
    timeZone: TimeZone, // label every time with it (FR-033)
    slotTimes: z.object({ startTime: LocalTime, endTime: LocalTime, endsNextDay: z.boolean() }),
    firstStartsAt: Instant,
    lastEndsAt: Instant,
    days: z.array(z.object({ date: LocalDate, startsAt: Instant, endsAt: Instant })), // included occurrences
    skippedDates: z.array(LocalDate), // closed days (AC 6.4)
    seat: z.object({ id: z.uuid(), label: z.string(), cubicleName: z.string().nullable() }),
    space: z.object({
      id: z.uuid(),
      name: z.string(),
      area: z.string(),
      city: z.string(),
      country: CountryCode,
    }),
    price: Money, // snapshot (FR-013)
    createdAt: Instant,
    cancelledAt: Instant.nullable(),
  })
  .meta({ id: 'Booking' });
const BookingListSchema = z.object({ items: z.array(BookingSchema) }).meta({ id: 'BookingList' });
```

`days` keeps the dates of holds that were created, even if a calendar later changed (FR-025).

## POST /api/listings/{spaceId}/bookings

`Bookings_create` (on `BookingsController`, path `listings/:spaceId/bookings`), hook `useBookingsCreate`.

```ts
const CreateBookingInput = z
  .strictObject({
    seatId: z.uuid(),
    pass: PassType,
    slot: SlotKind,
    startDate: LocalDate,
  })
  .meta({ id: 'CreateBookingInput' });
```

Always books for the caller. Processing:

1. Load the space with its opening hours, slot flags, price for (slot, pass), and the seat (active, in this space)
   with its calendar. An unknown or `draft` space, or an unknown, removed or other-space seat → 404. An
   `unpublished` space is loaded so the rule can be named (ADR-0010).
2. `evaluatePassBookingRules(...)` in the order of [README](./README.md#problem-types-introduced-by-this-feature)
   → 422 with the rule's `type`.
3. Compute occurrences with `pass-period.ts` (research R-5).
4. Transaction, in the lock order of ADR-0009 section 9.3: `SET LOCAL lock_timeout = '5s'`; then the space row
   `SELECT 1 FROM space WHERE id = $space FOR SHARE` (`withSeatLocks` option `beforeLocks`; this keeps one order
   with seat removal, which locks the space row `FOR UPDATE` before its seat locks); then `lockSeats([seatId])`;
   then `SELECT … FROM seat JOIN space … WHERE seat.id = $seat AND removed_at IS NULL FOR SHARE OF seat, space`
   (re-reads the space status, so an unpublish or removal that committed after step 1 is refused); insert the
   `booking` header (`kind 'pass'`, envelope, price snapshot); insert all holds in chronological order. `55P03` →
   log `booking.lock_timeout` with ids only and rethrow, no retry. Map
   `DrizzleQueryError.cause`: `23P01` + `seat_hold_seat_no_overlap` → 409 `booking:seat-unavailable`;
   `23P01` + `seat_hold_user_no_overlap` → 409 `booking:user-overlap`; `40P01` → retry the transaction (at most 3
   attempts; `warn` log `booking.insert_deadlock_retry { seatId, attempt }`); anything else → rethrow.
5. After commit, queue both emails ([booking-emails.md](./booking-emails.md)) **concurrently**
   (`Promise.allSettled`), each bounded at 2 s, so a Redis outage delays the 201 by at most 2 s in total, not 4 s.
   Failures are logged and swallowed (FR-021, ADR-0008 section 5).
6. Log `booking.created { bookingId, seatId, spaceId }`.

**201** `Booking` · **400** · **401** · **404** · **409** `booking:seat-unavailable` | `booking:user-overlap` ·
**422** `booking-rule:*` (space-not-published, own-space, pass-not-offered, start-day-closed, slot-started, too-far-ahead).

## GET /api/bookings

`Bookings_listMine`, hook `useBookingsListMine`. The caller's pass bookings with `status = 'active'` and
`ends_at > now`, ordered by `starts_at, id` (FR-026, AC 7.1). **200** `BookingList` (`{ items: [] }` when empty) · 400 · 401.
Query `ListMyBookingsInput { limit?: 1–50 }` lets the dashboard ask for the next booking only (AC 1.3). No cursor
is needed: the renter overlap rule and the 30-day horizon bound the list to a few dozen items.

## POST /api/bookings/{bookingId}/cancel

`Bookings_cancel`, hook `useBookingsCancel`. One transaction in the same lock order as create (ADR-0009 section
9.3: `lock_timeout`, the booking's space row `FOR SHARE`, then `lockSeats([seatId])`), around one statement:
`UPDATE booking SET status='cancelled', cancelled_at=$now WHERE id=$1 AND user_id=$caller AND kind='pass' AND status='active' AND starts_at > $now RETURNING *`.
`seat_hold_booking_fk` (`ON UPDATE CASCADE` from the generated `holds_active`) deactivates every hold of the
booking in the same statement (AQ-7, ADR-0009 section 3). The service never updates `seat_hold` itself. If no row
was updated, re-read scoped to the caller:

- none → **404**
- already cancelled → **200** unchanged (idempotent, ADR-0008 section 4)
- started → **409** `booking:already-started` (AC 7.2)

Log `booking.cancelled { bookingId }`. The whole period is freed.
