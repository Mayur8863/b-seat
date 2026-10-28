# Implementation Plan: Space marketplace (owners list, renters book passes)

**Branch**: `feat/002-space-marketplace` (planning branch; each task gets its own branch, see tasks.md) | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-space-marketplace/spec.md` (Approved by the requester, 2026-10-27)

**Architect verdict**: Approved by architect (2026-10-27)

Decisions are recorded in [ADR-0009](../../docs/adr/0009-pass-bookings-seat-holds-and-slots.md) (pass bookings,
seat holds and the slot time model; amends ADR-0008 sections 1 and 2) and
[ADR-0010](../../docs/adr/0010-account-roles-and-owner-authorization.md) (account roles and owner authorization).
AQ-1 to AQ-8 are answered in [Architect questions](#architect-questions-for-t001-and-the-adrs). No blocking
question remains. The open questions OQ-1 to OQ-12 were accepted by the requester on 2026-10-27, and 001 merges
to `main` before any 002 branch is cut.

The approval comes with the amendments below. They are already applied to this folder, so tasks are dispatched
against the amended text. Task ids are unchanged, and no task was added or split.

| #   | Amendment                                                                                                                                                                                                                                                                                                                                                                                                                                      | Applied in                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A1  | **AQ-1**: option A approved, with **consistency keys**. `booking.holds_active` (stored generated `status = 'active'`) + `booking_hold_key_unique`; `seat_hold_booking_fk (booking_id, seat_id, user_id, active) → booking (…, holds_active) ON UPDATE CASCADE`; `seat_hold_occupancy_mark_fk (occupancy_mark_id, seat_id)` + unique `occupancy_mark_id`. A hold can no longer disagree with its header or mark about seat, renter or activity. | data-model, R-6, T005                                                             |
| A2  | **AQ-7**: "cancelled ⇒ holds inactive" is **DB-enforced** by the A1 cascade (verified on PG 18). Cancel is one `UPDATE booking`; the service never updates `seat_hold`.                                                                                                                                                                                                                                                                        | contracts/bookings.md, data-model, R-6, T055, ADR-0009 §3                         |
| A3  | **AQ-8**: T008 → T005 confirmed. T005's custom migration also adds `booking_no_new_hourly CHECK (kind <> 'hourly') NOT VALID`, so no hourly row can be written unprotected whatever the merge order. Legacy hourly rows become read-only history.                                                                                                                                                                                              | data-model, R-7, T005, ADR-0009 §6                                                |
| A4  | T005 switches the still-live legacy `GET /api/spaces/{id}/availability` to read `seat_hold`, and replaces the hourly `insertBooking` fixture (it would fail A3).                                                                                                                                                                                                                                                                               | R-7, T005                                                                         |
| A5  | **AQ-2**: "compatible" resolution for owner-set boundaries, specified as "the offset in force before the transition". This **amends ADR-0008 section 1** for owner-set boundaries only. `invalid-local-time` is not in the 002 contract. `slotWindow` asserts `end > start`.                                                                                                                                                                   | R-4, contracts/README, T006, ADR-0009 §4, ADR-0008 status                         |
| A6  | `seat_hold_booking_max_length` is 26 hours, not 25 (2-hour DST shifts exist, e.g. `Antarctica/Troll`).                                                                                                                                                                                                                                                                                                                                         | data-model, T005                                                                  |
| A7  | **AQ-3**: dedicated response schemas `PublishIncompleteProblem`, `LabelTakenProblem`, `OccupancyConflictProblem` (`ProblemSchema.extend`). `ProblemSchema` is unchanged. `ProblemException` gains `extensions`, which cannot override standard members (T007).                                                                                                                                                                                 | contracts/README, owner-spaces, owner-operations, T007, T020, T021, T047          |
| A8  | Occupancy: the conflict extension is `{ seatId, label, bookedDates, marks[] }`, so open-ended marks give a finite body. The create takes `lock_timeout`, the space row `FOR SHARE`, then the seat locks (`lockSeats`, ADR-0009 section 9.3, amended 2026-10-28), orders inserts and retries `40P01` like bookings. A mark's status comes from its hold (`ended_at` is audit only).                                                             | R-11, contracts/owner-operations, data-model, T047                                |
| A9  | **AQ-5**: verified against `better-auth@1.7.12` source and official docs. The field is **`accountType`** (`user.account_type`, CHECK `user_account_type_valid`), not `role`, to avoid the `admin` plugin's `user.role`. `required: true`, `validator.input`, no `defaultValue`. The update hook **throws** (never `return false`).                                                                                                             | R-1, data-model, contracts/accounts, contracts/README, T002, quickstart, ADR-0010 |
| A10 | **AQ-6**: 403 for the wrong role confirmed. Booking a `draft` space is 404; only an `unpublished` space gives 422 `space-not-published`.                                                                                                                                                                                                                                                                                                       | R-3, contracts/README, contracts/bookings, ADR-0010                               |
| A11 | `space_published_complete` is replaced by `space_owned_complete` (an owned space is complete) + `space_published_has_owner`. Owner and renter schemas stay non-nullable, which settles the question left in owner-spaces.md.                                                                                                                                                                                                                   | data-model, contracts/owner-spaces, T003, T009                                    |
| A12 | Cubicles are **soft-removed** (`removed_at`, partial unique name), because a hard delete breaks the seats' composite FK. New 409 `listing:cubicle-name-taken`.                                                                                                                                                                                                                                                                                 | data-model, R-15, contracts/README, contracts/owner-spaces, T003, T021            |
| A13 | Hold reads join `seat → seat_hold` by `space_id`. `seat_id = ANY($ids)` skips the GiST index (PG 18 spike: 133,600 rows filtered, versus 200 index probes).                                                                                                                                                                                                                                                                                    | R-6, R-10, data-model query paths, ADR-0009 §7                                    |
| A14 | Contract fixes: owner bookings list is **paged** (`ListOwnerBookingsInput`, `nextCursor`); query inputs are named (`ListMyBookingsInput`, `ListOccupancyInput`); `CalendarUpdate` → `CalendarChange`; the two booking emails are enqueued concurrently (≤ 2 s total).                                                                                                                                                                          | contracts/README, owner-operations, bookings, T037, T046, T056, T058              |
| A15 | **AQ-4**: generated files (`openapi.json`, `drizzle/meta/**`, lockfile, generated client) are excluded from the 400-line budget. Migration SQL counts.                                                                                                                                                                                                                                                                                         | tasks.md Notes                                                                    |

## Summary

Accounts get a role chosen at sign-up (owner or renter; accounts from before this feature are renters). Owners
create listings (name, description, country, city, area, address, time zone, currency, opening hours, utilities),
add seats and cubicles, turn slots on, price day, weekly and monthly passes per slot, set a shared or per-seat
availability calendar, mark seats occupied, and draw a floor plan. Renters search published listings by
location, open one, pick a pass, slot and start date, see each seat as free or taken for the whole period, and
book it. Payment is offline. Both sides get an email.

The core design decisions are:

1. **One header row per booking, one hold row per occupied interval** ([research R-6](./research.md#r-6-multi-day-pass-storage-and-the-conflict-model-adr)).
   The existing `booking` table becomes the pass header (pass, slot, start and end date, price snapshot). A new
   `seat_hold` table stores one row per day-occurrence of a pass and one open-ended row per owner occupancy mark.
   The two "never overlap" invariants (per seat, per renter) move from `booking` to `seat_hold` as the same kind
   of partial exclusion constraints ADR-0008 introduced, so bookings and occupancy marks share one seat
   constraint, and concurrency stays DB-enforced. Composite foreign keys tie every hold to its header or mark
   (seat, renter, and active exactly when the booking is), so cancelling is one statement (ADR-0009). Days the
   calendar closes simply get no hold row.
2. **Slots are derived, never stored as instants on the space** ([R-4](./research.md#r-4-slot-time-model-adr)). A pure module turns
   (opening hours, shift change time, slot, local date, time zone) into a `[start, end)` instant pair. Times
   follow the local wall clock, so a slot can last 11 or 13 hours on a daylight-saving changeover day.
3. **The hourly flow is retired by expand/contract** ([R-7](./research.md#r-7-retiring-the-hourly-flow-expandcontract-adr)). The hourly
   `POST /api/bookings` (no web caller today) is removed first, then the conflict invariants move to `seat_hold`
   with a backfill of not-yet-ended hourly bookings, then the new web flow replaces `/book`, and only then are the
   legacy `GET /api/spaces` routes removed. No merged migration is edited. Legacy columns stay until a later
   contract migration.
4. **Roles live on the Better Auth `user` row** as the required, immutable additional field `accountType`, with a
   database default of `renter` for existing rows ([R-1](./research.md#r-1-storing-the-role-with-better-auth-adr),
   ADR-0010). Owner
   routes sit under `/api/owner/*` behind a role guard. Every owner query is scoped by `owner_id` in SQL, so
   another owner's space returns the same 404 as a missing one ([R-3](./research.md#r-3-authorization-model-adr)).
5. **No new runtime dependency.** Country names, currencies and per-country time zones come from `Intl`. The
   layout editor is a DOM/SVG grid with pointer events and a keyboard model, not a canvas library
   ([R-12](./research.md#r-12-layout-storage-and-the-editor-without-a-new-dependency), [R-13](./research.md#r-13-reference-data-without-a-dependency)).

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 22 LTS (full ICU in `node:22-bookworm-slim`)

**Primary Dependencies**: NestJS 12 + Zod 4 (Standard Schema), `@nestjs/swagger` 12, Drizzle ORM 0.45 / drizzle-kit 0.31,
Better Auth 1.7 (`user.additionalFields`, client `inferAdditionalFields`), BullMQ 6 (`MailService`), Next.js 16 / React 19,
TanStack Query via orval-generated `@bseat/api-client`, React Hook Form + Zod, `@bseat/ui` (shadcn/Radix), lucide icons.
No new runtime dependencies.

**Storage**: PostgreSQL 18 with `btree_gist` (already created by `0002_booking_exclusions.sql`). Range types
(`tstzrange`) and partial GiST exclusion constraints. Redis 8 for the mail queue.

**Testing**: Vitest unit (`src/**/*.spec.ts`), Vitest integration on real Postgres, Redis and Mailpit
(`apps/api/test/*.int-spec.ts`), Testing Library + MSW (`apps/web/src/**/*.test.tsx`), Playwright + axe (`apps/web/e2e`).

**Target Platform**: Linux containers (Docker Compose locally; ECS Fargate + RDS + ElastiCache per ADR-0007)

**Project Type**: Web application (pnpm/Turborepo monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: Search under 1 s at p95 with 1,000 published spaces (SC-003). Seat availability for a
monthly pass on a 200-seat space under 1 s at p95 (SC-004). Both emails within 1 minute (SC-006).

**Constraints**: Exactly 1 of 20 concurrent bookings for one seat and overlapping periods succeeds, also when a
booking races an occupancy mark (SC-005). WCAG 2.1 AA with zero axe violations on every screen, including the
layout editor (SC-007). Changed-line coverage of at least 80%. PRs under about 400 changed lines (generated files
excluded, see AQ-4).

**Scale/Scope**: 8 user stories, 33 FRs. Up to 200 seats per space (FR-007), 1,000 published spaces for the
search target, at most 30 day-occurrences per booking, bookings start at most 30 days ahead.

No `NEEDS CLARIFICATION` items remain in the technical context. Product-level gaps that the spec does not settle
are listed under [Open questions](#open-questions) and are **not** silently resolved: each has a proposed
default that the plan uses only if a human accepts it.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (result below)._

| Principle                                 | Status                        | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code                       | PASS                          | The spec is approved. This plan and tasks.md go to the architect (T001) before any code. Product gaps are open questions, not guesses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| II. Test-first for business logic         | PASS                          | Slot, pass-period, calendar, money and booking-rule logic are pure modules whose failing tests come first (T006, T007). DB constraint tests come before service code (T003, T004, T005). Every AC maps to a test (tasks.md traceability). Integration tests use real Postgres, Redis and Mailpit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| III. Contract-first API                   | PASS (expand/contract)        | Every route has request and response Zod schemas with `.meta({ id })`, produced into `openapi.json` by `gen:api`. Every frontend task depends on the backend task that regenerates the client. The two breaking changes (removing the hourly `POST /api/bookings` and the legacy `GET /api/spaces` routes) follow expand/contract: the replacement ships first, the consumer switches, then the old operation is removed (R-7). The hourly create has no web consumer today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| IV. Invariants live in the database       | PASS (with documented limits) | Seat and renter no-overlap are partial exclusion constraints on `seat_hold`, covering bookings and occupancy marks together. Composite FKs (with an `ON UPDATE CASCADE` from the generated `booking.holds_active`) keep each hold's seat, renter and active flag equal to its header's, and a `NOT VALID` CHECK stops new hourly rows (architect, ADR-0009). Uniqueness (seat labels among active seats, one shared calendar per space, one own calendar per seat, one price per space/slot/pass), ownership FKs, composite FKs that keep seat and space consistent, and CHECKs (price > 0, pass length matches dates, published listings are complete, role values) are in the DB. Limits, enforced in the service with row locks and covered by integration tests: the 200-seat cap, "no removal with future bookings", and the time and calendar rules (they depend on `now()`, the time zone or other tables; same reasoning as ADR-0008 / 001 research R-3). |
| V. Secure and accessible by default       | PASS                          | Every route is behind `AuthGuard` (FR-005). Owner routes add a role guard, and every owner query is scoped by `owner_id` in SQL with 404 parity (FR-009, FR-028). The role is immutable after sign-up (tested against Better Auth's update endpoint). Occupancy notes and renter identities never reach renter responses. UI tasks depend on ui-ux-designer specs, and QA runs axe on every screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| VI. Small, reversible, observable changes | PASS                          | 71 tasks, each S or M, one branch per task. Migrations are additive or relaxing. The one destructive step (dropping the old `booking` exclusion constraints) happens only after the holds are backfilled in the same migration, and after the hourly write path is gone. New log events (`booking.created`, `booking.cancelled`, `occupancy.marked`, `listing.published`, ...) carry ids only. No new runtime dependency, framework or datastore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Post-design re-check (after Phase 1)**: PASS. The data model and contracts introduce no unjustified violation.
The two items that needed an architect decision are decided. The DST policy for owner-set slot boundaries (AQ-2)
amends ADR-0008 section 1 through ADR-0009 section 4. The problem-details extension members (AQ-3) are dedicated
schemas, and `ProblemSchema` is unchanged (ADR-0009 section 8).

## Project Structure

### Documentation (this feature)

```text
specs/002-space-marketplace/
├── spec.md                  # approved spec
├── plan.md                  # this file
├── research.md              # Phase 0 decisions (R-1 … R-16)
├── data-model.md            # tables, constraints, indexes, migrations, state transitions
├── quickstart.md            # runnable validation guide
├── contracts/
│   ├── README.md            # conventions, route map, roles, problem types
│   ├── accounts.md          # sign-up role, GET /api/me, PUT /api/me/preferences, GET /api/reference
│   ├── owner-spaces.md      # /api/owner/spaces: listing, seats, cubicles, pricing, publish
│   ├── owner-operations.md  # calendars, occupancy, owner bookings, layout
│   ├── listings.md          # /api/listings: search, suggestions, detail, seat availability, layout view
│   ├── bookings.md          # create pass booking, my bookings, cancel
│   └── booking-emails.md    # renter confirmation and owner notification
├── ui.md                    # index of the UI specs below (T010)
├── ui/                      # (ui-ux-designer) one file per area so designer tasks can run in parallel
│   ├── 01-shell-accounts.md     # T010
│   ├── 02-owner-listing.md      # T018
│   ├── 03-renter-booking.md     # T029
│   ├── 04-owner-operations.md   # T046
│   └── 05-layout.md             # T061
├── test-plan.md             # (T011, qa-engineer)
├── checklists/requirements.md
└── tasks.md                 # task tracker
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── auth/
│   │   ├── auth.ts                         # EDIT: user.additionalFields.accountType, immutability hook (T002)
│   │   ├── roles.guard.ts (+ .spec.ts)     # NEW: RequireRole('owner') guard, 403 (T002)
│   ├── common/
│   │   ├── errors/problem-types.ts         # NEW: registry of 002 problem type constants + extension problem schemas (T007)
│   │   ├── errors/problem.exception.ts     # EDIT: optional `extensions` (T007, AQ-3)
│   │   ├── money/money.ts (+ .spec.ts)     # NEW: decimal string <-> minor units, saving (T007)
│   │   └── time/zoned-time.ts              # EDIT: add a 'compatible' resolution for owner-set boundaries (T006, per AQ-2)
│   ├── db/schema/
│   │   ├── auth.ts                         # EDIT: user.accountType (T002)
│   │   ├── space.ts                        # EDIT: listing columns, status; cubicle; seat changes (T003)
│   │   ├── pricing.ts                      # NEW: space_slot, pass_price (T004)
│   │   ├── calendar.ts                     # NEW: availability_calendar (T004)
│   │   ├── booking.ts                      # EDIT: pass header columns; seat_hold; occupancy_mark (T005)
│   │   ├── preference.ts                   # NEW: renter_preference (T013)
│   │   └── layout.ts                       # NEW: space_layout, layout_element (T062)
│   ├── db/demo-spaces.ts, db/seed.ts       # EDIT: demo owner/renter, listings, prices, calendars (T009); layout (T063)
│   ├── marketplace/                        # NEW pure domain modules (no Nest, no DB)
│   │   ├── slots.ts (+ .spec.ts)           # slot windows for a local date (T006)
│   │   ├── calendar-rules.ts (+ .spec.ts)  # is a date open for a calendar (T006)
│   │   ├── pass-period.ts (+ .spec.ts)     # occurrences and skipped days of a pass (T006)
│   │   └── booking-rules.ts (+ .spec.ts)   # pass booking rules, ordered (T007)
│   ├── reference/                          # NEW: GET /api/reference (T019)
│   ├── me/                                 # EDIT: role + preferences, PUT /api/me/preferences (T002, T013)
│   ├── owner-spaces/                       # NEW: owner listing CRUD, publish, seats, cubicles, pricing (T020, T021, T027)
│   ├── owner-operations/                   # NEW: calendars (T051), occupancy (T047), owner bookings (T056), layout (T062)
│   ├── listings/                           # NEW: search, suggestions, detail, seat availability, layout view (T028, T034, T035, T038, T062)
│   ├── bookings/                           # EDIT: hourly create removed (T008); pass create (T036), emails (T037), mine + cancel (T055)
│   └── spaces/                             # EDIT: published-only (T008); REMOVED (T043)
├── drizzle/                                # NEW migrations only (0003+); 0000–0002 are never edited
├── test/
│   ├── helpers.ts                          # EDIT: signedInAgent(app, user, accountType = 'renter') (T002)
│   ├── fixtures.ts                         # EDIT: owner/listing/price/calendar/hold fixtures (T003–T005)
│   └── *.int-spec.ts                       # per task (see tasks.md)
└── openapi.json                            # REGENERATED by every contract task

