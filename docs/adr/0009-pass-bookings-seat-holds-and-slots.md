# ADR-0009: Pass bookings, seat holds and the slot time model

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** architect agent (002 T001); the requester for the product decisions OQ-1 to OQ-12 (accepted 2026-10-27)
- **Amends:** [ADR-0008](0008-booking-time-and-conflict-model.md) section 1 (DST at owner-set slot boundaries only)
  and section 2 (where the exclusion constraints live and what they are named)

## Context

Feature 002 (`specs/002-space-marketplace/`) replaces 001's hourly booking with **passes**. A pass covers one
seat, one slot and 1, 7 or 30 calendar days. Days that the seat's calendar closes are skipped, and the price does
not change. Several of its choices are hard to reverse, because they shape stored data and the public contract:

- **FR-018 and SC-005:** two active bookings, or a booking and an owner's occupancy mark, must never overlap on a
  seat, including under concurrent requests. An occupancy mark may have **no end date**.
- **FR-019:** one renter must never hold two active bookings that overlap in time, at any space.
- On one seat and date, a day slot and a night slot can belong to different renters. A 24-hour slot blocks both,
  and either one blocks it. Slots that touch (19:00 end, 19:00 start) do not overlap.
- Slot boundaries are wall-clock times set by the **owner** (shift change time, opening hours) and follow the
  space's zone across daylight-saving changes. ADR-0008 section 1 refuses nonexistent and ambiguous local times,
  which made sense for times a renter types, but here it would make a whole date unbookable.
- 001's invariants are exclusion constraints on `booking` (`0002_booking_exclusions.sql`). Merged migrations
  (`0000`–`0002`) must never be edited, and drizzle-kit 0.31 still cannot express `EXCLUDE`.
- The hourly `POST /api/bookings` has never been called by the web app and has never been released.

## Decision

### 1. Storage: a booking header plus one hold per held interval (AQ-1, option A)

- `booking` becomes the **pass header**: renter, seat, space, pass, slot, `start_date`, `end_date`, a price and
  currency snapshot (FR-013), status, and `starts_at`/`ends_at` as the **envelope** (first occurrence start,
  last occurrence end). The envelope is used for sorting, "has not ended" and "has started". Legacy rows keep
  `kind = 'hourly'`.
- A new table, **`seat_hold`**, holds one row per held interval:
  - a pass gets **one row per occurrence** (`booking_id`, `user_id`, `service_date` = the local date the slot
    starts on). Closed days get no row.
  - an occupancy mark gets **exactly one row** (`occupancy_mark_id`, no user). `ends_at` is null when the mark has
    no end date, which makes the range unbounded above.
- Every hold has an `active` flag. Only active holds block.

### 2. Conflict model (supersedes the location in ADR-0008 section 2)

Two partial exclusion constraints on `seat_hold`, in a custom migration (same pattern and migration order as
ADR-0008 section 2):

```sql
EXCLUDE USING gist ("seat_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("active")
  -- seat_hold_seat_no_overlap: bookings and occupancy marks share it (FR-018, both halves of SC-005)
EXCLUDE USING gist ("user_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("active" AND "user_id" IS NOT NULL)
  -- seat_hold_user_no_overlap: per renter, across seats and spaces (FR-019); occupancy holds have no user
```

- Half-open `[)` ranges keep touching slots legal. A 24-hour occurrence overlaps both the day and night
  occurrences of that date, so "24 hours blocks both" needs no special code.
- **Writes**: a booking is one transaction. It locks the seat `FOR SHARE` (removal takes `FOR UPDATE`), inserts the
  header, then inserts every hold in one multi-row `INSERT` in chronological order. An occupancy request inserts its
  marks and holds in one transaction, ordered by `(seat_id, starts_at)`.
- **Error mapping** (read SQLSTATE and constraint from `DrizzleQueryError.cause`, as in ADR-0008):

  | SQLSTATE | Constraint                  | Booking create                                                                   | Occupancy create                                                                                                                                    |
  | -------- | --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `23P01`  | `seat_hold_seat_no_overlap` | 409 `booking:seat-unavailable`                                                   | roll back, read the overlapping holds, then 409 `occupancy:conflicts-with-bookings` (any booking hold) or `occupancy:already-occupied` (only marks) |
  | `23P01`  | `seat_hold_user_no_overlap` | 409 `booking:user-overlap`                                                       | not reachable (no user on occupancy holds)                                                                                                          |
  | `40P01`  | (deadlock)                  | retry the **whole transaction**, at most 3 attempts in total, then rethrow (500) | same                                                                                                                                                |
  | other    | any (`23503`, `23514`, ...) | rethrow → 500 (the TS rules and the DB disagree, which is a bug)                 | same                                                                                                                                                |

  Multi-row inserts deadlock more often than 001's single row, so both writers **must** retry `40P01`.

