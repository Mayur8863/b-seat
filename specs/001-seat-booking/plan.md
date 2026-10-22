# Implementation Plan: Seat booking

**Branch**: `feat/001-seat-booking` (planning branch; each task gets its own branch, see tasks.md) | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-seat-booking/spec.md`

**Architect verdict**: _Pending review_ (the architect replaces this line with `Approved by architect (<date>)` or `Changes required`).

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
│   ├── 0001_<generated>_spaces_bookings.sql # generated tables, checks, FKs, indexes (T002)
│   └── 0002_booking_exclusions.sql          # custom: btree_gist + 2 exclusion constraints (T002)
├── test/
│   ├── fixtures.ts                          # NEW: createSpace/createSeats/insertBooking/signUp helpers (T002; Mailpit helper T010)
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
   returns the first broken rule in a fixed order. Each rule has its own problem `type`
   (FR-007, "state which rule failed").
3. **Conflicts** ([R-4](./research.md)). Insert the row, then catch SQLSTATE `23P01`. The
   constraint name tells the two cases apart: `booking_seat_no_overlap` maps to 409 `seat-unavailable`
   and `booking_user_no_overlap` maps to 409 `user-overlap`. There is no read-then-write
   pre-check, so there is no race window.
4. **Email** ([R-5](./research.md)). After the insert commits, `MailService.send(...)` is called
   with a deterministic `jobId`. Errors are caught and logged without the address or body, and
   the 201 still goes out (FR-008).
5. **Authorization** ([R-6](./research.md)). Every booking query filters on `user_id = session.user.id`.
   Cancelling someone else's booking, or one that does not exist, returns the same 404.
6. **Web**. `/book`: space list → window form → seat grid with a Book button per free seat
   (1 interaction after choosing the window, plus at most one confirmation per ui.md, so SC-001
   is met). `/bookings`: upcoming list with Cancel. Every view has loading, empty, error and
   success states. Problem `type` values map to copy in `lib/booking-problems.ts`.

## Open questions

These do not block the plan, but the architect or a human should confirm each one. The plan uses the default shown.

1. **"30 days ahead"**: the plan treats it as `startsAt ≤ now + 30 × 24 h` (literal "measured from now").
   The alternative is the end of the 30th local calendar day. Confirm with product.
2. **Re-cancelling** an already-cancelled own booking: the plan returns 200 with the cancelled
   booking (idempotent, safe for retries). The alternative is a 409. Architect to confirm in ADR-0008.
3. **Own bookings in availability**: the spec only says "free or taken". The plan shows the user's
   own booking as "taken", with no "yours" marker, so it does not invent behaviour. Product may want a marker later.
4. **Email lost when Redis is down at enqueue time**: FR-008 is met (the booking stands), and
   SC-004 is scoped to "normal operation". A transactional outbox is deferred (research R-5).
   Architect to accept or require the outbox.
5. **Local wall-clock request contract and per-rule problem `type` URNs**: these are new API
   conventions. The architect confirms or changes them in ADR-0008 (T001) before T007 starts.
6. **Docs per story**: the checklist asks for docs per story. This slice uses one docs task
   (T016) for all three stories because the docs surface is small. Split it if the architect prefers.

## Complexity Tracking

No constitution violations to justify. The documented limit under Principle IV (time-dependent
rules enforced only in the service) is inherent: PostgreSQL CHECK constraints cannot depend on
`now()` or on another table. These rules do not need concurrency protection, because they depend
only on the request and the clock, not on other rows.
