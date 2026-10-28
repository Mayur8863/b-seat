# ADR-0009: Pass bookings, seat holds and the slot time model

- **Status:** Accepted. Amended 2026-10-27 by section 9 (seat-hold write locks, after the 001 race fix in
  ADR-0008 section 2); section 2's write steps and `40P01` note are updated to match. Amended 2026-10-28 in
  section 3 (booking header identity is immutable, T005 review follow-up). Amended 2026-10-28 in section 9
  (lock order: the space row comes before the seat locks, and `lock_timeout` before the space row; code review
  A4); section 2's write steps and the Consequences are updated to match. Amended 2026-10-28 in section 9.3 (the
  photo writers of spec 003, [ADR-0011](0011-space-photo-storage.md) section 8).
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
- **Writes** (lock order in section 9.3): a booking is one transaction. It locks the space row `FOR SHARE`, then
  takes the seat lock (section 9), then locks the seat `FOR SHARE`, inserts the header, then inserts every hold in
  one multi-row `INSERT` in chronological order. An occupancy request locks the space row `FOR SHARE`, then takes
  the locks of all its seats, then inserts its marks and holds in one transaction, ordered by
  `(seat_id, starts_at)`. Seat removal locks the space row `FOR UPDATE` before the seat locks, so it never runs
  beside either of them.
- **Error mapping** (read SQLSTATE and constraint from `DrizzleQueryError.cause`, as in ADR-0008):

  | SQLSTATE | Constraint                  | Booking create                                                                   | Occupancy create                                                                                                                                    |
  | -------- | --------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `23P01`  | `seat_hold_seat_no_overlap` | 409 `booking:seat-unavailable`                                                   | roll back, read the overlapping holds, then 409 `occupancy:conflicts-with-bookings` (any booking hold) or `occupancy:already-occupied` (only marks) |
  | `23P01`  | `seat_hold_user_no_overlap` | 409 `booking:user-overlap`                                                       | not reachable (no user on occupancy holds)                                                                                                          |
  | `40P01`  | (deadlock)                  | retry the **whole transaction**, at most 3 attempts in total, then rethrow (500) | same                                                                                                                                                |
  | other    | any (`23503`, `23514`, ...) | rethrow → 500 (the TS rules and the DB disagree, which is a bug)                 | same                                                                                                                                                |

  Multi-row inserts deadlock more often than 001's single row. The seat locks of section 9 remove same-seat
  deadlocks; `40P01` is still retried by both writers (the renter rule across seats, and defence in depth).

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

**Header identity is immutable (amendment 2026-10-28, T005 review follow-up).** `ON UPDATE CASCADE` on
`seat_hold_booking_fk` exists only so that cancelling (`holds_active` true → false) turns the holds off. The same
cascade would also carry the holds along if a header's `seat_id` or `user_id` changed: the booking would silently
move to another seat or renter with no booking rule, lock, email or audit. The exclusions would still re-check the
moved holds, so no overlap could be committed, but the move itself would be wrong. So:

- After insert, a booking header changes only by the cancel transition (`status`, `cancelled_at`; the generated
  `holds_active` follows). `id`, `seat_id`, `user_id` and `space_id` are **immutable**, and so are the pass,
  slot, dates, envelope and price snapshot (FR-013). No route moves a booking to another seat or renter (spec:
  owners cannot move bookings), and a future feature that needs one cancels and re-books.
- **DB guard for the key columns (T036).** A custom migration adds `booking_identity_immutable`: a
  `BEFORE UPDATE OF id, seat_id, user_id, space_id ON booking FOR EACH ROW` trigger whose function raises
  `check_violation` (`23514`) with `CONSTRAINT = 'booking_identity_immutable'` when
  `(NEW.id, NEW.seat_id, NEW.user_id, NEW.space_id) IS DISTINCT FROM (OLD.id, OLD.seat_id, OLD.user_id,
OLD.space_id)`. Under section 2's mapping that is "other → 500", which is right: only a bug can reach it. These
  are the columns that the hold FK cascades or the composite FKs pin. The snapshot columns stay a service rule
  (no update path writes them), so the trigger does not depend on columns a later contract migration may drop.
