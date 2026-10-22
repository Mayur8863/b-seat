# Implementation Plan: Seat booking

**Branch**: `feat/001-seat-booking` (planning branch; each task gets its own branch, see tasks.md) | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-seat-booking/spec.md`

**Architect verdict**: Approved by architect (2026-10-22)

The approval covers the amendments the architect made directly in this folder during T001 (no
re-plan needed). Decisions are recorded in [ADR-0008](../../docs/adr/0008-booking-time-and-conflict-model.md).

1. **Deadlock retry (SC-002).** Concurrent conflicting inserts can fail with `40P01` instead of `23P01`.
   The service retries the INSERT (at most 3 attempts), and T009 tests it (research R-4, contracts/bookings.md).
2. **Driver errors.** Drizzle 0.45 wraps `pg` errors in `DrizzleQueryError`, so SQLSTATE and constraint are read from `err.cause`.
3. **Email job id.** BullMQ 6 rejects `booking-confirmed:<id>` (one `:`), so the id is now `booking-confirmed-<id>`.
   The enqueue is awaited for at most 2 s, because the shared ioredis client (`maxRetriesPerRequest: null`)
   otherwise hangs the request while Redis is down. The failure log is at `error` level.
4. **Rule order.** `invalid-local-time` moves to third place (right after the format rules). Otherwise the DST
   tests in T003 (London 01:30) would return `outside-working-hours`, and duration could not use real instants.
5. **CHECK fix.** `booking_quarter_hour` drops the `::bigint` cast. Casting `numeric` to `bigint` rounds, so
   `09:00:00.4` would pass.
6. **Index fix.** `booking_user_upcoming_idx` (partial) becomes `booking_user_id_starts_at_idx (user_id, starts_at)`,
   not partial. A partial index cannot serve the `ON DELETE CASCADE` lookup from `user`. Queries that should use
   the partial GiST index must spell `status = 'active'` and `'[)'` as SQL literals.
7. **Migration order.** Generate the table migration first, then `--custom`. A custom migration's snapshot
   is the current schema. Separate the statements with `--> statement-breakpoint`. File names corrected to
   `0001_spaces_bookings.sql` and `0002_booking_exclusions.sql`.
8. **Dependencies.** T007 now depends on T004 (availability can return a 422 `ProblemException`).
   T002 reuses the existing `test/helpers.ts` (`signedInAgent`) instead of a second sign-up helper.

## Summary

Signed-in users list office spaces, check seat availability for a date and time window in the
space's local time, book a free seat, list their upcoming bookings and cancel one that has not
started. The two "never overlap" rules (seat and user) are PostgreSQL exclusion constraints
(`btree_gist` + `tstzrange`), so concurrent requests cannot break them. The API maps constraint
violations to problem details. Booking rules (FR-007) live in one pure, unit-tested function that
works on the space's local wall-clock time. Time zones are converted with Node 22's built-in
`Intl` data, so no time library is added. A confirmation email goes through the existing BullMQ
mail queue after the booking commits. If the email cannot be queued, the booking still stands.
The web app adds two pages, `/book` and `/bookings`, built only on the orval-generated client and
`@bseat/ui` components. **No new runtime dependencies.**

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 22 LTS (full ICU in `node:22-bookworm-slim`)

**Primary Dependencies**: NestJS 12 + Zod 4 (Standard Schema), `@nestjs/swagger` 12, Drizzle ORM 0.45 / drizzle-kit 0.31, BullMQ 6 (`MailService`), Better Auth (existing `AuthGuard`), Next.js 16 / React 19, TanStack Query via orval-generated `@bseat/api-client`, React Hook Form + Zod, `@bseat/ui` (shadcn/Radix)

**Storage**: PostgreSQL 18 with `btree_gist` (already enabled locally by `docker/postgres/init`; the migration also runs `CREATE EXTENSION IF NOT EXISTS btree_gist` for RDS). Redis 8 for the mail queue.

**Testing**: Vitest unit (`src/**/*.spec.ts`), Vitest integration against real Postgres/Redis/Mailpit (`apps/api/test/*.int-spec.ts`), Testing Library + MSW (`apps/web/src/**/*.test.tsx`), Playwright + axe (`apps/web/e2e`)

**Target Platform**: Linux containers (Docker Compose locally; ECS Fargate + RDS + ElastiCache per ADR-0007)

**Project Type**: Web application (pnpm/Turborepo monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: Availability for a space with up to 200 seats in < 1 s at p95 (SC-003). Confirmation email delivered within 1 minute (SC-004).

**Constraints**: Exactly one success out of 20 concurrent bookings for the same seat and window (SC-002). WCAG 2.1 AA with zero axe violations (SC-005). Booking takes at most 4 interactions after choosing a window (SC-001). Changed-line coverage of at least 80%.

**Scale/Scope**: Seeded data: 2 spaces with 20 seats. Design target is up to 200 seats per space. A user's upcoming bookings are naturally bounded by the rules (no overlap, at most 30 days ahead), so lists are not paginated in this slice.

No `NEEDS CLARIFICATION` items remain. The design choices are recorded in [research.md](./research.md), and the product-level questions are listed under "Open questions" below.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (result below)._

| Principle                                 | Status                        | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Spec before code                       | PASS                          | Spec is approved. This plan and tasks.md go to the architect before any code (T001 records ADR-0008 and approves the contract).                                                                                                                                                                                                                                                                                                                                                                                                      |
| II. Test-first for business logic         | PASS                          | Booking rules and time-zone conversion are pure functions, and their failing unit tests come first (T003). DB constraint tests run before any service code (T002). Every AC maps to a test in tasks.md (traceability table). Integration tests use real Postgres, Redis and Mailpit.                                                                                                                                                                                                                                                 |
| III. Contract-first API                   | PASS                          | Request and response Zod schemas with `.meta({ id })` produce `openapi.json` through `gen:api`. Every frontend task depends on the backend task that regenerates the client. All changes are additive (new routes and new problem `type` values), so nothing breaks. `ProblemSchema` is unchanged.                                                                                                                                                                                                                                   |
| IV. Invariants live in the database       | PASS (with documented limits) | Seat overlap and user overlap are partial exclusion constraints (`WHERE status = 'active'`). There are CHECKs for `ends_at > starts_at`, 15 min ≤ duration ≤ 10 h, quarter-hour alignment, and status vs `cancelled_at` consistency, plus `UNIQUE(space_id, label)` and FKs. Three FR-007 rules depend on "now" or on another table's time zone (not in the past, at most 30 days ahead, working hours) and cannot be CHECK constraints. They are enforced in the service only and are not concurrency-sensitive (see research R-3). |
| V. Secure and accessible by default       | PASS                          | Every route has `@UseGuards(AuthGuard)` (FR-001). Booking queries are scoped by `user_id` in the service, and someone else's booking returns 404 (FR-011). Availability never exposes who holds a seat. Input is validated with Zod at the boundary. Email bodies and addresses are never logged. UI tasks depend on `ui.md`, and the QA tasks run axe on every booking screen.                                                                                                                                                      |
| VI. Small, reversible, observable changes | PASS                          | 16 tasks, each S or M, one branch per task. Migrations are additive (new tables only). `booking.created` and `booking.cancelled` are logged with ids only (pino, request id). No new runtime dependency, framework or datastore. ADR-0008 records the time and conflict model.                                                                                                                                                                                                                                                       |

**Post-design re-check (after Phase 1)**: PASS. The data model and contracts introduce no
violations. The `ProblemException` addition to `common/errors` is a small extension of the
existing filter, not a new pattern that needs Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-seat-booking/
├── spec.md              # approved spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions (R-1 … R-10)
├── data-model.md        # tables, constraints, indexes, migrations
├── quickstart.md        # runnable validation guide
├── contracts/
│   ├── README.md        # conventions, problem types, auth
│   ├── spaces.md        # GET /api/spaces, GET /api/spaces/{spaceId}/availability
│   ├── bookings.md      # POST /api/bookings, GET /api/bookings, POST /api/bookings/{bookingId}/cancel
│   └── booking-email.md # confirmation email content contract
├── ui.md                # (T006, ui-ux-designer) states, copy, a11y
├── checklists/requirements.md
└── tasks.md             # task tracker
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── common/
│   │   ├── errors/problem.exception.ts      # NEW: HttpException carrying a problem `type` (T004)
│   │   ├── errors/problem.filter.ts         # EDIT: honour ProblemException.type (T004)
│   │   └── time/
│   │       ├── zoned-time.ts                # NEW: local wall-clock <-> instant via Intl (T003)
│   │       ├── zoned-time.spec.ts
│   │       └── clock.ts                     # NEW: injectable Clock (now) for deterministic tests (T003)
│   ├── db/schema/
│   │   ├── space.ts                         # NEW: space + seat tables (T002)
│   │   ├── booking.ts                       # NEW: booking table + booking_status enum (T002)
│   │   └── index.ts                         # EDIT: export new tables
│   ├── db/seed.ts                           # EDIT: London HQ (12 seats) + Pune Hub (8 seats) (T005)
│   ├── spaces/                              # NEW module (T007)
│   │   ├── spaces.schemas.ts  spaces.service.ts  spaces.service.spec.ts
│   │   ├── spaces.controller.ts  spaces.module.ts
│   ├── bookings/                            # NEW module (T003, T009, T010, T012)
│   │   ├── booking-rules.ts  booking-rules.spec.ts
│   │   ├── bookings.schemas.ts  bookings.service.ts  bookings.service.spec.ts
│   │   ├── booking-confirmation.mail.ts  booking-confirmation.mail.spec.ts
│   │   ├── bookings.controller.ts  bookings.module.ts
│   └── app.module.ts                        # EDIT: import SpacesModule, BookingsModule
├── drizzle/
│   ├── 0001_spaces_bookings.sql             # generated first: tables, checks, FKs, indexes (T002)
│   └── 0002_booking_exclusions.sql          # custom, generated second: btree_gist + 2 exclusion constraints (T002)
├── test/
│   ├── fixtures.ts                          # NEW: createSpace/createSeats/insertBooking (T002; Mailpit helper T010); sign-up reuses helpers.ts signedInAgent
│   ├── booking-constraints.int-spec.ts      # T002
│   ├── spaces.int-spec.ts                   # T007
│   ├── bookings.int-spec.ts                 # T009, T010
│   └── my-bookings.int-spec.ts              # T012
└── openapi.json                             # REGENERATED (T007, T009, T012)

apps/web/src/
├── app/(app)/book/page.tsx                  # NEW (T008, T011)
├── app/(app)/bookings/page.tsx              # NEW (T013)
├── app/(app)/dashboard/page.tsx             # EDIT: links to Book a seat / My bookings (T013)
├── components/space-list.tsx (+ .test.tsx)          # T008
├── components/booking-window-form.tsx (+ .test.tsx) # T008
├── components/seat-availability.tsx (+ .test.tsx)   # T008, T011
├── components/my-bookings.tsx (+ .test.tsx)         # T013
├── lib/booking-problems.ts (+ .test.ts)             # problem type -> user copy (T011)
└── proxy.ts                                 # EDIT: matcher adds /book, /bookings (T008)
apps/web/e2e/
├── booking.spec.ts                          # T014
└── my-bookings.spec.ts                      # T015
packages/ui/src/components/                  # only if ui.md needs e.g. alert-dialog/radio-group (shadcn CLI; uses existing radix-ui dep)
docs/adr/0008-booking-time-and-conflict-model.md  # T001
README.md, docs/runbooks/*, .changeset/*     # T016
```