apps/web/src/
├── app/(app)/layout.tsx                    # NEW: signed-in shell with role-aware nav (T014)
├── app/(app)/dashboard/page.tsx            # EDIT: role dashboards (T014, T022, T057)
├── app/(app)/find/page.tsx                 # NEW: Find a space (T039)
├── app/(app)/spaces/[spaceId]/page.tsx     # NEW: listing page: details, passes, seats, book, plan (T031, T040, T041, T066)
├── app/(app)/bookings/page.tsx             # NEW: My bookings (T057)
├── app/(app)/owner/spaces/new/page.tsx     # NEW (T023)
├── app/(app)/owner/spaces/[spaceId]/{page,seats,pricing,availability,bookings,layout}/  # NEW (T022–T024, T030, T048, T052, T058, T065)
├── app/(app)/book/page.tsx                 # REPLACED by a redirect to /find (T042)
├── app/(auth)/sign-up/page.tsx             # EDIT: role choice, optional preferences (T015)
├── components/                             # new components per task, each with *.test.tsx
├── lib/nav.ts (+ .test.ts)                 # NEW: nav config per role + route-manifest test (T014)
├── lib/marketplace-problems.ts (+ .test.ts)# NEW: problem type -> copy (T041 and later)
└── proxy.ts                                # EDIT: matcher covers every (app) route (T014)
apps/web/e2e/                               # NEW journeys per story (T016, T025, T032, T044, T049, T053, T059, T067)
packages/ui/src/components/                 # new shadcn primitives only when a ui/ spec names them
docs/adr/0009-*.md, docs/adr/0010-*.md      # T001
README.md, docs/runbooks/*, .changeset/*    # docs tasks
```

**Structure decision**: Existing monorepo layout and the feature-module pattern from `apps/api/AGENTS.md`. Owner
management (`owner-spaces`, `owner-operations`) and the renter catalogue (`listings`) are separate modules so
that the owner scoping and the published-only scoping never share a query. Pure domain logic lives in
`src/marketplace/` with no Nest or Drizzle imports, so it is unit-testable and reused by availability, search and
booking.

## Design overview

1. **Accounts and navigation** (FR-001 to FR-005; R-1, R-2, R-16). `user.accountType` is a Better Auth additional
   field (`required`, validated, `input: true` on sign-up, refused on update by a throwing hook), backed by a DB
   column `account_type NOT NULL DEFAULT 'renter'` with a CHECK (ADR-0010). Preferences live in `renter_preference` and are saved by a second call after sign-up. The web gets a
   signed-in layout with a nav built from one per-role config, plus a test that fails when a page under `(app)` is
   not reachable from the nav (FR-004). Links are added as pages land, because `typedRoutes` rejects links to
   routes that do not exist yet. The first nav task (T014) ships early and links the existing `/book` page.
2. **Listings** (FR-006 to FR-009; R-3, R-13, R-15). The `space` table is extended in place (expand). New columns
   are nullable, with a CHECK that a published space is complete. The global unique space name is dropped
   (owners are independent). Seats get soft removal and a partial unique label index. Cubicles are a table.
   Publishing checks "at least one active seat and one priced pass in an enabled slot".
3. **Slots, passes, prices** (FR-010 to FR-013; R-4, R-8). Opening hours on the space determine the offered slot
   kinds. `space_slot` stores the on/off flag and `pass_price` stores one `numeric(12,2)` amount per
   (space, slot, pass). Money crosses the API as a decimal string. The saving is computed on the server in minor
   units. Bookings copy price, currency, pass and slot.
4. **Availability and booking** (FR-014 to FR-021; R-5, R-6, R-9, R-10, R-14). For a (seat, pass, slot, start
   date), `pass-period.ts` yields the occurrences: each calendar day of the period that the seat's calendar
   (own, or the shared one) allows, as an instant range. The start day must be open. Booking inserts one header
   row and one `seat_hold` per occurrence in one transaction, in chronological order. `23P01` maps by
   constraint name to `seat-unavailable` or `user-overlap`, and `40P01` retries the transaction (at most 3
   attempts), as in ADR-0008 section 2. Two emails are queued concurrently after commit, bounded at 2 s.
5. **Occupancy** (FR-022, FR-023; R-11). A mark is one `occupancy_mark` row plus one hold per seat, whose range runs
   from the space's day boundary on the start date to the day boundary after the end date (unbounded when there is
   no end date). It shares `seat_hold_seat_no_overlap` with bookings, so a race has one winner (SC-005). The
   insert retries `40P01` like bookings. A conflict lists renter dates and overlapping marks in
   `OccupancyConflictProblem`.
6. **Calendars** (FR-024, FR-025; R-5). One shared calendar row per space (created with the space, backfilled for
   existing spaces) and optional per-seat rows. Changing a calendar never touches holds. The response reports
   how many future bookings now include a closed day.
7. **Bookings lists** (FR-026 to FR-028). Renters list their own pass bookings that have not ended and cancel before
   the first slot starts (one `UPDATE booking`; the FK cascade turns the holds off). Owners list bookings at their
   spaces with renter name and email, paged. Both are scoped in SQL with 404 parity.
8. **Layout** (FR-029 to FR-031; R-12). `space_layout` (grid size, version) and `layout_element` (seat, cubicle or
   area with x, y, w, h). Seats and cubicles are created, renamed and deleted through their own endpoints
   (same rows as the list). The layout PUT saves geometry and areas only, with optimistic concurrency.
   The renter plan reuses the seat-availability response for free and taken states.

## Expand/contract sequence (hourly flow retirement)

| Step  | Task      | Change                                                                                                                                                                                                                                                                        | Safe because                                                                                                                         |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | T003      | `space` gains listing columns and `status` (default `draft`); legacy rows stay valid                                                                                                                                                                                          | additive, nullable                                                                                                                   |
| 2     | T008      | hourly `POST /api/bookings` removed; legacy `GET /api/spaces` and `/availability` return published spaces only                                                                                                                                                                | no web caller of the hourly create; draft listings must not leak (FR-009)                                                            |
| 3     | T005      | `booking` gains pass columns and `holds_active`; `seat_hold` + composite FKs + exclusions created; holds backfilled for active, not-ended hourly rows; `booking_no_new_hourly` (`NOT VALID`) added; old `booking_*_no_overlap` dropped; legacy availability reads `seat_hold` | no code writes hourly rows any more (step 2), the CHECK refuses any that would, and the backfill keeps every live interval protected |
| 4     | T039–T041 | `/find` and `/spaces/[id]` replace the old flow                                                                                                                                                                                                                               | new operations only                                                                                                                  |
| 5     | T042      | `/book` becomes a redirect to `/find`; 001 booking components removed                                                                                                                                                                                                         | consumers of the legacy reads are gone                                                                                               |
| 6     | T043      | legacy `GET /api/spaces` and `/availability` removed, `resolveWindow` moved or removed                                                                                                                                                                                        | no consumer left                                                                                                                     |
| later | follow-up | archive or drop hourly rows, then validate or drop `booking_no_new_hourly` and the hourly CHECKs; drop `space.location`; make `space.owner_id` NOT NULL once every row has an owner                                                                                           | outside this feature                                                                                                                 |

## Open questions

These need a human decision. Each has the default this plan assumes **only if accepted**. Tasks that depend on an
answer say so in tasks.md. None blocks T001.

**Resolved 2026-10-27 by the requester:** every proposed default below (OQ-1 to OQ-12) is accepted. Feature 001 is
merged into `main` first, and 002 task branches are then cut from `main`.

| #     | Question                                                                                                                                                                                          | Proposed default                                                                                                                                                  | Affects                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| OQ-1  | Feature 001 is not merged into `main` (main has only the skeleton), and 002 builds on its code. Should 001 be merged first, or should 002 task branches be cut from `feat/001-seat-booking`?      | Merge 001 first (its OQ-3 decides the PR split), then cut 002 branches from `main`.                                                                               | every task's base branch |
| OQ-2  | 002 replaces the hourly flow and "My bookings". Are 001 tasks T011, T012, T013, T014, T015 and T017 superseded? (T016 looks partly done by `6387984`; T018 and T019 are unaffected.)              | Yes. The task-manager marks them superseded in the 001 tracker after a human confirms. Still-relevant 001 review follow-ups move into T069.                       | 001 tracker, T069        |
| OQ-3  | Legacy hourly bookings that have not ended when the migration runs: keep blocking their seat and renter until they end (hidden from lists), show them read-only in "My bookings", or cancel them? | Keep blocking via backfilled holds; not listed (spec: "kept for history only"). Only dev and test databases can hold such rows, because 001 never reached `main`. | T005, T055               |
| OQ-4  | Search with a start date but no pass or slot: what does "at least one seat free" mean?                                                                                                            | A space matches if at least one seat is free for a **day pass** in **any** offered slot on that date.                                                             | T038, T039               |
| OQ-5  | "Mark vacant" when a seat has a current mark and also future marks.                                                                                                                               | "Mark vacant" ends the mark covering today. Future marks are listed on the seat and can be removed one by one.                                                    | T047, T048               |
| OQ-6  | Deleting a cubicle that holds seats: are its seats deleted too (the edge case's "refused when it has future bookings" suggests so), or unassigned?                                                | The seats in it are removed with it, as one unit, and the whole delete is refused if any of them has a future booking.                                            | T021, T065               |
| OQ-7  | Can fixed working hours cross midnight (e.g. 18:00–02:00)?                                                                                                                                        | No: closing time must be after opening time on the same day.                                                                                                      | T003, T006, T023         |
| OQ-8  | Is the standard utilities list exactly the 11 examples in AC 2.2?                                                                                                                                 | Yes: Wi-Fi, air conditioning, power backup, parking, meeting room, tea/coffee, printer, lockers, 24-hour security, cafeteria, accessible entrance.                | T019                     |
| OQ-9  | The Assumptions say owners may book other owners' spaces. Should the owner nav also show "Find a space" and "My bookings"?                                                                        | Yes (FR-004 requires every page a role can use to be in its nav).                                                                                                 | T014                     |
| OQ-10 | (carried over from 001 OQ-1) Per-user rate limiting on booking writes, now that each booking queues two emails.                                                                                   | Not in this feature; recorded as a follow-up with a human decision.                                                                                               | none                     |
| OQ-11 | Space names: 001 made them globally unique. Drop that, and add no per-owner uniqueness?                                                                                                           | Drop the global unique; no per-owner rule (the spec has none). The seed keys on (owner, name) without a constraint.                                               | T003, T009               |
| OQ-12 | Search result order and page size are not specified.                                                                                                                                              | Name A–Z, then id; 20 per page with a cursor.                                                                                                                     | T034, T039               |

## Architect questions (for T001 and the ADRs)

Answered by the architect on 2026-10-27 (T001). The original question and recommendation are kept for the
record.

| #    | Question                                                                                                                                                                                                              | Plan's recommendation                                                                                                      | Architect decision                                                                                                                                                                                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AQ-1 | Multi-day storage: (A) header + `seat_hold` row per occurrence, (B) occurrence rows in the existing `booking` table, or (C) one `tstzmultirange` per booking?                                                         | A (R-6).                                                                                                                   | **A, amended (A1, A13).** It keeps FR-018/FR-019 as plain exclusion constraints, shared by bookings and occupancy marks, open-ended marks included (unbounded `tstzrange`, verified). Added composite FKs so a hold always matches its header's seat and renter and its mark's seat. Reads must join from `seat`. ADR-0009 §1–3, §7.     |
| AQ-2 | DST at owner-configured slot boundaries (e.g. shift change 01:30 in London): refuse, or resolve with a "compatible" rule (gap → later instant, overlap → earlier)? ADR-0008 section 1 refuses for user-entered times. | Compatible resolution for owner-set boundaries only, computed once by `slots.ts`, so adjacent slots always touch (R-4).    | **Compatible, and it amends ADR-0008 section 1** for owner-set boundaries only (A5). Implemented as "apply the offset in force before the transition". ADR-0008's refusal still governs renter-typed times, and none remain in 002. ADR-0009 §4.                                                                                         |
| AQ-3 | Problem details need `missing` (publish refusal) and `conflicts` (occupancy refusal) extension members. Extend `ProblemSchema` with optional members, or add dedicated named 409/422 schemas?                         | Optional extension members on `ProblemSchema` (additive; RFC 9457 allows extensions).                                      | **Dedicated named response schemas** (`PublishIncompleteProblem`, `LabelTakenProblem`, `OccupancyConflictProblem`), each documented only where it is emitted. `ProblemSchema` is unchanged (A7). This gives precise client types, and other errors do not falsely advertise extensions. ADR-0009 §8.                                     |
| AQ-4 | Do generated files (drizzle snapshots and migrations, `openapi.json`) count toward the 400-line PR budget?                                                                                                            | Excluded, as in 001. The hand-written diff stays under 400.                                                                | **Snapshots, journal, `openapi.json`, lockfile and the generated client are excluded. Migration SQL counts**, because it is reviewed line by line (A15, tasks.md Notes).                                                                                                                                                                 |
| AQ-5 | Verify Better Auth 1.7 `additionalFields` support for `required`, value validation and blocking `/update-user` changes (context7). Name the field `role` (it may clash with the admin plugin if that is ever added)?  | `role`, with a `databaseHooks.user.update.before` guard and a DB CHECK as backstop (R-1).                                  | **Supported in 1.7.12** (verified in the installed source and the official docs; context7 was not available to this session). The field is **`accountType`**, not `role`: the `admin` plugin's `role` would override it. `required: true` + `validator.input` + no `defaultValue`; the update hook **throws** `APIError` (A9). ADR-0010. |
| AQ-6 | A renter calling `/api/owner/*`: 403 (role) or 404?                                                                                                                                                                   | 403 `http-403`. It reveals nothing about a specific space; ownership mismatches stay 404 (R-3).                            | **403**, as recommended. Additionally, a `draft` space is 404 on booking, the same as its detail (A10). ADR-0010 §3.                                                                                                                                                                                                                     |
| AQ-7 | `booking.status = 'cancelled'` ⇒ its holds inactive: service transaction plus integration test, or a DB mechanism (trigger, or a composite FK on a generated column with `ON UPDATE CASCADE`)?                        | Service transaction plus test, documented as a limit (R-6).                                                                | **DB mechanism**: the composite FK on the stored generated `booking.holds_active` with `ON UPDATE CASCADE` (A2). Verified on `postgres:18-alpine`: cancel cascades, and direct deactivation or reactivation fails with `23503`. No trigger. ADR-0009 §3.                                                                                 |
| AQ-8 | Removing the hourly `POST /api/bookings` (T008) before its replacement exists. It has no web caller and has never been released. Acceptable under Constitution III?                                                   | Yes. It is the "contract" half of a never-released operation, and it must land before T005 drops the old exclusions (R-7). | **Yes**, and T008 → T005 stays a hard dependency. T005 adds `booking_no_new_hourly CHECK … NOT VALID` as a safety net, so a wrong merge order produces a 500, never an unprotected row (A3). T005 also moves the legacy availability read (A4). ADR-0009 §6.                                                                             |

## Follow-ups (out of scope for this feature)

- Contract migration: once hourly rows are archived, validate or drop `booking_no_new_hourly`, drop
  `space.location`, the hourly-only CHECKs and the `kind` column, and make `space.owner_id` NOT NULL.
- Transactional outbox for booking emails (ADR-0008 section 5 revisit trigger; two emails per booking now).
- Rate limiting on booking writes (OQ-10).
- Production image hardening (T012 security review): strip `dist/db/seed.js`, `dist/db/seed-run.js`, `dist/db/demo-accounts.js` and `dist/db/demo-spaces.js` from the API runtime image, and make `EnvSchema` reject the `dev-only-`/`ci-` `BETTER_AUTH_SECRET` defaults when `NODE_ENV=production`.
  - Related open question under OQ-10: should a seat-lock timeout (`55P03`, today a generic 500 after 5 s) become a 503 with `Retry-After`? That changes the contract, so it needs a product and architect decision.
- Map, geocoding and distance search; photos; reviews; payment status (spec non-goals).

## Complexity Tracking

No constitution violation needs a waiver. Documented limits under Principle IV:

| Limit                                                                                                      | Why it is not a DB constraint                      | Mitigation                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200 seats per space                                                                                        | needs a count over another set of rows             | `SELECT … FOR UPDATE` on the space row while adding seats; integration test with concurrent bulk adds                                                                    |
| No seat or cubicle removal with future bookings                                                            | depends on `now()`                                 | removal takes the space row `FOR UPDATE`, then the seat locks; booking takes the space row `FOR SHARE`, then the same seat lock (ADR-0009 section 9.3); integration test |
| Time and calendar rules (start day open, slot not started, at most 30 days ahead)                          | depend on `now()`, the time zone or another table  | pure `booking-rules.ts`, unit-tested; not concurrency-sensitive                                                                                                          |
| Booking envelope (`starts_at`/`ends_at`) equals its first and last hold; every occupancy mark has its hold | needs an aggregate or existence over another table | written in one transaction from one computed list; integration tests (T005, T036, T047). "Cancelled ⇒ inactive holds" is no longer a limit: it is DB-enforced (AQ-7)     |
