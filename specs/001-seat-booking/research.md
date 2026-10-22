# Research: Seat booking (Phase 0)

Every decision below follows the format Decision / Rationale / Alternatives considered. The
Technical Context has no open `NEEDS CLARIFICATION` items. Product-level questions are listed
in [plan.md → Open questions](./plan.md#open-questions).

## R-1. Time-zone handling without a new dependency

**Decision**: Use Node 22's built-in `Intl` (full ICU ships in `node:22-bookworm-slim`, which
the tools, api and web images use). A small pure module, `apps/api/src/common/time/zoned-time.ts`,
provides:

- `toInstant(date: 'YYYY-MM-DD', time: 'HH:mm', timeZone)`. It converts the space's local
  wall-clock time to a UTC instant, using the algorithm fixed in ADR-0008 section 1:
  1. `W` is the wall-clock read as if it were UTC.
  2. Read the zone's offset at `W − 24 h` and at `W + 24 h` with
     `Intl.DateTimeFormat(..., { timeZone, hourCycle: 'h23' }).formatToParts`.
  3. For each distinct offset `o`, the candidate is `W − o`. Keep the candidates whose `toLocal` round-trip
     equals the requested wall-clock.
  4. Exactly 1 candidate is the instant. 0 means the local time does not exist (DST gap). 2 means it is
     ambiguous (DST overlap).

  The function returns a discriminated result, `{ kind: 'ok', instant } | { kind: 'nonexistent' } | { kind: 'ambiguous' }`.
  It never silently picks an offset. Both failure kinds become `invalid-local-time`.

- `toLocal(instant: Date, timeZone): { date, time }` for responses and email copy.
- `isValidTimeZone(tz)`, implemented as `new Intl.DateTimeFormat('en', { timeZone: tz })` inside try/catch.
  Do **not** use `Intl.supportedValuesOf('timeZone')`, because it returns CLDR canonical ids and
  can list `Asia/Calcutta` instead of `Asia/Kolkata`.

Unit tests (written first) cover Europe/London across both 2026 DST transitions (29 Mar and 25 Oct),
Asia/Kolkata (+05:30, no DST), a gap time (`2026-03-29 01:30` London), an overlap time
(`2026-10-25 01:30` London), and a guard test asserting that both seeded zones are supported
(this catches a small-ICU build).

**Rationale**: The constitution asks for zero new runtime dependencies unless justified. The
conversion needs about 40 lines, is easy to unit-test, and keeps every time-zone rule on the
server. ICU's tz data is updated with Node releases.

**Alternatives considered**:

- `date-fns-tz` / `luxon` / `@js-joda/timezone`: correct, but add a runtime dependency for one function.
- `Temporal`: the right long-term API, but not available without a flag in Node 22. Revisit when
  the API moves to a Node version where it ships (the conversion module is the only call site).
- PostgreSQL `AT TIME ZONE` (`(date + time) AT TIME ZONE tz`): authoritative tz data, but it
  silently shifts DST-gap times, needs a DB round-trip for a pure rule, and makes unit tests depend
  on the database. QA may still use it as an independent cross-check in integration tests.

## R-2. API time representation: local wall-clock in, instants and local out

**Decision**: Requests carry the space-local `date` (`YYYY-MM-DD`), `startTime` and `endTime`
(`HH:mm`). The space determines the time zone (through the seat for bookings, through the path
for availability). Responses carry `startsAt` and `endsAt` (ISO 8601 UTC instants) **plus**
`date`, `startTime`, `endTime` and `timeZone` in the space's local time.

**Rationale**: The spec evaluates every rule on the space's local wall-clock time and displays
times in that zone. If the client sent instants, the browser would need IANA conversion (R-1)
for a zone other than the user's own, which duplicates logic and needs a library in the web
app. Bookings are capped at 10 h inside 07:00–20:00, so a window never crosses local midnight,
and one `date` plus two times describes every valid window. Every real-world UTC offset is a
multiple of 15 minutes, so "on a 15-minute boundary" means the same thing locally and in UTC.

