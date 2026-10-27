# ADR-0008: Booking time model, conflicts and API conventions

- **Status:** Accepted. Amended by [ADR-0009](0009-pass-bookings-seat-holds-and-slots.md): section 1 for
  DST at owner-set slot boundaries (resolved, not refused), and section 2 for where the exclusion constraints live
  (`seat_hold` instead of `booking`, from feature 002). Section 2 amended in place on 2026-10-27 (per-seat
  advisory lock before the insert; see "Amendment 2026-10-27" there). ADR-0009 section 9 sets the lock rule
  for 002's writers.
- **Date:** 2026-10-22
- **Deciders:** architect agent (T001); product owner for the "30 days" and "own booking in availability" questions

## Context

Feature 001 (seat booking, `specs/001-seat-booking/`) introduces the first domain tables and the
first domain routes. Several choices in it are hard to reverse because they shape the public
contract (`openapi.json`, the generated client) or the stored data:

- Spaces live in different IANA time zones. The spec evaluates every rule (working hours 07:00–20:00,
  15-minute boundaries, daylight-saving behaviour) on the **space's** wall-clock time and displays
  times in that zone.
- "A seat can never be double-booked" and "a user may hold at most one booking at a time" must hold
  under concurrent requests (FR-005, FR-006, SC-002, Constitution IV).
- FR-007 requires the refusal to say **which** rule failed, so clients need a machine-readable reason.
- FR-008: the confirmation email must not undo a booking. The API shares one ioredis client with
  `maxRetriesPerRequest: null` (required by BullMQ workers), so a `queue.add` call **waits, without
  failing, for as long as Redis is down**.
- drizzle-kit 0.31 cannot express `EXCLUDE` constraints, and CI fails when `drizzle-kit generate`
  produces a diff.
- The task-manager's plan left six open questions. Q1 and Q3 were answered by the product owner;
  Q2, Q4, Q5 and Q6 are decided here.

## Decision

### 1. Time model

- **Storage:** every instant is `timestamptz` (UTC on disk). Bookings store `starts_at` and an
  exclusive `ends_at`. The space stores its IANA zone in `space.time_zone`.
- **Requests use space-local wall-clock time:** `date` (`YYYY-MM-DD`), `startTime` and `endTime`
  (`HH:mm`). The zone is never sent by the client; it comes from the space (through the seat for
  bookings, through the path for availability). **Responses** carry the UTC instants (`startsAt`,
  `endsAt`) **and** the local `date`, `startTime`, `endTime` and `timeZone`, so the web app never does
  time-zone arithmetic.
