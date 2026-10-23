---
description: 'Task tracker for 001 seat booking'
---

# Tasks: Seat booking

**Input**: `specs/001-seat-booking/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Required. The constitution (II) makes business logic test-first, and every acceptance criterion maps to an automated test.

**Organization**: Epics → user stories → tasks. Every task has an ID, an owner agent, a branch,
a size (S/M; there are no L tasks), dependencies, a status, and Given/When/Then acceptance
criteria that trace to spec ids (`AC x.y` = User Story x, scenario y; `FR-…`, `SC-…`, and "edge" for the Edge Cases list).

**Status values**: `todo | in-progress | review | done | blocked (reason, unblock owner)`. Only the
task-manager changes owners. Developers set `review`. Only qa-engineer sets `done`.

**Gate**: no task except T001 is dispatched until plan.md reads "Approved by architect".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks in the same phase (different files, no unmet dependency)
- **[Story]**: US1, US2 or US3 (spec user stories)

## Summary table

| ID   | Title                                                      | Owner          | Depends on       | Size | Status | Branch                                |
| ---- | ---------------------------------------------------------- | -------------- | ---------------- | ---- | ------ | ------------------------------------- |
| T001 | ADR-0008 and contract approval                             | architect      | none             | S    | done   | `docs/001-booking-adr`                |
| T002 | Space/seat/booking schema, migrations, DB constraint tests | backend-dev    | T001             | M    | review | `feat/001-booking-schema`             |
| T003 | Zoned time, clock and booking rules (TDD)                  | backend-dev    | T001             | M    | review | `feat/001-booking-rules`              |
| T004 | ProblemException with typed problem details                | backend-dev    | T001             | S    | review | `feat/001-problem-types`              |
| T005 | Seed demo spaces and seats                                 | backend-dev    | T002, T003       | S    | review | `feat/001-seed-spaces`                |
| T006 | UI spec `ui.md` for booking screens                        | ui-ux-designer | T001             | M    | review | `docs/001-booking-ui-spec`            |
| T007 | Spaces list and availability API                           | backend-dev    | T002, T003, T004 | M    | review | `feat/001-spaces-availability-api`    |
| T008 | `/book` page: spaces, window form, seat availability       | frontend-dev   | T006, T007       | M    | done   | `feat/001-book-page-availability`     |
| T009 | Create booking API with rules and conflict mapping         | backend-dev    | T003, T004, T007 | M    | done   | `feat/001-create-booking-api`         |
| T010 | Booking confirmation email                                 | backend-dev    | T009             | S    | done   | `feat/001-booking-confirmation-email` |
| T011 | Book a seat from the availability grid                     | frontend-dev   | T008, T009       | M    | todo   | `feat/001-book-seat-ui`               |
| T012 | My bookings list and cancel API                            | backend-dev    | T009             | M    | todo   | `feat/001-my-bookings-api`            |
| T013 | `/bookings` page with cancel, dashboard links              | frontend-dev   | T006, T008, T012 | M    | todo   | `feat/001-my-bookings-ui`             |
| T014 | QA: find and book (US1+US2) e2e, axe, perf                 | qa-engineer    | T005, T010, T011 | M    | todo   | `test/001-booking-e2e`                |
| T015 | QA: my bookings (US3) e2e, axe, traceability               | qa-engineer    | T013, T014       | S    | todo   | `test/001-my-bookings-e2e`            |
| T016 | Docs: README, runbook, changesets                          | docs-writer    | T015             | S    | todo   | `docs/001-seat-booking-docs`          |
| T017 | ui.md follow-ups from the T008 review (§3.2, §3.4)         | ui-ux-designer | T006             | S    | todo   | `docs/001-ui-spec-followups`          |
| T018 | Gitleaks allowlist so `bin/security` runs every scanner    | devops         | none             | S    | todo   | `chore/001-gitleaks-allowlist`        |
| T019 | Measure `@bseat/api-client` changed lines in coverage      | devops         | none             | S    | todo   | `chore/001-api-client-coverage`       |

---

## Epic 0: Foundation (blocks all stories)

### Phase 1: Design approval

- [x] T001 Write `docs/adr/0008-booking-time-and-conflict-model.md` and record the plan verdict at the top of `specs/001-seat-booking/plan.md`
  - **Owner**: architect · **Branch**: `docs/001-booking-adr` · **Size**: S · **Depends on**: none · **Status**: done
  - **Scope**: Review plan.md, research.md (R-2, R-4, R-5, R-7), data-model.md and contracts/. Record the ADR (MADR, status Accepted) for: the local wall-clock request contract, exclusion constraints with `23P01` mapping by constraint name, per-rule problem `type` URNs, and the email failure policy. Answer plan open questions 2, 4 and 5 in the ADR. Open questions 1 and 3 go to a human.
  - **Acceptance criteria**:
    - Given plan.md, research.md, data-model.md and contracts/, When the architect finishes the review, Then plan.md's verdict line reads `Approved by architect (<date>)`, or `Changes required` with a numbered list (Constitution I).
    - Given ADR-0008, When it is read, Then it states the decision, rationale and alternatives for R-2, R-4, R-5 and R-7, and the resolution of open questions 2, 4 and 5 (Constitution III, IV).
    - Given the contract changes, When reviewed, Then every request schema id ends in `Input`, every response id is a noun, and no schema is shared between request and response (AGENTS.md API conventions).
  - **Result (2026-10-22)**: ADR-0008 is Accepted. plan.md reads "Approved by architect (2026-10-22)", and its eight amendments are already applied in this folder (plan.md, research.md, data-model.md, contracts/, quickstart.md and the T002, T003, T007, T009, T010, T012 and T016 entries below). Q1 and Q3 were answered by the product owner.

### Phase 2: Foundational (after T001; T002, T003, T004 and T006 run in parallel)

- [ ] T002 [P] Add `space`, `seat` and `booking` tables in `apps/api/src/db/schema/space.ts` and `apps/api/src/db/schema/booking.ts`, migrations `apps/api/drizzle/0001_spaces_bookings.sql` and `0002_booking_exclusions.sql`, helpers `apps/api/test/fixtures.ts`, and tests `apps/api/test/booking-constraints.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/001-booking-schema` · **Size**: M · **Depends on**: T001 · **Status**: review
  - **Scope**: Implement data-model.md exactly. Constraints, verbatim:
    - `booking_ends_after_starts CHECK (ends_at > starts_at)`
    - `booking_duration_bounds CHECK (ends_at - starts_at BETWEEN interval '15 minutes' AND interval '10 hours')`
    - `booking_quarter_hour CHECK (extract(epoch FROM starts_at) % 900 = 0 AND extract(epoch FROM ends_at) % 900 = 0)` (no `::bigint`: the cast rounds)
    - `booking_cancel_consistency CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))`
    - `booking_seat_no_overlap EXCLUDE USING gist (seat_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active')`
    - `booking_user_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active')`
    - `UNIQUE (space_id, label)`, `UNIQUE (space.name)`
    - FKs `seat.space_id → space.id ON DELETE RESTRICT`, `booking.seat_id → seat.id ON DELETE RESTRICT`, `booking.user_id → user.id ON DELETE CASCADE`
    - `booking_user_id_starts_at_idx (user_id, starts_at)` (btree, **not** partial, so it also serves the `user` FK cascade)
    - `space.name` CHECK `length(btrim(name)) between 1 and 100`, `space.location` CHECK `length(location) <= 200`, `seat.label` CHECK `length(btrim(label)) between 1 and 20`
    - `seat.features text[] NOT NULL DEFAULT '{}'`
    - `booking.status` enum `booking_status ('active','cancelled') DEFAULT 'active'`. IDs are `uuid DEFAULT gen_random_uuid()`. Times are `timestamptz`.

    Generate `0001` first (`db:generate --name spaces_bookings`). **Then** create the second, hand-written migration (`db:generate --custom --name booking_exclusions`). `--custom` snapshots the current schema, so running it first would swallow the tables. It starts with `CREATE EXTENSION IF NOT EXISTS btree_gist`, and its statements are separated by `--> statement-breakpoint` (data-model.md, Migrations). Write the constraint tests first. `test/fixtures.ts` exports `createSpace`, `createSeats` and `insertBooking` (direct inserts). Extra users come from the existing `signedInAgent` in `test/helpers.ts` (no second sign-up helper).

  - **Acceptance criteria**:
    - Given an active booking for seat S from 09:00 to 12:00, When another active booking for S from 10:00 to 11:00 is inserted, Then the insert fails with SQLSTATE `23P01` on `booking_seat_no_overlap` (FR-005, AC 2.3).
    - Given an active booking for user U on seat S1 from 09:00 to 12:00, When an active booking for U on seat S2 from 11:00 to 13:00 is inserted, Then it fails with `23P01` on `booking_user_no_overlap` (FR-006, AC 2.5).
    - Given an active booking for S and U ending at 12:00, When a booking for the same S and U starting at 12:00 is inserted, Then it succeeds (AC 1.3, edge "touching windows").
    - Given a cancelled booking for S from 09:00 to 12:00, When an active overlapping booking for S is inserted, Then it succeeds (FR-010, edge "cancelled no longer blocks").
    - Given each CHECK above, When a violating row is inserted (end ≤ start, 5 min, 10 h 15 min, start at :10, start at `09:00:00.400`, `cancelled` without `cancelled_at`), Then it fails with `23514` (FR-007 defence in depth).
    - Given the migrated test DB, When `pg_constraint` is queried, Then `booking_seat_no_overlap` and `booking_user_no_overlap` exist with `contype = 'x'` (the custom migration ran).
    - Given two seats with the same label in one space, When the second is inserted, Then it fails with `23505`.
    - Given the migrations, When `bin/pnpm --filter @bseat/api db:generate` runs again, Then no new migration is produced (the schema and snapshot agree).

- [ ] T003 [P] Implement `apps/api/src/common/time/zoned-time.ts`, `apps/api/src/common/time/clock.ts` and `apps/api/src/bookings/booking-rules.ts`, with unit tests written first in `zoned-time.spec.ts` and `booking-rules.spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/001-booking-rules` · **Size**: M · **Depends on**: T001 · **Status**: review
  - **Scope**: Pure functions per research R-1 and R-3: `toInstant`, `toLocal`, `isValidTimeZone`, `evaluateBookingRules({ date, startTime, endTime }, timeZone, now)` returning the first violation in the order `end-before-start, not-on-quarter-hour, invalid-local-time, too-short, too-long, outside-working-hours, starts-in-past, too-far-ahead`, or `null` (order amended by ADR-0008: duration uses the converted instants). `toInstant` returns `{ kind: 'ok', instant } | { kind: 'nonexistent' } | { kind: 'ambiguous' }`, using the ±24 h candidate-offset algorithm in ADR-0008 section 1. It never silently shifts a time. `Clock` is an injectable (`now(): Date`) provider. No new dependencies (use `Intl` only).
  - **Acceptance criteria**:
    - Given `Europe/London`, When `toInstant('2026-10-23','09:00')`, Then it returns `2026-10-23T08:00:00Z`. Given `2026-11-02 09:00`, it returns `09:00:00Z`. Given `Asia/Kolkata` `2026-10-23 09:00`, it returns `03:30:00Z` (edge "spaces in different time zones").
    - Given `Europe/London` `2026-03-29 01:30` (DST gap), When `toInstant` runs, Then it returns `nonexistent`. Given `2026-10-25 01:30` (DST overlap), Then it returns `ambiguous`. Given either as a window start in `evaluateBookingRules`, Then the result is `invalid-local-time` (edge "daylight-saving transitions").
    - Given `Europe/London` on a change day, When `toInstant('2026-03-29','09:00')` and `toInstant('2026-10-25','09:00')` run, Then they return `08:00:00Z` and `09:00:00Z`.
    - Given `now = 2026-10-22T12:00:00Z`, When a window breaks exactly one rule, Then the matching code is returned, with one test per code: `08:00–07:45` end-before-start, `09:10–10:00` not-on-quarter-hour, `09:00–09:00` too-short, `08:00–18:15` too-long, `06:45–08:00` and `19:00–20:15` outside-working-hours, yesterday starts-in-past, 31 days ahead too-far-ahead (FR-007, AC 2.6).
    - Given boundary windows, When evaluated, Then `07:00–17:00` (exactly 10 h), `19:45–20:00` (exactly 15 min) and a start exactly `now + 30 × 24 h` all pass, and a start equal to `now` fails `starts-in-past` (FR-007).
    - Given a window breaking several rules, When evaluated, Then only the first in the documented order is returned.
    - Given the seeded zones, When `isValidTimeZone('Europe/London')` and `isValidTimeZone('Asia/Kolkata')` are called, Then both return true, and `isValidTimeZone('Mars/Base')` returns false (guards against small-ICU builds).
    - Given the PR, When reviewed, Then the failing tests were committed before the implementation, and changed-line coverage is ≥ 80% (Constitution II).

- [ ] T004 [P] Add `apps/api/src/common/errors/problem.exception.ts` and make `apps/api/src/common/errors/problem.filter.ts` honour its `type` and `title`, with tests in `problem.filter.spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/001-problem-types` · **Size**: S · **Depends on**: T001 · **Status**: review
  - **Acceptance criteria**:
    - Given `new ProblemException(409, 'urn:bseat:problem:booking:seat-unavailable', 'Seat unavailable', 'This seat is no longer available for that time.')`, When `ProblemFilter` handles it, Then the response is 409 `application/problem+json` with exactly that `type`, `title` and `detail`, plus `instance` and `requestId` (research R-7).
    - Given a plain `NotFoundException('Seat not found')`, When handled, Then the body is unchanged from today (`urn:bseat:problem:http-404`, `title: 'not found'`) (regression).
    - Given `bin/pnpm gen:api`, When run on this branch, Then `apps/api/openapi.json` is unchanged (`ProblemSchema` untouched, Constitution III).

- [ ] T005 Seed demo data in `apps/api/src/db/seed.ts`
  - **Owner**: backend-dev · **Branch**: `feat/001-seed-spaces` · **Size**: S · **Depends on**: T002, T003 · **Status**: review
  - **Scope**: Idempotent upserts by natural key (`onConflictDoNothing`). Seed "London HQ" (`Europe/London`, location "London, United Kingdom", seats `A-01`…`A-12`) and "Pune Hub" (`Asia/Kolkata`, location "Pune, India", seats `P-01`…`P-08`). Some seats get `standing desk` or `dual monitor`. Validate each zone with `isValidTimeZone` and throw on failure.
  - **Acceptance criteria**:
    - Given a migrated, empty dev DB, When `bin/pnpm db:seed` runs twice, Then exactly 2 spaces and 20 seats exist (12 + 8) with the zones above (FR-012).
    - Given a seed entry with an invalid time zone, When the seed runs, Then it exits non-zero with a message naming the zone.

- [ ] T006 [P] Write `specs/001-seat-booking/ui.md` for `/book`, `/bookings` and the dashboard entry points
  - **Owner**: ui-ux-designer · **Branch**: `docs/001-booking-ui-spec` · **Size**: M · **Depends on**: T001 · **Status**: review
  - **Scope**: Components to cover: space list, booking window form (date plus 15-minute start and end inputs), seat availability grid, book action, booking list item, cancel action, empty states. Reuse `@bseat/ui` (alert, badge, button, card, input, label, skeleton, sonner). If needed, name any shadcn component to add (for example `alert-dialog`, `radio-group`); these use the existing `radix-ui` dependency.
  - **Acceptance criteria**:
    - Given each screen and component, When ui.md is read, Then default, hover, focus, disabled, loading, empty, error and success states are specified (FR-013).
    - Given every problem `type` in `contracts/README.md`, When ui.md is read, Then it gives the exact user-facing copy for each one, plus a generic fallback (FR-007 "state which rule failed", AC 2.3, AC 2.5, AC 3.5).
    - Given the seat grid, When ui.md is read, Then free and taken status is conveyed by text or icon plus label, not colour alone, and all times are shown in the space's local time labelled with its time zone (AC 1.2, edge "time zones").
    - Given the booking flow, When counted from a chosen window, Then a booking takes at most 4 interactions (SC-001).
    - Given mobile, tablet and desktop breakpoints, When ui.md is read, Then layout, keyboard order, focus management after book or cancel, ARIA live regions and contrast notes (light and dark, semantic tokens only) are defined (SC-005).
  - **Follow-up**: the T008 review found two places where ui.md and the built `/book` page differ (§3.2 and §3.4). They are tracked as T017, so this task's review is not reopened.

**Checkpoint**: Schema, rules, problem types and UI spec are ready. Story work can start.

---

## Epic 1: Booking. US1 Find a free seat (P1) 🎯 MVP

**Goal**: A signed-in user picks a space, date and window, and sees every seat as free or taken.
**Independent test**: Seed a space with 6 seats and one booking from 09:00 to 12:00 tomorrow. Availability for 10:00–11:00 shows exactly one taken; 12:00–13:00 shows all free.

- [ ] T007 [US1] Build the spaces module `apps/api/src/spaces/` (schemas, service, controller, module, `spaces.service.spec.ts`), register it in `apps/api/src/app.module.ts`, add `apps/api/test/spaces.int-spec.ts`, and regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/001-spaces-availability-api` · **Size**: M · **Depends on**: T002, T003, T004 · **Status**: review
  - **Scope**: `GET /api/spaces` and `GET /api/spaces/{spaceId}/availability` exactly as in `contracts/spaces.md` (schemas `Space`, `SpaceList`, `AvailabilityQueryInput`, `SpaceAvailability`, `SeatAvailability`). One availability query using the `tstzrange … &&` predicate, with `status = 'active'` and `'[)'` written as SQL literals so the partial GiST index applies (research R-9, data-model.md). Integration tests first.
  - **Acceptance criteria**:
    - Given I am signed in and two spaces exist, When I `GET /api/spaces`, Then I get 200 `{ items }` ordered by name, each with `name`, `location`, `timeZone` and `seatCount` (AC 1.1, FR-002).
    - Given a space with 6 seats and one active booking from 09:00 to 12:00 tomorrow (local), When I request availability for tomorrow 10:00–11:00, Then 5 seats are `free` and the booked seat is `taken` (AC 1.2, FR-003).
    - Given the same booking, When I request 12:00–13:00, Then all 6 are `free` (AC 1.3).
    - Given a cancelled booking overlapping the window, When I request availability, Then that seat is `free` (FR-010).
    - Given a space in `Asia/Kolkata` with a booking from 09:00 to 10:00 local, When I request 09:30–10:30 local, Then that seat is `taken`, and `window.startsAt` is `04:00:00Z` (edge "time zones").
    - Given a window in the past, When I request availability, Then I get 200 (edge "rule-breaking windows are viewable").
    - Given no session cookie, When I call either route, Then I get 401 `application/problem+json` (AC 1.4, FR-001).
    - Given an unknown `spaceId`, Then 404. Given `endTime <= startTime` or a malformed id, Then 400 `validation` (edge "not found").
    - Given London HQ and `2026-03-29` `00:30–01:30` (the end is in the DST gap), When I request availability, Then 422 `urn:bseat:problem:booking-rule:invalid-local-time` (edge DST).
    - Given the response, When inspected, Then it contains no user ids or names (FR-011).
    - Given `bin/pnpm gen:api`, When run, Then `openapi.json` contains exactly the schemas above and is committed (Constitution III).

- [x] T008 [US1] Build the `/book` page `apps/web/src/app/(app)/book/page.tsx` with `components/space-list.tsx`, `components/booking-window-form.tsx` and `components/seat-availability.tsx` (each with `*.test.tsx`), and extend the matcher in `apps/web/src/proxy.ts`
  - **Owner**: frontend-dev · **Branch**: `feat/001-book-page-availability` · **Size**: M · **Depends on**: T006, T007 · **Status**: done
  - **Scope**: Generated hooks `useSpacesList` and `useSpacesAvailability` only (no `fetch`). React Hook Form + `zodResolver` for the window form. Follow ui.md states and copy. The page has a `metadata` title, one `<h1>` and `<main id="main">`. The Book action itself is T011.
  - **Acceptance criteria**:
    - Given the spaces mock returns two spaces, When `/book` renders, Then a loading state shows first, then each space's name and location (AC 1.1). Given `items: []`, Then the ui.md empty state shows. Given a 500 problem, Then an error alert with `role="alert"` shows (FR-013).
    - Given a chosen space and window, and an availability mock with 6 seats (1 taken), When the grid renders, Then 6 seats show, 5 labelled free and 1 labelled taken in text (not colour only), with times labelled with the space's time zone (AC 1.2, edge "time zones").
    - Given the window form, When submitted with end ≤ start, Then a field error is shown and linked with `aria-describedby`, and no request is sent. Every input has a `<Label>`.
    - Given no session cookie, When visiting `/book` or `/bookings`, Then the browser is redirected to `/sign-in?next=…` (AC 1.4; `proxy.ts` matcher includes `/book/:path*` and `/bookings/:path*`).
    - Given `bin/pnpm --filter @bseat/web lint typecheck test`, When run, Then it passes, with changed-line coverage ≥ 80%.

**Checkpoint**: US1 can be demonstrated through the API and UI.

---

## Epic 1: Booking. US2 Book a seat (P1) 🎯 MVP

**Goal**: Book a free seat for a valid window and get on-screen and email confirmation. Conflicts and rule breaks are refused with a reason.
**Independent test**: Book a free seat. It appears as taken for that window, and a confirmation email arrives.

- [x] T009 [US2] Build the bookings module `apps/api/src/bookings/` (`bookings.schemas.ts`, `bookings.service.ts`, `bookings.service.spec.ts`, `bookings.controller.ts`, `bookings.module.ts`) with `POST /api/bookings`, add `apps/api/test/bookings.int-spec.ts`, and regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/001-create-booking-api` · **Size**: M · **Depends on**: T003, T004, T007 · **Status**: done
  - **Scope**: As in `contracts/bookings.md` (`CreateBookingInput`, `Booking`). Load the seat and space, run `evaluateBookingRules`, insert, and map driver errors from `DrizzleQueryError.cause` exactly as in contracts/bookings.md (`23P01` by constraint name, `40P01` retried at most 3 attempts in total, seat FK `23503` → 404, anything else rethrown). Use the injected `Clock`. Log `booking.created` with ids only. Unit tests of the error mapping come first. The email is T010.
  - **Acceptance criteria**:
    - Given a free seat and a valid window tomorrow, When I `POST /api/bookings`, Then I get 201 `Booking` with local `date`, `startTime`, `endTime`, `timeZone`, UTC `startsAt` and `endsAt`, `status: "active"`, and availability for that window shows the seat `taken` (AC 2.1, FR-004).
    - Given another user holds the seat for an overlapping window, When I book it, Then I get 409 `urn:bseat:problem:booking:seat-unavailable` and no row is created (AC 2.3, FR-005).
    - Given 20 different signed-in users, When all 20 `POST` the same seat and window concurrently (`Promise.all`), Then exactly one 201 and nineteen 409 `seat-unavailable` are returned, and exactly one active row exists. This is repeated 5 times in the test (AC 2.4, SC-002).
    - Given I hold 09:00–12:00, When I book any other seat for 11:00–13:00 the same day, Then I get 409 `urn:bseat:problem:booking:user-overlap` (AC 2.5, FR-006).
    - Given a window that breaks a rule (one case per `booking-rule:*` type in contracts/README.md), When I book, Then I get 422 with that `type` and a `detail` naming the rule, and no row is created (AC 2.6, FR-007).
    - Given I hold 09:00–12:00 on seat S, When I book S from 12:00 to 13:00, Then I get 201 (edge "touching windows").
    - Given the insert rejects with a `DrizzleQueryError` whose `cause.code` is `40P01` once and then `23P01` on `booking_seat_no_overlap` (unit test), When I book, Then the INSERT runs twice and the result is 409 `seat-unavailable`. Given `40P01` on all 3 attempts, Then the error is rethrown (500) (ADR-0008 section 2, SC-002).
    - Given an unknown `seatId`, Then 404. Given a malformed body, Then 400 `validation`. Given no session, Then 401 (edge "not found", FR-001).
    - Given the 201 body, When inspected, Then it contains no `userId` (FR-011).
    - Given `bin/pnpm gen:api`, When run, Then `openapi.json` includes `CreateBookingInput` and `Booking` and is committed.

- [x] T010 [P] [US2] Send the booking confirmation email: `apps/api/src/bookings/booking-confirmation.mail.ts` (+ `.spec.ts`), add an optional `jobId` to `apps/api/src/mail/mail.service.ts`, and extend `apps/api/test/bookings.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/001-booking-confirmation-email` · **Size**: S · **Depends on**: T009 · **Status**: done
  - **Scope**: Content per `contracts/booking-email.md`. Enqueue after commit with `jobId: booking-confirmed-<bookingId>` (no `:`, which BullMQ 6 rejects), awaited for at most 2 s. Catch enqueue errors and timeouts, and log them at `error` level as `booking.confirmation_not_queued` (research R-5, ADR-0008 section 5). The integration test polls Mailpit's HTTP API (`http://$SMTP_HOST:8025/api/v1/search?query=to:<unique address>`) through a small helper in `apps/api/test/fixtures.ts`.
  - **Acceptance criteria**:
    - Given a successful booking for a unique address, When at most 60 s pass, Then Mailpit holds one message to that address with subject `Seat {label} booked at {space} on {date}`, and the body contains the space name, seat label, local date, local start–end and the IANA time zone (AC 2.2, SC-004).
    - Given `MailService.send` rejects, or never settles (fake timers, Redis down), in a unit test with a mocked `MailService`, When a booking is created, Then the service returns the booking within the 2 s bound, the row persists, and an `error` log `booking.confirmation_not_queued` has `bookingId` and no address or body (FR-008).
    - Given the same booking id is enqueued twice, When the queue is inspected, Then only one job exists (jobId dedupe).
    - Given `buildBookingConfirmation`, When unit-tested with a `Europe/London` booking in winter and in summer, Then the local times in the text match the space's wall-clock times (edge "time zones").

- [ ] T011 [US2] Add the Book action to `apps/web/src/components/seat-availability.tsx` and add `apps/web/src/lib/booking-problems.ts` (+ tests)
  - **Owner**: frontend-dev · **Branch**: `feat/001-book-seat-ui` · **Size**: M · **Depends on**: T008, T009 · **Status**: todo
  - **Scope**: `useBookingsCreate` mutation. On success, show a sonner toast and invalidate the availability and my-bookings queries. `booking-problems.ts` maps each problem `type` to ui.md copy, with a fallback to `detail`. Focus handling per ui.md.
  - **Acceptance criteria**:
    - Given a free seat in the grid, When I press Book (and confirm, if ui.md defines a confirmation), Then `useBookingsCreate` is called with `{ seatId, date, startTime, endTime }`, a success message names the space, seat and local time, and after refetch the seat shows as taken (AC 2.1).
    - Given the API returns 409 `booking:seat-unavailable`, 409 `booking:user-overlap` or any 422 `booking-rule:*`, When I book, Then an alert (`role="alert"`) shows the ui.md copy for that type. An unknown type shows `detail` (AC 2.3, AC 2.5, AC 2.6, FR-007).
    - Given a booking request is pending, When I press Book again, Then nothing is sent (the button is disabled and `aria-busy`).
    - Given the window is already chosen, When the test counts user-event actions to reach the success message, Then there are ≤ 4 (SC-001).
  - **Review follow-ups (from T008)**:
    - Reset the seat selection when the user submits a new window. The reviewer recommends remounting with `key={submitCount}` on `SeatAvailability` instead of lifting selection state into the page.
    - Decide explicitly whether a selection carries over to a new window, and record the decision in the PR description. If the answer changes ui.md §3.5, tell ui-ux-designer (T017). The recommended default is no carry-over, which matches the `key` reset.
    - Fix the known gap from T008: a submit served entirely from a fresh cache does not scroll to the seat grid, because `scrollSignal` only increments when a request succeeds. Code review found a side effect (N1): after a cache-served submit, `askedAt` never settles, so the next background refetch shows the busy UI and scrolls the page. Suggested fix: in `apps/web/src/components/book-view.tsx`, replace the `askedAt`/`dataUpdatedAt` timestamp comparison with `queryClient.fetchQuery({ ...options, staleTime: 0 })` and an `asking` flag that is cleared in `finally`.
    - Split the PR into commits: `packages/ui` primitives first, then `lib/` and its tests, then components. This keeps each commit near the 400-line guideline.
  - **Acceptance criteria (review follow-ups)**:
    - Given I selected a free seat for window W1, When I submit a different window W2, Then no seat is selected in W2's grid and the booking bar shows the "Select a free seat to book it." hint (ui.md §3.5, AC 2.1).
    - Given the carry-over decision, When the PR is reviewed, Then the description states it, and a test in `seat-availability.test.tsx` or `book-view.test.tsx` proves it.
    - Given the window W was already loaded and its availability is still fresh in the query cache, When I submit W again, Then the "Seats" heading is scrolled into view (`block: 'start'`) and focus stays on the submit button (ui.md §3.3).
    - Given a submit of W was served from the cache, When a later background refetch of W runs (for example on window focus or after invalidation), Then the submit button does not show the busy state, `aria-busy` is not set, and the page does not scroll. Only user-requested submits scroll (code review N1, ui.md §3.3).
    - Given the branch history, When reviewed, Then the `packages/ui`, `lib/` + tests and component changes are in separate commits, each close to 400 changed lines or fewer.

**Checkpoint**: US1 and US2 together form the MVP (find and book).

---

## Epic 2: Manage bookings. US3 See and cancel my bookings (P2)

**Goal**: The user sees their upcoming bookings and cancels one that has not started, which frees the seat.
**Independent test**: User A has two upcoming bookings and B has one. A's list shows only A's two, soonest first. Cancelling one frees the seat.

- [ ] T012 [US3] Add `GET /api/bookings` and `POST /api/bookings/{bookingId}/cancel` to `apps/api/src/bookings/` (service, controller, `bookings.service.spec.ts`), add `apps/api/test/my-bookings.int-spec.ts`, and regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/001-my-bookings-api` · **Size**: M · **Depends on**: T009 · **Status**: todo
  - **Scope**: As in `contracts/bookings.md` (`BookingList`, cancel processing, `$now` from `Clock`). Scope by owner inside the SQL `WHERE`. Log `booking.cancelled` with ids only.
  - **Acceptance criteria**:
    - Given user A has two upcoming bookings (inserted latest first), one ended and one cancelled, and user B has one, When A calls `GET /api/bookings`, Then exactly A's two upcoming bookings return, soonest first, each with space, seat and local date and time (AC 3.1, FR-009, FR-011).
    - Given A has no upcoming bookings, When A lists, Then the response is 200 `{ "items": [] }` (AC 3.2).
    - Given A has a booking that has not started, When A cancels it, Then the response is 200 with `status: "cancelled"` and `cancelledAt` set, it is gone from A's list, availability shows the seat `free` for that window, and A can book an overlapping window again (AC 3.3, FR-010).
    - Given A's booking id, When B cancels it, Then B gets a 404 whose `type`, `title`, `status` and `detail` are identical to cancelling a random UUID, and A's booking is still active (AC 3.4, FR-011).
    - Given a booking that has started (inserted with a past start through `insertBooking`), When its owner cancels it, Then the response is 409 `urn:bseat:problem:booking:already-started` and it stays active (AC 3.5).
    - Given an already-cancelled own booking, When cancelled again, Then the response is 200 with the same booking and an unchanged `cancelledAt` (idempotent, ADR-0008 section 4).
    - Given no session, Then both routes return 401 (FR-001). Given `bin/pnpm gen:api`, Then `BookingList` and the cancel operation are in the committed `openapi.json`.
  - **Review follow-ups (from T009 and T010; all minor or nit)**: land these as separate commits before the list and cancel work. If the PR grows past about 400 changed lines, tell the task-manager so the follow-ups can move to their own task.
    - (a) Move `resolveWindow` out of `spaces/spaces.service.ts` into `common/time/zoned-time.ts` or `bookings/booking-rules.ts`, and type its input as `{ date; startTime; endTime }` instead of `AvailabilityQueryInput`. Its tests in `spaces.service.spec.ts` move with it. Ideally `evaluateBookingRules` returns the resolved instants, so the conversion happens once per request. (code review M1)
    - (b) Add an integration test where `POST /api/bookings` sends `{ ...valid, userId: otherUserId }`. Optionally switch `CreateBookingInput` to `z.strictObject` (this changes the contract, so run `gen:api`). (security m3, OWASP A01)
    - (c) Give the mail queue producer a fail-fast path for a Redis outage, so abandoned enqueues do not pile up in memory. Either check `redis.status !== 'ready'` before `add`, or give the producer its own connection with `enableOfflineQueue: false`, as BullMQ recommends for producers. The worker keeps its current connection. (security m2, OWASP A10)
    - (d) Log a `warn` called `booking.insert_deadlock_retry` with `{ seatId, attempt }` on each `40P01` retry. A small jittered delay (5–25 ms) is optional. (code review N2, security n4)
    - (e) In `test/bookings.int-spec.ts` (currently lines 359-360), relax the real-timer upper bound from `4_000` to `5_000` ms. (N4)
    - (f) Extend the comment on the `invalid-local-time` 422 case in `test/bookings.int-spec.ts`. It should say the past date is deliberate and that the case relies on the specified rule order (`invalid-local-time` is checked before `starts-in-past`). (N1)
    - (g) Fix the comment on BullMQ `jobId` dedupe in `mail/mail.service.ts`: dedupe only holds while the job is retained (`removeOnComplete: 1_000` is count-based). Consider age-based `removeOnComplete`. (n3)
    - (h) In `test/fixtures.ts`, stop deriving the Mailpit URL from `SMTP_HOST`. Either read a dedicated `MAILPIT_URL` (document it in `.env.example`; set it in compose or CI with devops if needed), or restrict the host to `localhost` or `mailpit`. (n5)
  - **Acceptance criteria (review follow-ups)**:
    - (a) Given the bookings and spaces modules, When reviewed, Then `bookings.service.ts` no longer imports from `spaces/spaces.service.ts`, and `resolveWindow` (input typed `{ date: string; startTime: string; endTime: string }`) lives in `common/time/zoned-time.ts` or `bookings/booking-rules.ts` with its existing unit tests passing unchanged. Given `evaluateBookingRules` is changed to return the resolved instants, Then a create request converts the window to instants only once, and the `booking-rules.spec.ts` cases still pass. If it is not changed, the PR says why (code review M1, FR-007).
    - (b) Given signed-in users A and B, When A sends `POST /api/bookings` with `{ ...validInput, userId: B.id }`, Then the created row's `user_id` is A's id and B has no bookings. If `z.strictObject` is adopted, the response is instead 400 `validation`, no row is created, and the committed `openapi.json` shows `additionalProperties: false` (FR-011, OWASP A01).
    - (c) Given Redis is not ready, When a booking is created (unit test with the producer connection stubbed as not ready, or offline), Then the enqueue rejects at once instead of being buffered, the API still returns 201 well inside the 2 s bound, `booking.confirmation_not_queued` is logged, and the producer holds no pending command (FR-008, ADR-0008 section 5, OWASP A10).
    - (d) Given the insert rejects with `40P01` once and then succeeds (unit test), When I book, Then exactly one `warn` log `booking.insert_deadlock_retry` is written with `{ seatId, attempt: 1 }` and no user data. Given jitter is added, Then it stays within 5–25 ms and the unit test controls it (fake timers or an injected delay), so the test is deterministic (ADR-0008 section 2, SC-002).
    - (e) Given the real-timer enqueue-timeout integration test, When it runs, Then it asserts `elapsed >= 1_900` and `elapsed < 5_000` (FR-008).
    - (f) and (g) Given the changed comments, When reviewed, Then (f) states that the past date is deliberate and depends on the rule order, and (g) states that dedupe only holds while the job is retained. Given age-based `removeOnComplete` is adopted, Then the `jobId` dedupe test from T010 still passes.
    - (h) Given `test/fixtures.ts`, When the Mailpit helper builds its URL, Then the URL comes from `MAILPIT_URL` (with a default of `http://localhost:8025`), or from a host checked against an allowlist of `localhost` and `mailpit`. Any other host throws before a request is made (AC 2.2).

- [ ] T013 [US3] Build the `/bookings` page `apps/web/src/app/(app)/bookings/page.tsx` with `components/my-bookings.tsx` (+ `.test.tsx`), and replace the dashboard placeholder in `apps/web/src/app/(app)/dashboard/page.tsx` with links
  - **Owner**: frontend-dev · **Branch**: `feat/001-my-bookings-ui` · **Size**: M · **Depends on**: T006, T008, T012 · **Status**: todo
  - **Scope**: `useBookingsListMine` and `useBookingsCancel`. Use ui.md states and copy. Invalidate the list and availability after cancel. The page has `metadata`, one `<h1>` and `<main id="main">`.
  - **Acceptance criteria**:
    - Given the list mock returns two bookings, When `/bookings` renders, Then a loading state shows first, then both bookings in API order, each with space, seat, local date and time, and the time zone label (AC 3.1).
    - Given `items: []`, When it renders, Then the ui.md empty state shows a link to `/book` (AC 3.2).
    - Given an upcoming booking, When I cancel it (with the ui.md confirmation, if defined), Then a success message shows and the booking disappears after refetch (AC 3.3).
    - Given the API returns 409 `booking:already-started`, When I cancel, Then an alert shows the ui.md copy and the booking stays listed (AC 3.5). Given a 500, Then an error alert shows (FR-013).
    - Given the dashboard, When it renders, Then it has links "Book a seat" (`/book`) and "My bookings" (`/bookings`) instead of the placeholder text.
  - **Review follow-ups (from T008)**:
    - Add the "My bookings" outline button (`Button variant="outline" asChild`, linking to `/bookings`) to the `/book` page header, in a `flex flex-wrap justify-between` row with the h1 (ui.md §1). It was deferred from T008 because typedRoutes rejects a link to a route that does not exist yet.
    - Once `/bookings` exists, type `ProblemPart.href` in `apps/web/src/lib/booking-problems.ts` as `Route`, and remove the `href as Route` cast in `apps/web/src/components/problem-alert.tsx`.
  - **Acceptance criteria (review follow-ups)**:
    - Given `/book` renders, When the header is inspected, Then it shows the h1 and an outline link "My bookings" to `/bookings` in one `flex flex-wrap justify-between` row, and the link comes right after the h1 in tab order (ui.md §1, §3.1).
    - Given `booking-problems.ts` and `problem-alert.tsx`, When `bin/pnpm --filter @bseat/web typecheck` runs, Then it passes with `ProblemPart.href: Route` and no `as Route` cast remaining in `problem-alert.tsx`.

**Checkpoint**: All three stories are functional.

---

## Epic 3: Quality and release

- [ ] T014 QA for US1 and US2: `apps/web/e2e/booking.spec.ts` (journey + axe) and `apps/api/test/availability-perf.int-spec.ts`. Set T007–T011 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/001-booking-e2e` · **Size**: M · **Depends on**: T005, T010, T011 · **Status**: todo
  - **Scope**: e2e runs against the seeded stack. Pick a random date 2–28 days ahead and the first free seat, to avoid collisions with persisted dev data. Add reproduction steps for any failure to the owning task.
  - **Review follow-ups (from T008 QA)**:
    - Under parallel load there are intermittent flakes: a sign-up redirect timeout in `auth.spec.ts`, an axe "execution context destroyed" on `/` (mobile), and a failure in the sign-up step of the `/book` axe test. Fix them with a sturdier sign-up helper (create the user through the API, then wait for hydration before acting), or with a fixed worker count. Do not fix them with retries alone.
    - Known coverage gap: the keyboard-only `/book` journey runs on Chromium only. Firefox and WebKit are not covered. Either extend it to those projects, or state the gap in the PR so a human can accept it.
  - **Acceptance criteria**:
    - Given a new user signs up, When they open `/book`, choose London HQ, a date and a window, and book the first free seat, Then the success message appears and the seat shows taken (AC 1.1, AC 1.2, AC 2.1). After choosing the window it takes ≤ 4 interactions and < 30 s (SC-001).
    - Given a signed-out visitor, When they open `/book`, Then they land on `/sign-in?next=%2Fbook` (AC 1.4).
    - Given `/book` in its initial, availability-loaded and conflict-error states, When axe runs with WCAG 2.1 AA tags, Then there are zero violations (SC-005, FR-013).
    - Given a space with 200 seats and 200 active bookings, When availability is requested 50 times, Then p95 latency is < 1000 ms, and `EXPLAIN` (recorded in the PR) shows the GiST index in use (SC-003).
    - Given the full suite (`bin/pnpm lint typecheck test build`, e2e), When run, Then it is green, and the PR lists the test that proves each AC for US1 and US2.
    - Given the stack is running with the default e2e worker count (or the fixed count chosen above, recorded in `playwright.config.ts`), When `docker compose --profile e2e run --rm e2e` runs 5 times in a row, Then all 5 full runs are green. Tests in `auth.spec.ts`, the `/` axe test (mobile) and the `/book` axe test pass without retries (SC-005, FR-013).
    - Given the keyboard-only `/book` journey, When the PR is reviewed, Then it either runs on Chromium, Firefox and WebKit, or the PR states that only Chromium is covered.

- [ ] T015 QA for US3: `apps/web/e2e/my-bookings.spec.ts` (journey + axe) and the final traceability check. Set T012–T013 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/001-my-bookings-e2e` · **Size**: S · **Depends on**: T013, T014 · **Status**: todo
  - **Acceptance criteria**:
    - Given a user with one booking, When they open `/bookings` and cancel it, Then it disappears, and `/book` shows the seat free for that window (AC 3.1, AC 3.3).
    - Given a user with no bookings, When they open `/bookings`, Then the empty state links to `/book` (AC 3.2).
    - Given `/bookings` (with items and empty) and `/dashboard`, When axe runs, Then there are zero WCAG 2.1 AA violations (SC-005).
    - Given the traceability table below, When QA checks each row, Then every FR, AC and SC row names a passing test. Missing rows reopen the owning task.

- [ ] T016 Document the feature: `README.md` feature section, `docs/runbooks/` (seed, `btree_gist` on RDS, mail troubleshooting), Swagger tag descriptions check, and `.changeset/*` for `@bseat/api` and `@bseat/web`
  - **Owner**: docs-writer · **Branch**: `docs/001-seat-booking-docs` · **Size**: S · **Depends on**: T015 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new contributor, When they follow `specs/001-seat-booking/quickstart.md` and the README, Then every step produces the documented result (FR-012 seed, the API walk-through).
    - Given the runbook, When an operator deploys to RDS, Then it states that the `0002_booking_exclusions` migration creates `btree_gist` (a trusted extension, so the database owner can create it; correct the existing "master user" wording in `docs/runbooks/database-migrations.md`), and explains how to diagnose missing confirmation emails (FR-008).
    - Given the release, When `bin/pnpm changeset status` runs, Then user-visible changesets exist for `@bseat/api` and `@bseat/web`.

### Review follow-ups (from the T008–T010 reviews)

- [ ] T017 [P] Bring `specs/001-seat-booking/ui.md` in line with the reviewed `/book` behaviour (T008 review follow-up)
  - **Owner**: ui-ux-designer · **Branch**: `docs/001-ui-spec-followups` · **Size**: S · **Depends on**: T006 · **Status**: todo
  - **Scope**: Spec-only edits to ui.md. §3.2: note that the "Office space" fieldset legend renders only in the loading state. §3.4: when a background refetch fails while data is shown, the seat alert appears above the grid, which stays visible. The designer confirms that this is the intended behaviour, or specifies the change for frontend-dev (raise it with the task-manager so it becomes a task).
  - **Acceptance criteria**:
    - Given ui.md §3.2, When read, Then it states that the space fieldset legend renders only in the loading state (FR-013).
    - Given ui.md §3.4, When read, Then it specifies the "refetch failed while data is shown" state: the alert (`role="alert"`) shows above the still-visible grid, with its copy and its "Try again" action. The PR records that the designer confirms this behaviour, or lists the requested change (FR-013).

- [ ] T018 [P] Make `bin/security` run all its scanners locally: add a gitleaks allowlist, or scan in git mode
  - **Owner**: devops · **Branch**: `chore/001-gitleaks-allowlist` · **Size**: S · **Depends on**: none · **Status**: todo
  - **Scope**: `bin/gitleaks dir .` currently reports 75 hits in untracked files. `bin/security` chains its steps with `&&`, so Semgrep and Trivy never run locally. Either add a `.gitleaks.toml` allowlist (extending the default rules) for `node_modules`, `.pnpm-store`, `.next` and `.turbo`, or switch the gitleaks step of `bin/security` to `git` mode. Keep CI's gitleaks behaviour at least as strict as it is today.
  - **Acceptance criteria**:
    - Given a working tree after `bin/pnpm install` and `bin/pnpm build`, When `bin/security gitleaks` runs, Then it reports no findings in `node_modules`, `.pnpm-store`, `.next` or `.turbo`, and exits 0 when no real secret exists.
    - Given a known test secret in a source file under `apps/` (in dir mode, in the working tree; in git mode, in a throwaway commit on a scratch branch that is deleted afterwards), When `bin/security gitleaks` runs, Then it still reports the finding and exits non-zero. The change does not hide application sources.
    - Given a clean tree, When `bin/security` runs with no argument, Then the gitleaks, Semgrep and Trivy steps all execute (all three `==>` headers are printed).

- [ ] T019 [P] Measure `packages/api-client` changed lines against the 80% diff-cover gate
  - **Owner**: devops (the CI and coverage wiring). qa-engineer reviews the test placement. · **Branch**: `chore/001-api-client-coverage` · **Size**: S · **Depends on**: none · **Status**: todo
  - **Scope**: Today the changed lines in `packages/api-client/src/fetcher.ts` are never measured: no package collects coverage for them, and CI's diff-cover step (`.github/workflows/ci.yml`, currently lines 72-77) only reads the `apps/api` and `apps/web` lcov files. Choose one option:
    - Give `@bseat/api-client` its own vitest config (with a coverage floor) and `test` script. Its `lcov.info` is then path-fixed and passed to diff-cover.
    - Or add `packages/api-client/src/fetcher.ts` to the web vitest coverage `include`, with repo-relative paths in the lcov.

    Optionally move `apps/web/src/lib/api-fetcher.test.ts` into the package. Generated code (`src/generated`) stays excluded. No new dependencies are needed beyond vitest, which the workspace already has.

  - **Acceptance criteria**:
    - Given a PR that changes `packages/api-client/src/fetcher.ts`, When CI's "Coverage ≥ 80% on changed lines" step runs, Then diff-cover reports those lines, and fails the step if under 80% of them are covered (Definition of done: changed-line coverage).
    - Given `bin/pnpm test:coverage`, When run, Then the lcov covering `fetcher.ts` is produced with paths diff-cover resolves (for example `SF:packages/api-client/src/fetcher.ts`), and `src/generated/**` is excluded.
    - Given the fetcher tests (in the package or in `apps/web`), When `bin/pnpm test` runs, Then they run exactly once, not in both places.

---

## Traceability (spec → tasks)

| Spec id                             | Tasks (test location)                                      |
| ----------------------------------- | ---------------------------------------------------------- |
| AC 1.1                              | T007 (spaces.int-spec), T008 (space-list.test), T014 (e2e) |
| AC 1.2                              | T007, T008 (seat-availability.test), T014                  |
| AC 1.3                              | T002 (booking-constraints.int-spec), T007                  |
| AC 1.4                              | T007 (401), T008 (proxy), T014 (e2e redirect)              |
| AC 2.1                              | T009 (bookings.int-spec), T011, T014                       |
| AC 2.2                              | T010 (Mailpit int test)                                    |
| AC 2.3                              | T002, T009, T011                                           |
| AC 2.4                              | T009 (20 concurrent × 5)                                   |
| AC 2.5                              | T002, T009, T011                                           |
| AC 2.6                              | T003 (booking-rules.spec), T009, T011                      |
| AC 3.1                              | T012 (my-bookings.int-spec), T013, T015                    |
| AC 3.2                              | T012, T013, T015                                           |
| AC 3.3                              | T012, T013, T015                                           |
| AC 3.4                              | T012                                                       |
| AC 3.5                              | T012, T013                                                 |
| FR-001                              | T007, T009, T012 (401 tests), T008 (UX redirect)           |
| FR-002, FR-003                      | T007                                                       |
| FR-004                              | T009                                                       |
| FR-005, FR-006                      | T002 (DB), T009 (API)                                      |
| FR-007                              | T003 (rules), T002 (CHECKs), T009 (422), T006/T011 (copy)  |
| FR-008                              | T010                                                       |
| FR-009                              | T012                                                       |
| FR-010                              | T002, T007, T012                                           |
| FR-011                              | T007 (no user data), T009, T012 (404 parity)               |
| FR-012                              | T005                                                       |
| FR-013                              | T006, T008, T011, T013, T014, T015, T017                   |
| SC-001                              | T006, T011, T014                                           |
| SC-002                              | T009                                                       |
| SC-003                              | T014                                                       |
| SC-004                              | T010                                                       |
| SC-005                              | T014, T015                                                 |
| Edge: touching windows              | T002, T007, T009                                           |
| Edge: cancelled frees seat and user | T002, T007, T012                                           |
| Edge: not found                     | T007, T009, T012                                           |
| Edge: time zones / display          | T003, T006, T007, T008, T010, T013                         |
| Edge: rule-breaking window viewable | T007                                                       |
| Edge: DST                           | T003                                                       |

## Dependencies & execution order

```text
Level 0: T001   T018, T019 (no dependencies; can start at any time)
Level 1: T002, T003, T004, T006                (each needs T001)
Level 2: T005 (T002, T003)   T007 (T002, T003, T004)   T017 (T006)
Level 3: T008 (T006, T007)   T009 (T003, T004, T007)
Level 4: T010 (T009)   T011 (T008, T009)   T012 (T009)
Level 5: T013 (T006, T008, T012)   T014 (T005, T010, T011)
Level 6: T015 (T013, T014)
Level 7: T016 (T015)
```

- **Critical path**: T001 → T002 → T007 → T009 → T012 → T013 → T015 → T016.
- **Backend contract before frontend**: T008 needs T007, T011 needs T009 and T013 needs T012, because each backend task runs `gen:api`.
- **UI spec before UI**: T008 and T013 depend on T006. T011 inherits it through T008.
- There are no cycles. Every task is S or M.

### Parallel opportunities

- After T001: **T002, T003, T004, T006** run in parallel (separate files and owners).
- After T009: **T010, T012** and (once T008 is done) **T011** run in parallel. T010 and T012 both edit `bookings.service.ts` and `bookings.service.spec.ts` (different methods). Whichever merges second rebases. Their integration tests are in separate files (`bookings.int-spec.ts` and `my-bookings.int-spec.ts`).
- T005 (seed) can land any time after T002 and T003. Only QA e2e (T014) needs it.
- **T017** (ui.md follow-ups), **T018** (gitleaks) and **T019** (api-client coverage) block nothing and can run alongside any story work. T018 and T019 both belong to devops and touch different files. T017 edits only ui.md. If T011's carry-over decision changes §3.5, it goes into T017.

## Implementation strategy

1. **Approve**: T001 (architect). No other dispatch until plan.md says approved.
2. **Foundation**: T002, T003, T004, T006 in parallel, then T005.
3. **MVP (US1 + US2)**: T007 → T008, T009 → T010 and T011 → T014. Demo find and book.
4. **US3**: T012 → T013 → T015.
5. **Release**: T016, then code-reviewer and security-reviewer on each PR, then a human merges.

## Notes

- One task = one branch = one PR, under about 400 changed lines. Use Conventional Commits with an
  `api`, `web`, `db` or `docs` scope. Add a changeset for user-visible tasks (T007–T013).
- Write tests first for business logic (T002, T003, T009, T012). The PR shows the failing test commit.
- No new runtime dependencies are planned. Any new dependency needs a justification in the PR and must be raised with the task-manager.
- After fixes, only minor and nit findings remain from the T008–T010 reviews. Blockers and majors were raised and then fixed on this branch:
  - T008 code review: blocker B1 (keyboard access to the space group) and major M1 (problem copy and time zone). Both were fixed in `d44fbf9`.
  - T008 security review: major M1, an open redirect after sign-in that predates T008. It was fixed in `0efbe5c` and `f9dcb56`, and its dot-segment bypass was closed after a second re-review.

  The remaining follow-ups are recorded in T011, T012, T013 and T014 ("Review follow-ups") and in the new tasks T017, T018 and T019. They do not reopen T008, T009 or T010.

## Open questions (human decision needed)

- **OQ-1: per-user throttling on booking writes (security m1, OWASP A06).** Should `POST /api/bookings`, and T012's
  `POST /api/bookings/{bookingId}/cancel`, get per-user rate limiting (for example `@nestjs/throttler` at about 20 requests
  per minute) before the cancel route ships? Each 201 queues a confirmation email, so a book/cancel loop could
  queue unbounded mail. This adds a dependency and needs product and architect decisions (the limit, whether it is keyed
  per user or per IP, the 429 problem `type`, and whether it needs an ADR). **Not assigned to any task yet.** If
  approved, the task-manager will create a backend-dev task, and T012 may need to depend on it.
- **OQ-2: two `pnpm audit --prod` advisories that predate this feature. Accept or bump?**
  - `braces` GHSA-vfj7-8cjw-p6xm (high). It comes in through the eslint tooling in `packages/config`. It is build-time only, and no patched version exists yet.
  - `esbuild` GHSA-67mh-4wv8-2f99 (moderate). It comes in via `better-auth > drizzle-kit > @esbuild-kit`, and only the dev server is exposed.

  A human decides whether to accept each one (record it, with a review date, in the audit or Trivy ignore list) or to bump or override it. If either is bumped or overridden, the task-manager will create a devops task.

- **OQ-3: how to split `feat/001-seat-booking` into PRs.** The branch holds T002–T010 plus fix commits. A human decides between one PR
  and a split per task. If it is split, the sign-in redirect and fetcher error-body fixes (`0efbe5c`, `f9dcb56`, `6f696c5`, `ae0ae12`) should be their own PR.

### Optional hardening (not assigned)

- `apps/web/src/components/welcome.tsx:23` shows `error.message` for any status, 5xx included (security n6). There are two options:
  make "ProblemFilter never puts internals in a 5xx `detail`" an explicit API rule, enforced by a test in `problem.filter.spec.ts`;
  or show generic copy for 5xx in the web app. The architect chooses. The task-manager then creates or extends a task (T013 is the
  natural home for the web-side option).