**Alternatives considered**: ISO instants with offsets in requests (more general, but pushes tz
math to the client and allows windows that cross midnight, which all fail the rules anyway).
Unix epoch numbers (unreadable in the contract and logs).

## R-3. Where each booking rule is enforced

**Decision**:

| Rule (FR-007 / FR-005 / FR-006) | Service (`booking-rules.ts`)     | Database                                                       |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| end after start (wall-clock)    | `end-before-start`               | CHECK `ends_at > starts_at`                                    |
| 15-minute boundaries            | `not-on-quarter-hour`            | CHECK `extract(epoch …) % 900 = 0` on both columns             |
| local time exists (DST)         | `invalid-local-time`             | none                                                           |
| at least 15 min / at most 10 h  | `too-short` / `too-long`         | CHECK duration between `15 min` and `10 h`                     |
| within 07:00–20:00 local        | `outside-working-hours`          | none (depends on `space.time_zone`, another table)             |
| not in the past                 | `starts-in-past`                 | none (depends on `now()`)                                      |
| at most 30 days ahead           | `too-far-ahead`                  | none (depends on `now()`)                                      |
| no seat overlap                 | none (DB is the source of truth) | EXCLUDE gist `(seat_id =, tstzrange &&) WHERE status='active'` |
| no user overlap                 | none (DB is the source of truth) | EXCLUDE gist `(user_id =, tstzrange &&) WHERE status='active'` |

**Order amended by the architect (T001):** `invalid-local-time` runs third, right after the wall-clock format
rules, so that (a) the DST unit tests (London 01:30 on a change day) reach it rather than
`outside-working-hours`, and (b) the duration rules can use real instants, as the database CHECK does.
Working hours are checked on the wall-clock.

The rules are checked in the order of the table, and the first failure is returned with its own
problem `type` (see [contracts/README.md](./contracts/README.md)). The function signature is
`evaluateBookingRules({ date, startTime, endTime }, timeZone, now): RuleViolation | null`.
"Starts in the past" means `startsAt <= now`. "Too far ahead" means `startsAt > now + 30 × 24 h`
(product owner decision, plan.md open question 1).

**Rationale**: Constitution IV requires invariants in the DB. The time-free invariants are CHECKs.
The time-dependent ones cannot be. PostgreSQL CHECKs must be deterministic, and using `now()` in
a CHECK would make old rows invalid over time. The time-dependent rules depend only on the request
and the clock, so concurrency cannot break them.

**Alternatives considered**: a trigger that enforces working hours by joining `space.time_zone`.
Rejected: hidden logic, harder to test, and it duplicates the TS rules for no concurrency benefit.

## R-4. Preventing double booking under concurrency

**Decision**: Use two **partial exclusion constraints** on `booking` with half-open ranges
`tstzrange(starts_at, ends_at, '[)')`, so back-to-back windows (end 12:00, start 12:00) are
allowed. The `WHERE status = 'active'` predicate means cancelled rows no longer block anything.
The service performs a plain `INSERT` inside a transaction and maps errors:

- `23P01` with `constraint = 'booking_seat_no_overlap'` → 409 `urn:bseat:problem:booking:seat-unavailable`
- `23P01` with `constraint = 'booking_user_no_overlap'` → 409 `urn:bseat:problem:booking:user-overlap`
- `40P01` (deadlock) → retry the INSERT, at most 3 attempts in total, then rethrow. PostgreSQL checks an exclusion
  constraint _after_ inserting the index entry. Two simultaneous conflicting inserts can wait on each other,
  and the deadlock detector then aborts one with `40P01` instead of `23P01` (see the `execIndexing.c` header
  comment). The retry then fails with `23P01` or succeeds. Without it, the SC-002 test would sometimes see a 500.