- **Conversion** lives in one pure module, `apps/api/src/common/time/zoned-time.ts`, built on Node 22's
  `Intl` (full ICU). No time library is added. Algorithm for `toInstant(date, time, zone)` (same idea as
  Temporal's "possible instants"):
  1. `W` = the wall-clock read as if it were UTC (ms).
  2. Read the zone's offset at `W − 24 h` and at `W + 24 h` (`Intl.DateTimeFormat` with `hourCycle: 'h23'`).
  3. For each distinct offset `o`, the candidate is `W − o`; keep it only if `toLocal(candidate)` equals
     the requested wall-clock.
  4. 1 candidate → the instant. 0 candidates → the local time **does not exist** (DST gap). 2 candidates →
     the local time is **ambiguous** (DST overlap).
- **Nonexistent and ambiguous local times are refused** with `booking-rule:invalid-local-time` (422), for
  booking and for availability. We never silently shift a time (which is what PostgreSQL's
  `AT TIME ZONE` does). For the seeded zones this cannot happen inside working hours (London changes at
  01:00/02:00, Kolkata has no DST), so for bookings it is a defensive rule. For availability, a window in
  the early hours of a change day can reach it.
- **"At most 30 days ahead"** means `startsAt ≤ now + 30 × 24 h` (product owner, Q1).
- **"Now"** comes from an injectable `Clock` provider, so tests control time.
- **Rule order** (first failure wins; one problem `type` each): `end-before-start`, `not-on-quarter-hour`,
  `invalid-local-time`, `too-short`, `too-long`, `outside-working-hours`, `starts-in-past`, `too-far-ahead`.
  Format rules run on the wall-clock first, then the wall-clock is converted, then duration uses real
  instants (as the database CHECK does). Working hours use the wall-clock, and the time rules use instants.

### 2. Conflict model (no double booking)

- Two **partial exclusion constraints** on `booking`, both `WHERE (status = 'active')`, so a cancelled
  booking stops blocking:
  - `booking_seat_no_overlap EXCLUDE USING gist (seat_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)`
  - `booking_user_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)`
- Ranges are half-open `[)`, so back-to-back windows (end 12:00, start 12:00) do not conflict.
- `btree_gist` provides `=` on `uuid`/`text` inside GiST. It is a trusted extension (PG 13+), so the
  migration's `CREATE EXTENSION IF NOT EXISTS btree_gist` works for a database owner on RDS as well
  as locally, where `docker/postgres/init/01-init.sh` already created it.
- The service does a **single `INSERT`** with no read-then-write pre-check and no `SERIALIZABLE`. Since the
  2026-10-27 amendment below, the insert runs in a short transaction behind a per-seat advisory lock.
- **Error mapping.** Drizzle 0.45 wraps driver errors in `DrizzleQueryError`; read SQLSTATE and constraint
  from `err.cause` (the `pg` `DatabaseError`), never from the message:

  | SQLSTATE | Constraint                   | Result                                                                                 |
  | -------- | ---------------------------- | -------------------------------------------------------------------------------------- |
  | `23P01`  | `booking_seat_no_overlap`    | 409 `urn:bseat:problem:booking:seat-unavailable`                                       |
  | `23P01`  | `booking_user_no_overlap`    | 409 `urn:bseat:problem:booking:user-overlap`                                           |
  | `40P01`  | (deadlock)                   | **retry the attempt** (lock + INSERT), at most 3 attempts in total, then rethrow (500) |
  | `23503`  | `booking_seat_id_seat_id_fk` | 404 "Seat not found"                                                                   |
  | other    | any (including `23514`)      | rethrow → 500 (a CHECK failure means the TS rules and the DB disagree, which is a bug) |

  **Why the retry:** PostgreSQL checks exclusion constraints _after_ inserting the index entry. Two
  backends inserting conflicting rows at the same moment can each wait for the other, and the deadlock
  detector then aborts one with `40P01` instead of `23P01` (documented in `src/backend/executor/execIndexing.c`).
  Each attempt is its own transaction and nothing was committed, so a retry is safe. The retry
  then either fails with `23P01` (the winner committed) or succeeds (the other one was the victim).
  Without it, SC-002 ("19 refused") would sometimes see a 500.

  **Amendment 2026-10-27 (per-seat lock; `fix/001-booking-race-flake`):** the retry alone was not enough.
  With 20+ racers each deadlock costs `deadlock_timeout` (1 s) and the victims collide again, so 3 attempts
  ran out (500) or requests stalled (177 `40P01` in one day's log). Each attempt is now a short transaction
  whose first statement is `pg_advisory_xact_lock(hashtextextended(seat_id::text, 0))`, then the `INSERT`.
  - Same-seat inserts queue on the lock instead of meeting inside the exclusion check, so the seat
    constraint answers `23P01` (409) without deadlocks. The lock only **orders** attempts; the exclusion
    constraints remain the guarantee, and a hash collision between two seats only adds queueing.
  - The `40P01` retry stays for the case the lock does not cover: one user racing on **different** seats
    (`booking_user_no_overlap`). That fan-in is one person's concurrent requests, so retry-only is enough.
  - Nothing but the lock and the `INSERT` runs inside the transaction (the email is queued after commit,
    section 5), so the lock is held for milliseconds. No `lock_timeout` is set for this path because
    there is no application await between the two statements, and 002 T008 removes the path.
  - Rejected: `SERIALIZABLE` (aborts with `40001` instead of naming the constraint, still needs retries).
    Feature 002 uses the namespaced, multi-seat form of this lock in ADR-0009 section 9.

- **Migrations.** drizzle-kit generates the tables, FKs, uniques, CHECKs, enum and btree indexes. The
  exclusion constraints go in a **custom migration** created with
  `bin/pnpm --filter @bseat/api db:generate --custom --name booking_exclusions` **after** the table
  migration has been generated. `--custom` writes an empty SQL file, a snapshot of the current schema and a
  journal entry. If it runs before the tables are generated, its snapshot would already contain them, and
  their `CREATE TABLE` would never be generated. drizzle-kit diffs snapshots, not the database, so the
  constraints are never dropped by later `generate` runs, and the CI "migrations up to date" step stays
  green. `drizzle-kit push` and `pull` must not be used against shared databases, because they would see
  the constraints as drift.

### 3. API conventions introduced by this feature (Q5)

- **Local wall-clock requests** as in section 1 (confirmed).
- **Per-rule problem types.** Domain failures throw `ProblemException extends HttpException`
  (`apps/api/src/common/errors/problem.exception.ts`) carrying `type`, `title` and `detail`. `ProblemFilter`
  uses them. `ProblemSchema` is unchanged, and built-in Nest exceptions keep `urn:bseat:problem:http-<status>`.
  Namespaces: `urn:bseat:problem:booking:<conflict>` (409) and `urn:bseat:problem:booking-rule:<rule>` (422).
  The values are exported as constants from the API (no string literals in services), and
  `specs/001-seat-booking/contracts/README.md` is the registry. 400 stays for malformed input (Zod), 422 for
  well-formed windows that break a rule, 409 for conflicts with existing state.
- **No existence leak.** Every booking read and write filters `user_id = caller` inside the SQL `WHERE`.
  Someone else's booking and a missing booking return the identical 404. Availability exposes only
  `free`/`taken`.
- **Shared field formats** (`LocalDate`, `LocalTime`, `Instant`) are unnamed primitive helpers without
  `.meta({ id })`, so they never become shared OpenAPI components. Every named object schema belongs to
  exactly one direction.

### 4. Cancel semantics (Q2)

`POST /api/bookings/{bookingId}/cancel` on the caller's **already-cancelled** booking returns **200** with the
booking unchanged (`cancelledAt` keeps its first value). Cancelling is idempotent, so a client retry after
a lost response converges. Ownership is checked first, so this reveals nothing about other users.
Cancelling a booking that has started returns 409 `booking:already-started`.

### 5. Confirmation email and Redis outage (Q4): no outbox in this slice

- After the INSERT returns (autocommit, so it has committed), the service enqueues the email with
  `jobId = booking-confirmed-<bookingId>`. BullMQ 6 rejects custom ids that contain a single `:`, so a hyphen
  is used.
- The enqueue is awaited with a **2-second bound** (a constant in the bookings module). On rejection or
  timeout, the service logs at `error` level `booking.confirmation_not_queued { bookingId }` (never the
  address or body) and still returns 201. With `maxRetriesPerRequest: null`, a timed-out `add` can still
  complete once Redis reconnects (ioredis offline queue), and the `jobId` stops a duplicate.
- **Accepted risk:** if Redis is down **and** the API process restarts before Redis returns, that
  confirmation is lost. The booking stands (FR-008). SC-004 is scoped to normal operation. The error log
  line is the hook for alerting and for a manual resend.
- **Revisit trigger** (follow-up, new ADR): add a transactional outbox (`booking_outbox` row written in
  the booking transaction, relayed into BullMQ) when email becomes a guaranteed-delivery requirement,
  when cancellation emails are added, or when production shows lost confirmations.

### 6. Documentation task (Q6)

Keep **one** docs task (T016) for the slice. The docs surface is one README section, one runbook update
and a changeset check. Developers add their own changesets per PR. Splitting it would add three
near-empty PRs.

### 7. Own booking in availability (Q3, product owner)

In this slice, the caller's own booking shows as `taken`, like anyone else's. A "yours" marker is a
follow-up (it would add an optional field to `SeatAvailability`, an additive contract change).

## Alternatives considered

- **ISO instants in requests:** more general, but the browser would need IANA conversion for a zone that is
  not its own (a library in the web app), and it allows windows across local midnight that the rules reject anyway.
- **PostgreSQL `AT TIME ZONE` for conversion:** authoritative tz data, but it silently shifts DST-gap
  times and makes a pure rule depend on a DB round-trip. QA may still use it as an independent cross-check.
- **`date-fns-tz` / `luxon`:** correct, but a runtime dependency for about 40 lines. Move to `Temporal`
  when the runtime ships it unflagged. `zoned-time.ts` is the only call site.
- **`SELECT … FOR UPDATE` on the seat, `SERIALIZABLE` with retries, Redis locks:** either they don't cover the
  user rule across seats, or they add retry storms, or they are not a database invariant (Constitution IV).
- **Mapping `40P01` straight to 409:** we cannot tell which constraint caused it, so the message could be
  wrong. A retry gives the exact answer.
- **A trigger for working hours:** hidden logic that duplicates the TS rules for no concurrency benefit.
- **A `code` field on `ProblemSchema`:** a contract change for every consumer. RFC 9457 `type` is the standard slot.
- **403 for others' bookings:** leaks existence.
- **409 on re-cancel:** forces clients to treat a retried success as an error.
- **Transactional outbox now:** guarantees delivery but adds a table, a relay and its tests. YAGNI for the slice (see the revisit trigger).
- **Fire-and-forget enqueue:** keeps the response fast, but makes the "email queued before 201" ordering
  non-deterministic in tests. The bounded await gives the same outage behaviour with deterministic tests.

## Consequences

- No double booking or double holding can be committed, whatever the concurrency. Losers of a race may
  wait up to `deadlock_timeout` (1 s by default) before a 409, which is acceptable for a rare contention case.
- The time-dependent rules (working hours, valid local time, not in the past, at most 30 days ahead) live only
  in `booking-rules.ts`. They depend on the request and the clock, not on other rows, so concurrency cannot
  break them. The time-independent rules are also database CHECKs.
- The exclusion constraints exist only in SQL. Anyone changing `booking` must read `0002_booking_exclusions.sql`
  and this ADR. Changing `status` values or the range expression needs a new custom migration.
- Queries that should use the partial GiST index must spell the predicate as in the constraint: the literal
  `status = 'active'` and `tstzrange(starts_at, ends_at, '[)')` (not bound parameters).
- Clients get a stable, typed reason for every refusal, and the web maps `type` to copy.
- Follow-ups: "yours" marker in availability (product), transactional outbox (see trigger), a btree index on
  `booking.seat_id` when seat deletion or admin management arrives, pagination for `GET /api/bookings` if the
  rules are relaxed, `Temporal` when available.