- Why a trigger, when the alternatives below reject triggers: those were for cross-row overlap and consistency
  logic, which is not concurrency-safe without locks. This one reads only `OLD` and `NEW` of its own row, so it
  is concurrency-safe and has no hidden reads. Column privileges (`REVOKE UPDATE (seat_id, user_id)`) were
  considered and rejected: they do not bind the table owner, which is the role the API connects as. Changing the
  FK to `ON UPDATE NO ACTION` would make every cancel fail, because cancel changes the referenced
  `holds_active`.
- T005's migrations are not changed and T005 is not reopened; the guard is a new migration in T036.

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
  amounts in zones with unusual shifts). `slots.ts` asserts `end > start` and throws if not. The cause is a tzdata
  anomaly or owner fixed hours that both fall inside one DST gap (for example 02:30-03:15 in New York on
  2026-03-08); `passPeriod` treats that date as closed (skipped, no occurrence) rather than failing. The shift
  change time is limited to 00:00-11:59 so the night slot starts on its own date.
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

### 9. Seat-hold write locks (amendment 2026-10-27)

001 showed that exclusion constraints alone deadlock under contention: racing inserts meet inside the constraint
check, each `40P01` costs `deadlock_timeout` (1 s), and 3 attempts ran out (ADR-0008 section 2, amendment). Every
transaction that **inserts active `seat_hold` rows** follows this rule: pass booking create (T036) and occupancy
create (T047). T005 adds the helper. The writers that end, deactivate or remove (booking cancel, occupancy end,
seat and cubicle removal) take the same seat locks in the same position (amended 2026-10-28; the first text said
they take none). They cannot create an overlap, but removal needs the locks to exclude a racing booking during its
future-bookings check (R-15), and cancel and end take them so that every writer of a seat's holds queues in one
place and follows one order (item 3). Test fixtures that insert holds directly to prove the constraints do not
lock.

1. **Key: one lock per seat, namespaced.** `pg_advisory_xact_lock(1112735745, hashtext(seat_id::text))`, the
   two-`int4` form. The class `1112735745` (`0x42530001`) means "seat-hold write". The two-int key space does not
   overlap the `bigint` form (PostgreSQL docs, advisory lock functions), so 001's `hashtextextended` lock and
   libraries that use bigint keys cannot collide with it. A new lock class takes the next value and is added
   here. One helper, `lockSeats(tx, seatIds)`, holds the constant and the SQL. No other code calls
   `pg_advisory_*`.
2. **Order: ascending lock key, deduplicated, in one statement.** Sort by the **key**, not by seat id: two seats
   can share a 32-bit hash, and only key order is free of lock-order cycles. A collision only adds queueing.

   ```sql
   SELECT pg_advisory_xact_lock(1112735745, k)
   FROM (SELECT DISTINCT hashtext(id::text) AS k FROM unnest($1::uuid[]) AS t(id) ORDER BY k) AS keys;
   ```

   A subquery with `ORDER BY` is not flattened, so the locks are taken in its order. A pass books one seat and
   passes one id. Occupancy passes all its de-duplicated seat ids (at most 200 per space, so at most 200 locks).
   That fits the shared lock table (`max_locks_per_transaction` × connections). Re-check this before raising the
   seat cap.