### 3. Holds cannot disagree with their source (AQ-7: enforced by the database)

The plan proposed "cancelled booking ⇒ inactive holds" as a service rule. It is a database invariant instead,
because the dangerous direction (an active booking whose holds stopped blocking) is a silent double booking:

- `booking` gains `holds_active boolean GENERATED ALWAYS AS (status = 'active') STORED` and
  `booking_hold_key_unique UNIQUE (id, seat_id, user_id, holds_active)`.
- `seat_hold_booking_fk FOREIGN KEY (booking_id, seat_id, user_id, active) REFERENCES booking (id, seat_id,
user_id, holds_active) ON UPDATE CASCADE ON DELETE CASCADE`.
- `occupancy_mark` gains `occupancy_mark_id_seat_id_unique UNIQUE (id, seat_id)`, and
  `seat_hold_occupancy_mark_fk FOREIGN KEY (occupancy_mark_id, seat_id) REFERENCES occupancy_mark (id, seat_id)
ON DELETE CASCADE`, with `UNIQUE (occupancy_mark_id)` (one hold per mark).

As a result, a booking hold always has its header's seat and renter. It is active exactly when the header is
active. Cancelling is the single statement `UPDATE booking SET status = 'cancelled' …`, and the cascade turns its
holds off in the same statement. Deactivating an active booking's hold directly, or reactivating a cancelled one,
fails with `23503`. Foreign keys use `MATCH SIMPLE`, so occupancy holds (null `booking_id`) skip the booking
key, and booking holds skip the mark key. This was verified on `postgres:18-alpine` before approval: wrong seat
or user is refused, direct deactivation is refused, cancel cascades, and reactivation is refused. Drizzle models
all of it (a generated column, a composite `unique`, and `foreignKey().onUpdate('cascade')`), so it lives in the
**generated** migration. drizzle-kit emits `STORED` explicitly, which matters because PostgreSQL 18 defaults
generated columns to `VIRTUAL`, and a virtual column cannot back a unique constraint.

For occupancy marks, the **hold is the single source of truth** for blocking and for the mark's status
(`active` and not yet ended). `occupancy_mark.ended_at` is an audit timestamp only.

Remaining limit (service plus test, not DB): the header envelope must equal the first hold's start and the last
hold's end, and a mark must have its hold. Both are written in one transaction from the same computed list.

### 4. Slot time model and DST at owner-set boundaries (AQ-2; amends ADR-0008 section 1)

- Slots are **derived, never stored as instants**. One pure module (`src/marketplace/slots.ts`) maps (opening
  hours, shift change `T`, slot, local date `D`, zone) to `[start, end)`:
  - day = `D T` to `D T+12h`
  - night = `D T+12h` to `D+1 T`
  - full_day = `D T` to `D+1 T`
  - working_hours = `D open` to `D close` (close is after open, OQ-7)

  Wall-clock addition is done first, then each boundary is converted once. A slot belongs to the date it starts on.

- **Owner-set boundaries resolve like Temporal's `disambiguation: 'compatible'`:** a wall-clock in a DST gap
  maps to the instant after the gap, and a wall-clock in an overlap maps to the earlier instant. Both cases come
  to the same rule, which is to apply the zone's offset **in force before the transition** (in `toInstant` terms,
  the offset read at `W − 24 h`). Example: London, `T = 01:30` on 2026-03-29 resolves to 01:30 UTC (02:30 BST),
  and on 2026-10-25 to 00:30 UTC (01:30 BST). This is `zoned-time.ts` `toInstantCompatible`, unit-tested
  (T006).
- Because every boundary instant comes from one function of (date, wall-clock, zone), "day ends where night
  starts" holds on every date, DST days included. Slots last 11, 12 or 13 hours (23, 24 or 25 for full_day; other
  amounts in zones with unusual shifts). `slots.ts` asserts `end > start` and throws if not; that would be a tzdata
  anomaly, not a user error.
- ADR-0008's **refusal** of nonexistent or ambiguous times still applies to wall-clock times that a **renter
  types**. After 002 no such input remains (renters send dates; the hourly routes are removed in T008 and T043).
  So `booking-rule:invalid-local-time` is not part of the 002 contract.
- `seat_hold_booking_max_length` allows up to `26 hours` for one occurrence. That covers a 24-hour slot on a
  changeover day in a zone with a 2-hour shift (`Antarctica/Troll`). The plan's 25 hours would have turned a valid
  booking into a 500.

### 5. Occupancy day boundaries (R-11)

A mark from date `S` to date `E` holds from the space's **day boundary** on `S` to the day boundary on `E + 1`.
The day boundary is the shift change time for 24-hour spaces and 00:00 for fixed-hours spaces, resolved with the
rule in section 4. A mark on `S` therefore never clips the night slot of `S − 1`, and it covers the night slot of
`E`. No end date means an unbounded hold. "Mark vacant" sets the hold's `ends_at = now` if the hold has started,
and `active = false` if it has not. Holds keep their instants when the opening hours change later.