- `23503` (FK) on `booking_seat_id_seat_id_fk` → 404 (seat deleted between lookup and insert; unlikely, since seats are seeded)
- anything else, including `23514` (CHECK) → rethrow, giving a 500. A CHECK failure after the rules passed is a bug.

Drizzle 0.45 wraps driver errors in `DrizzleQueryError`. Read `code` and `constraint` from `err.cause` (the
`pg` `DatabaseError`). Never match on message text.

If both constraints would fail, PostgreSQL reports whichever it checks first. Either message is
correct for the user. Tests set up only one conflict per case.

Concurrent inserts that conflict make the later transaction wait for the earlier one and then
fail with `23P01`. No advisory locks or `SERIALIZABLE` isolation are needed. SC-002 is proven by
an integration test that fires 20 parallel `POST /api/bookings` from 20 users for one seat and
window, and expects exactly one 201 and nineteen 409s, run in a loop of several iterations.

The exclusion constraints need `btree_gist` (for `=` on `uuid` and `text` inside a GiST index).
It is a _trusted_ extension since PG 13, so the RDS master user can create it. The custom
migration runs `CREATE EXTENSION IF NOT EXISTS btree_gist` (a no-op locally, where `docker/postgres/init`
already created it).

**Drizzle note**: drizzle-kit 0.31 cannot express `EXCLUDE` constraints. Generate the tables
normally **first**, then create a second, hand-written migration with
`bin/pnpm --filter @bseat/api db:generate --custom --name booking_exclusions`. `--custom` writes an empty SQL
file, a snapshot of the _current_ schema, and a journal entry. If it ran first, the tables would be in its
snapshot and would never be generated. The drizzle snapshot will not know about these constraints. That is
fine, because drizzle-kit diffs snapshots and will not drop them, and the CI check (`drizzle-kit generate`
produces nothing) stays green. Never run `drizzle-kit push` or `pull` against a shared database.

**Alternatives considered**: `SELECT … FOR UPDATE` on the seat row before insert (serializes
correctly for the seat, but not for the user rule across seats, and adds code). `SERIALIZABLE`
with retry loops (more complex, with retry storms under contention). Redis locks (not a DB
invariant, so it violates Constitution IV).

## R-5. Confirmation email and failure isolation

**Decision** (amended by ADR-0008 section 5): After the booking INSERT commits, `BookingsService` calls
`MailService.send({ to, subject, text }, { jobId: 'booking-confirmed-<bookingId>' })`. The
existing `MailService` gains an optional `jobId` option, and BullMQ deduplicates on `jobId`. A hyphen is
used, not `:`, because BullMQ 6 throws `Custom Id cannot contain :` for an id with exactly one colon.
The call is awaited for **at most 2 s**. The shared ioredis client has `maxRetriesPerRequest: null`, so
without a bound, `queue.add` would hang the HTTP request for as long as Redis is down. On rejection or
timeout, the service logs at `error` level `booking.confirmation_not_queued { bookingId }` (no address, no
body, no error message that could contain them) and still returns 201. SMTP failures retry inside
the worker (5 attempts, exponential backoff, already configured). Email content is specified in
[contracts/booking-email.md](./contracts/booking-email.md).

**Rationale**: This meets FR-008 ("a delayed or failed email MUST NOT undo the booking") with the
existing infrastructure. Under normal operation Redis is up, and the job reaches Mailpit or SMTP
within seconds (SC-004).

**Alternatives considered**: a transactional outbox table polled into BullMQ (guarantees eventual
delivery even if Redis is down at commit time). Deferred (YAGNI for this slice). ADR-0008 section 5 records the accepted risk and the revisit trigger.
Sending SMTP inline was rejected because it blocks the request and couples booking success to SMTP.

## R-6. Authorization and information exposure