3. **Position: after `lock_timeout` and the space row, before every other row lock (amended 2026-10-28).** Every
   attempt of every writer in the table below takes its locks in this canonical order. A writer skips the steps it
   does not need, but never reorders them:
   1. `SET LOCAL lock_timeout = '5s'` (item 4).
   2. **The space row, exactly one.** `FOR SHARE` for writers that add or end holds or marks on seats that stay;
      they run beside each other and first meet at the seat locks. `FOR UPDATE` (an `UPDATE space …` statement
      counts) for writers that remove seats or cubicles or change the space's configuration; they exclude every
      other writer of that space.
   3. **`lockSeats(tx, seatIds)`**: all of the transaction's seat locks in one call, in ascending key order
      (item 2).
   4. **The seat rows** (`FOR SHARE` in booking create, `UPDATE seat` in removal), then the booking, hold and mark
      rows of those seats.
   5. **The inserts**: the booking header, then its holds in chronological order; marks and holds in
      `(seat_id, starts_at)` order.

   | Writer                                         | Code                                                  | Space row                          | Seat locks                 | After the seat locks                                        |
   | ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | -------------------------- | ----------------------------------------------------------- |
   | Booking create                                 | `BookingsService.create`                              | `FOR SHARE` (`beforeLocks`)        | the seat                   | seat and space `FOR SHARE`, insert header and holds         |
   | Booking cancel                                 | `BookingsService.cancel`                              | `FOR SHARE` (`beforeLocks`)        | the seat                   | `UPDATE booking` (the FK cascades its holds inactive)       |
   | Occupancy mark                                 | `OccupancyService.mark`                               | `FOR SHARE` (`beforeLocks`)        | every requested seat       | read the seats, insert marks and holds                      |
   | Occupancy end                                  | `OccupancyService.end`                                | `FOR SHARE` (`beforeLocks`)        | the mark's seat            | hold and mark `FOR UPDATE`, update them                     |
   | Seat delete                                    | `OwnerSeatsService.deleteSeat`                        | `FOR UPDATE`                       | the seat                   | future-bookings check, `UPDATE seat`, delete layout element |
   | Cubicle delete                                 | `OwnerSeatsService.deleteCubicle`                     | `FOR UPDATE`                       | the cubicle's active seats | future-bookings check, `UPDATE` seats and cubicle, layout   |
   | Seat create and update, cubicle create, rename | `OwnerSeatsService`                                   | `FOR UPDATE`                       | none                       | `updateSeat` locks the seat `FOR UPDATE`; inserts, updates  |
   | Layout save                                    | `LayoutService.save`                                  | `FOR UPDATE`                       | none                       | layout rows                                                 |
   | Publish, pricing                               | `OwnerSpacesService.publish`, `updatePricing`         | `FOR UPDATE`                       | none                       | space, slot and price rows                                  |
   | Space edit, unpublish                          | `OwnerSpacesService.update`, `unpublish`              | `UPDATE space` (its implicit lock) | none                       | slot rows                                                   |
   | Calendar writes                                | `CalendarsService.putShared`, `putSeat`, `removeSeat` | `FOR UPDATE`                       | none                       | calendar rows                                               |
   | Photo add (003)                                | `SpacePhotosService.add`                              | `FOR UPDATE` (with `owner_id`)     | none                       | count, delete the upload intent, insert the photo at n + 1  |
   | Photo describe (003)                           | `SpacePhotosService.describe`                         | `FOR UPDATE` (with `owner_id`)     | none                       | `UPDATE` the photo                                          |
   | Photo reorder (003)                            | `SpacePhotosService.reorder`                          | `FOR UPDATE` (with `owner_id`)     | none                       | read the photo ids, one `UPDATE` of all positions           |
   | Photo delete (003)                             | `SpacePhotosService.remove`                           | `FOR UPDATE` (with `owner_id`)     | none                       | delete the photo, one `UPDATE` renumber, insert purge row   |

   > **Amendment 2026-10-28 (003 T001, ADR-0011 section 8).** The four photo writers are added above. Each one
   > sets `lock_timeout` first and then locks exactly one space row `FOR UPDATE`, in the statement that also
   > checks `owner_id` (0 rows is a 404). They take no seat locks, and they run no storage I/O while they hold a
   > lock: objects are written before the transaction and deleted by the purge sweep after it. `FOR UPDATE`, not
   > `FOR SHARE`, because photo writers must queue behind each other (the 10-photo count and gap-free
   > positions), and photos change the listing's content. Their transactions hold the row for milliseconds, so
   > bookings of the space barely notice. Two new statements are **not** writers in this table: the upload-intent
   > insert and the purge sweep. They lock only `photo_object_purge` rows, never a space, seat or photo row, so
   > they cannot close a cycle. On `55P03` a photo writer logs `warn` `photo.lock_timeout` (item 4).

   **Why this order cannot deadlock.** A `FOR UPDATE` writer is the only holder of its space row, so no writer of
   that space holds a seat lock or a seat row that it will ask for. `FOR SHARE` writers do not block each other at
   step 2 and first meet at step 3, where key order rules out a cycle. Every lock after step 3 is on rows of seats
   whose seat lock the writer already holds. A hash collision can make a writer wait at step 3 on a writer of
   another space, but that writer holds only its own space row and never asks for another, so the wait cannot
   close a cycle. The only `40P01` left is the renter rule across seats (item 5). The code review of 002 (A4)
   checked every writer in the table against this order.

   **Rule for new writers.**
   - Follow the five steps. With `withSeatLocks`, lock the space row in `beforeLocks`, which runs after
     `lock_timeout` and before `lockSeats`. Without it, set `lock_timeout`, lock the space row, then call
     `lockSeats`.
   - Lock exactly one space row, before any seat lock, and no space row after it. A writer that needs two spaces
     needs an amendment here first (space rows in id order, all before any seat lock).
   - Use `FOR SHARE` only if the writer adds or ends holds or marks on seats that stay. A writer that removes or
     changes seats, cubicles, the layout, prices, calendars or the space's status uses `FOR UPDATE`.
   - Take every seat lock in one `lockSeats` call. Never lock or update a seat, booking, hold or mark row before
     it.
   - Only database statements run while the locks are held (emails are queued after commit). Each retry is a new
     transaction and takes every lock again from step 1. Transaction-scoped locks are released at commit or
     rollback and are safe behind a transaction-mode pooler.
   - Add the writer to the table, and cover it with an integration race against seat delete and booking create,
     as `pass-bookings.int-spec.ts` (removal racing a booking) and `occupancy.int-spec.ts` (marking racing a seat
     delete) do.

   > **Amendment 2026-10-28 (code review A4).** This item first read "Position: first in every attempt … then
   > `lockSeats`, and only then the seat `FOR SHARE` (or any other row lock)". The code does not work that way, and
   > cannot. Seat removal (T021) must lock the space row `FOR UPDATE`, because the listing writers and the 200-seat
   > cap serialise on it (R-15), and only then take the seat locks for its future-bookings check. A booking that
   > took the seat lock first and the space row second deadlocked against it, and the removal got a 500. The fix
   > (`e1e7dde`) added the `beforeLocks` option to `withSeatLocks`, and every hold writer now takes the space row
   > first. This item now records the order the code uses. A writer that followed the first text would deadlock
   > against `deleteSeat`. **Cost:** each hold writer takes a shared lock on its space row. `FOR SHARE` lockers do
   > not block each other, so bookings of one space still run concurrently. Owner configuration writes queue behind
   > in-flight bookings and the other way round, which is intended: an unpublish waits for a booking that has
   > already passed its checks. Many concurrent share lockers of one row use a MultiXact, which is cheap at the
   > expected booking rate.