### 6. Retiring the hourly flow (AQ-8)

The order is: T008 removes the hourly `POST /api/bookings` (a never-released operation with no consumer, which
Constitution III allows), and only then does T005 move the invariants. T005's custom migration runs in one
transaction and does four things in order:

1. creates the two `seat_hold` exclusions;
2. backfills one hold for each active, not-ended hourly booking (OQ-3);
3. adds `booking_no_new_hourly CHECK (kind <> 'hourly') NOT VALID`;
4. drops `booking_seat_no_overlap` and `booking_user_no_overlap`.

The `NOT VALID` CHECK leaves existing hourly rows in place but refuses any new or updated one. No hourly row can
therefore be written without the old constraints' protection, even if T008 and T005 were merged in the wrong order.
Legacy rows become read-only history; deleting them, for example through the user cascade, still works. Validating
the CHECK, or dropping the hourly rows and columns, is a later contract migration.

### 7. Query rule for the hold index

The partial GiST index behind `seat_hold_seat_no_overlap` serves the availability and conflict reads only when:

- the predicate spells `seat_hold.active` and `tstzrange(starts_at, ends_at, '[)')` as the constraint does (as in
  ADR-0008), **and**
- the seats are joined in (`FROM seat JOIN seat_hold ON seat_hold.seat_id = seat.id AND … WHERE seat.space_id =
$1`).

Do not use `seat_id = ANY($ids)`. On PG 18 with 2,000 seats × a year of holds, the `ANY` form chose the btree on
`seat_id` and filtered 133,600 rows. The join form probed the GiST index once per seat and filtered none.

### 8. Problem-details extension members (AQ-3)

`ProblemSchema` stays unchanged. Each problem type that carries extra members gets its own named **response**
schema built with `ProblemSchema.extend({...}).meta({ id })`, and only the route and status that emit it document
it:

- `PublishIncompleteProblem` (`missing`)
- `LabelTakenProblem` (`labels`)
- `OccupancyConflictProblem` (`conflicts`)

`ProblemException` gains an optional `extensions` record. `ProblemFilter` writes the extensions first and the
standard members last, so an extension can never override `type`, `status` or `title` (RFC 9457 section 3.2).

## Alternatives considered

- **(B) Occurrence rows in the existing `booking` table** with a separate pass header: the 001 constraints keep
  working, but occupancy marks would have to become `booking` rows with a nullable `user_id`, and "booking" would
  mean a day-occurrence.
- **(C) One `tstzmultirange` per booking:** one row per booking, but Drizzle has no multirange type, occupancy
  still needs a row in the same table, conflict dates need `unnest`, and exclusion over multiranges needs its own
  spike.
- **An envelope range per booking:** wrongly blocks a different renter's night slot between two day slots.
- **Cancel consistency in the service only (the plan's AQ-7 proposal):** a plausible bug, such as deactivating
  holds when the header update matched no row, silently reopens a booked seat. The composite FK costs one
  generated column and one unique index.
- **A trigger for hold consistency or overlaps:** hidden logic, and overlap checks are not concurrency-safe
  without explicit locks.
- **Refusing DST-gap boundaries (ADR-0008 as written):** one owner setting (`T = 01:30`) would make a date
  unbookable for every renter, with nothing the renter can fix.
- **`make_timestamptz` / `AT TIME ZONE` in SQL for slots:** silently shifts gap times, and duplicates the slot
  rules outside `slots.ts`.
- **Optional extension members on `ProblemSchema`:** additive, but every error response in the generated client
  would claim it might carry `conflicts`, `labels` and `missing`.
- **Deleting holds on cancel:** loses the booking's `days` for display, and the invariant stays cross-table.

## Consequences

- No double booking, booking-versus-mark overlap, or renter double holding can be committed, whatever the
  concurrency. No code path can leave an active booking without blocking holds.
- At most 30 hold rows per booking, and one per occupancy mark. History grows by about 2 rows per seat per day at
  full utilisation. The join-form query keeps reads independent of history size.
- `booking` no longer carries any exclusion constraint. It holds two generations of rows: legacy hourly rows
  (read-only, still blocking through their backfilled holds) and pass headers. Anyone changing `seat_hold`, `booking.status` or the range expression must read this
  ADR and the custom migration.
- `booking.holds_active` is a stored generated column. Changing `booking_status` values needs a new migration
  that recreates it.
- Follow-ups: the contract migration for hourly rows (validate or drop `booking_no_new_hourly`, drop
  `space.location`, make `space.owner_id` NOT NULL); a transactional outbox for the two booking emails (ADR-0008
  section 5 trigger); rate limiting on booking writes (OQ-10); `Temporal` when Node ships it unflagged.