**Decision**: Every route uses `@UseGuards(AuthGuard)`. Booking reads and writes filter on
`booking.user_id = session.user.id` **in the query** (not after loading the row), so a foreign
id and a missing id produce the same `404 Booking not found` (FR-011). Availability returns only
`free` or `taken` per seat and never who booked it. Path and body ids are validated as UUIDs, and
malformed ids get 400 for every caller, so the response does not depend on ownership.

**Alternatives considered**: 403 for foreign bookings, rejected because it leaks that the id exists.

## R-7. Error shape for domain failures

**Decision**: Add `ProblemException extends HttpException` (in `common/errors/problem.exception.ts`)
with `{ status, type, title, detail }`. `ProblemFilter` uses its `type` and `title` instead of the
generic `urn:bseat:problem:http-<status>`. `ProblemSchema` is unchanged, so the change is purely
additive. Built-in Nest exceptions (`NotFoundException`) keep their current mapping.

**Rationale**: RFC 9457 `type` is the standard place for a machine-readable problem kind. The web
app maps `type` to copy (`lib/booking-problems.ts`) and falls back to `detail`. This avoids
parsing English messages.

**Alternatives considered**: a custom `code` field on `ProblemSchema` (a contract change for every
consumer). Field-level `errors[]` for rule failures (they are not field-format errors, and the
UI needs one clear message).

## R-8. Seed and test data

**Decision**: `src/db/seed.ts` upserts by natural keys (`space.name` unique, `(space_id, label)` unique)
with `onConflictDoNothing`, so it stays idempotent on every `docker compose up`. It seeds
"London HQ" (`Europe/London`, seats `A-01`…`A-12`) and "Pune Hub" (`Asia/Kolkata`, seats `P-01`…`P-08`).
A few seats get `standing desk` or `dual monitor` features. The seed checks `isValidTimeZone` and
fails loudly otherwise. Integration tests do **not** rely on the seed (`resetDb` truncates). They
use `test/fixtures.ts` helpers: `createSpace`, `createSeats(n)`, and `insertBooking` for direct
inserts such as an already-started booking, which the API can never create.

## R-9. Availability query and performance (SC-003)

**Decision**: One query per request. Select the space's seats ordered by `label`, with
`EXISTS (SELECT 1 FROM booking b WHERE b.seat_id = seat.id AND b.status = 'active' AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange($from, $to, '[)'))`.
The overlap predicate repeats the exclusion constraint's expression, so the planner can use its
GiST index. The index is partial, so write `status = 'active'` and `'[)'` as **SQL literals** in the
`sql` template, not as bound parameters (for example ``sql`${booking.status} = 'active'` ``). Otherwise the
planner may not prove that the index predicate and expression match.
200 seats is one indexed probe per seat, well under 1 s. QA verifies with an
integration timing test (200 seats, 200 bookings, 50 requests, p95 < 1 s) and `EXPLAIN` in
review. No caching.

**Alternatives considered**: `starts_at < $to AND ends_at > $from` (equivalent semantics, but
does not match the GiST expression index). A materialised availability table (premature).

## R-10. Web composition

**Decision**: Two new routes in the signed-in group: `/book` and `/bookings`. The dashboard
placeholder becomes links to both. `proxy.ts`'s matcher adds `/book/:path*` and `/bookings/:path*`
(UX redirect to sign-in, AC 1.4; the API still enforces auth). Components use generated hooks
(`useSpacesList`, `useSpacesAvailability`, `useBookingsCreate`, `useBookingsListMine`,
`useBookingsCancel`; names follow the existing `operationIdFactory`, `<Controller>_<method>`).
After a successful create or cancel, the availability and my-bookings queries are invalidated.
Inputs use native date, time and select elements with `@bseat/ui` `Input`/`Label`. If ui.md calls
for a confirmation dialog or radio group, the designer adds `alert-dialog`/`radio-group` through
the shadcn CLI. These depend only on the existing `radix-ui` package, so no new runtime dependency.

**Alternatives considered**: a single page with tabs (harder deep-linking, larger component).
A third-party date picker (new dependency; the native inputs are accessible).