4. **`lock_timeout` is required (5 s), and it comes before the space row (amended 2026-10-28).** Without it, one
   stuck transaction makes every request for that seat or space wait while holding a pool connection, which can
   starve the whole API. 5 s is above `deadlock_timeout` (1 s locally and on RDS), so a real cycle still ends as
   `40P01` (retried) before the timeout fires. It is also far above the normal queue (about 10 ms per attempt × 20
   racers). The timeout also bounds the row-lock and constraint-check waits in the same transaction. `55P03`
   (`lock_not_available`) is **not retried**, because it has already waited 5 s. Log `warn` `booking.lock_timeout`
   or `occupancy.lock_timeout` with ids only, then rethrow (500): it signals an incident. The contract is
   unchanged.

   **Rule:** every writer in the item 3 table sets `lock_timeout` as its first statement, before the space row,
   because the space row is the first lock it can wait on. That includes the writers that take no seat lock: a
   `FOR UPDATE` on the space row waits for every in-flight booking of that space. On a `55P03` such a writer logs
   `warn` with ids only and rethrows (500), like the hold writers. **Known gap (code review minor, 2026-10-28):**
   the hold writers and `CalendarsService` comply. `OwnerSeatsService` (seat create and update, cubicle create and
   rename), `LayoutService.save` and `OwnerSpacesService` (`update`, `publish`, `unpublish`, `updatePricing`) set no
   `lock_timeout`, and `deleteSeat` and `deleteCubicle` set it only after the space row. This is no deadlock risk
   (the order is right), only an unbounded wait, so it does not block 002. It is a follow-up task for backend-dev.
   **Resolved 2026-10-29:** fixed in a20525a. All writers now use `withLockTimeout`.