**Structure decision**: Existing monorepo layout, using the feature-module pattern from
`apps/api/AGENTS.md` (`src/<feature>/` with schemas, service, controller and module) and the
web structure from `apps/web/AGENTS.md`. Spaces and seats share one schema file (`space.ts`)
because a seat belongs to its space's aggregate. Bookings get their own file.

## Design overview

1. **Time model** ([research R-1, R-2](./research.md)). Clients send the space's **local
   wall-clock** time (`date` `YYYY-MM-DD`, `startTime` and `endTime` as `HH:mm`). The server
   converts it to UTC instants with `Intl` and the space's IANA zone, and stores `timestamptz`.
   Responses carry the UTC instants and the local fields, so the web app never does time-zone
   arithmetic.
2. **Rules** ([R-3](./research.md)). `evaluateBookingRules(window, timeZone, now)` is pure and
   returns the first broken rule in a fixed order (ADR-0008 section 1). Each rule has its own problem `type`
   (FR-007, "state which rule failed").
3. **Conflicts** ([R-4](./research.md)). Insert the row, then catch the driver error (`err.cause` of
   Drizzle's `DrizzleQueryError`). For SQLSTATE `23P01`, the constraint name tells the two cases apart:
   `booking_seat_no_overlap` maps to 409 `seat-unavailable` and `booking_user_no_overlap` maps to 409
   `user-overlap`. A `40P01` deadlock between concurrent conflicting inserts is retried (at most 3 attempts).
   There is no read-then-write pre-check, so there is no race window.
4. **Email** ([R-5](./research.md)). After the insert commits, `MailService.send(...)` is called
   with `jobId: booking-confirmed-<bookingId>` and awaited for at most 2 s. Errors and timeouts are
   caught and logged at `error` level without the address or body, and the 201 still goes out (FR-008).
5. **Authorization** ([R-6](./research.md)). Every booking query filters on `user_id = session.user.id`.
   Cancelling someone else's booking, or one that does not exist, returns the same 404.
6. **Web**. `/book`: space list → window form → seat grid with a Book button per free seat
   (1 interaction after choosing the window, plus at most one confirmation per ui.md, so SC-001
   is met). `/bookings`: upcoming list with Cancel. Every view has loading, empty, error and
   success states. Problem `type` values map to copy in `lib/booking-problems.ts`.

## Open questions (resolved)

| #   | Question                                  | Resolution                                                                                                                                                | By                            |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | "30 days ahead"                           | `startsAt ≤ now + 30 × 24 h`, as planned                                                                                                                  | product owner                 |
| 2   | Re-cancelling a cancelled own booking     | 200 with the unchanged booking (idempotent)                                                                                                               | architect, ADR-0008 section 4 |
| 3   | Own booking in availability               | Shown as `taken` in this slice. A "yours" marker is a follow-up (below)                                                                                   | product owner                 |
| 4   | Email lost if Redis is down at enqueue    | Accepted for this slice (no outbox). The enqueue is awaited for at most 2 s, and failures are logged at `error`. There is a revisit trigger for an outbox | architect, ADR-0008 section 5 |
| 5   | Local wall-clock requests, per-rule types | Confirmed, plus `ProblemException`, constants for the type URNs, and unnamed shared field formats                                                         | architect, ADR-0008 section 3 |
| 6   | Docs per story                            | One docs task (T016). Developers add a changeset in each PR                                                                                               | architect, ADR-0008 section 6 |

No blocking questions remain.

## Follow-ups (out of scope for this slice)

- **"Yours" marker in availability** (product owner, Q3): an optional field on `SeatAvailability`
  (an additive contract change) and a UI badge. This needs a new spec or a spec amendment.
- **Transactional outbox for booking email**: see the revisit trigger in ADR-0008 section 5.
- **Index on `booking.seat_id`**: add a btree index when seats can be deleted (admin management). Today the
  `ON DELETE RESTRICT` check would scan `booking`, but seats are seed-only.
- **Pagination for `GET /api/bookings`**: the `{ items }` wrapper already allows it. It is needed only if
  the rules (no overlap, at most 30 days ahead) are relaxed.
- **Runbook correction** (T016): `btree_gist` is a trusted extension, so the database owner can create it on RDS.
  The master user is not required (`docs/runbooks/database-migrations.md`).

## Complexity Tracking

No constitution violations to justify. The documented limit under Principle IV (time-dependent
rules enforced only in the service) is inherent: PostgreSQL CHECK constraints cannot depend on
`now()` or on another table. These rules do not need concurrency protection, because they depend
only on the request and the clock, not on other rows.