5. **The renter rule stays retry-only.** There is no per-renter lock. `seat_hold_user_no_overlap` can still
   deadlock when one renter books two different seats at once, because each transaction holds a different seat
   lock. `40P01` retries the whole transaction (at most 3 attempts), and the retry ends in `23P01` → 409
   `booking:user-overlap`. The fan-in is one person's concurrent requests, and a second lock class would add an
   ordering rule for every writer. Revisit this (a renter lock, class `0x42530002`, taken **after** the seat lock)
   only if `booking.insert_deadlock_retry` warnings for different seats persist after rate limiting (OQ-10).
   Occupancy holds have no user, so with the seat locks occupancy create should never see `40P01`. It keeps the
   retry as defence in depth.
6. **Proof.** T005's raw-constraint race (no locks) still proves the invariant and may see `40P01`. The service
   race tests in T036 and T047 must show that the locks work:
   - 20 concurrent bookings for one seat by 20 renters → exactly 1 × 201 and 19 × 409 `seat-unavailable`, with no
     5xx and no deadlock-retry warning.
   - Two occupancy requests over the same seats passed in opposite order → one 201 and one 409, with no `40P01`.
   - Seat removal racing a booking, and marking racing a seat delete → never a 5xx. Removal does not retry
     `40P01`, so a lock-order deadlock would show as its 500 (item 3's order; added 2026-10-28).

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
- **Seat locks via `FOR NO KEY UPDATE` on the seat row instead of advisory locks (section 9):** no hash or
  namespace, but every booking would write a row lock to the seat tuple and queue seat edits and removal checks
  behind bookings. It would also diverge from the lock 001 already proved. Kept as the fallback.
- **A per-renter lock as well (section 9):** turns the rare cross-seat renter race into a clean 409, but adds a
  second lock class and an ordering rule for every writer, for one person's own concurrent requests.

## Consequences

- No double booking, booking-versus-mark overlap, or renter double holding can be committed, whatever the
  concurrency. No code path can leave an active booking without blocking holds.
- At most 30 hold rows per booking, and one per occupancy mark. History grows by about 2 rows per seat per day at
  full utilisation. The join-form query keeps reads independent of history size.
- `booking` no longer carries any exclusion constraint. It holds two generations of rows: legacy hourly rows
  (read-only, still blocking through their backfilled holds) and pass headers. Anyone changing `seat_hold`, `booking.status` or the range expression must read this
  ADR and the custom migration.
- Every writer of holds goes through `lockSeats`, after `lock_timeout` and its space row (section 9.3). Same-seat
  contention queues for milliseconds instead of deadlocking, and a stuck holder fails after 5 s instead of
  draining the pool. Any new writer of a space, seat or hold must follow the order in section 9.3.
- `booking.holds_active` is a stored generated column. Changing `booking_status` values needs a new migration
  that recreates it.
- Follow-ups: the contract migration for hourly rows (validate or drop `booking_no_new_hourly`, drop
  `space.location`, make `space.owner_id` NOT NULL); a transactional outbox for the two booking emails (ADR-0008
  section 5 trigger); rate limiting on booking writes (OQ-10); `Temporal` when Node ships it unflagged.
