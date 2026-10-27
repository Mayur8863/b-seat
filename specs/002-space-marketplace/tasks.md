---
description: 'Task tracker for 002 space marketplace'
---

# Tasks: Space marketplace (owners list, renters book passes)

**Input**: `specs/002-space-marketplace/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Required. The constitution (II) makes business logic test-first, and every acceptance criterion maps to an automated test.

**Organization**: A design-approval phase, a foundational phase, then one phase per user story in priority order
(US1–US4 P1, US5–US7 P2, US8 P3), then polish. Every task has an ID, an owner agent, a branch, a size (S or M; there
are no L tasks), dependencies, a status, and Given/When/Then acceptance criteria that trace to spec ids
(`AC x.y` = User Story x, scenario y; `FR-…`, `SC-…`, and "edge" for the Edge Cases list).

**Status values**: `todo | in-progress | review | done | blocked (reason, unblock owner)`. Only the task-manager
changes owners. Developers set `review`. Only qa-engineer sets `done`.

**Gate**: no task except T001 is dispatched until plan.md reads "Approved by architect". Tasks that depend on an
open question (plan.md, OQ-n) are marked; the proposed default is used only if a human accepts it before dispatch.

**Base branch**: depends on OQ-1 (merge 001 into `main` first, recommended).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks in the same phase (different files, no unmet dependency)
- **[Story]**: US1 … US8 (spec user stories)

## Summary table

| ID   | Title                                                        | Owner          | Depends on             | Size | Status | Branch                                |
| ---- | ------------------------------------------------------------ | -------------- | ---------------------- | ---- | ------ | ------------------------------------- |
| T001 | ADR-0009, ADR-0010 and plan approval                         | architect      | none                   | M    | done   | `docs/002-marketplace-adrs`           |
| T002 | Account role: Better Auth field, migration, role guard       | backend-dev    | T001                   | M    | done   | `feat/002-account-role`               |
| T003 | Listing schema: space columns, cubicle, seat changes         | backend-dev    | T001                   | M    | done   | `feat/002-listing-schema`             |
| T004 | Pricing and calendar schema, shared calendar backfill        | backend-dev    | T003                   | M    | todo   | `feat/002-pricing-calendar-schema`    |
| T005 | Pass booking header, seat holds, occupancy marks, exclusions | backend-dev    | T003, T008             | M    | todo   | `feat/002-seat-hold-schema`           |
| T006 | Slot, calendar and pass-period engine (pure, TDD)            | backend-dev    | T001                   | M    | todo   | `feat/002-slot-engine`                |
| T007 | Money, problem types and pass booking rules (pure, TDD)      | backend-dev    | T006                   | M    | todo   | `feat/002-pass-rules`                 |
| T008 | Retire hourly create; legacy space reads published-only      | backend-dev    | T003                   | S    | todo   | `chore/002-retire-hourly-create`      |
| T009 | Seed: demo owner and renter, priced listings, calendars      | backend-dev    | T002, T004, T012       | M    | todo   | `feat/002-seed-marketplace`           |
| T010 | UI spec: index, shell, nav, sign-up, dashboards              | ui-ux-designer | T001                   | M    | todo   | `docs/002-ui-shell-accounts`          |
| T011 | Test plan and traceability skeleton                          | qa-engineer    | T001                   | S    | todo   | `test/002-test-plan`                  |
| T012 | Wire `SEED_DEMO_PASSWORD` into compose and CI                | devops         | T001                   | S    | todo   | `chore/002-seed-env`                  |
| T013 | Renter preferences API                                       | backend-dev    | T002                   | S    | todo   | `feat/002-renter-preferences-api`     |
| T014 | Signed-in shell, role-aware nav, role dashboards             | frontend-dev   | T002, T010             | M    | todo   | `feat/002-app-nav`                    |
| T015 | Sign-up role choice and optional preferences                 | frontend-dev   | T002, T013, T014, T019 | M    | todo   | `feat/002-sign-up-role`               |
| T016 | QA US1: accounts and navigation e2e, axe                     | qa-engineer    | T011, T014, T015       | S    | todo   | `test/002-us1-accounts-e2e`           |
| T017 | Docs US1                                                     | docs-writer    | T016                   | S    | todo   | `docs/002-us1-accounts`               |
| T018 | UI spec: owner listing, seats, slots and prices              | ui-ux-designer | T010                   | M    | todo   | `docs/002-ui-owner-listing`           |
| T019 | Reference data API (countries, currencies, utilities)        | backend-dev    | T001                   | S    | todo   | `feat/002-reference-api`              |
| T020 | Owner spaces API: CRUD, publish, unpublish                   | backend-dev    | T002, T004, T019       | M    | todo   | `feat/002-owner-spaces-api`           |
| T021 | Seats and cubicles API                                       | backend-dev    | T005, T020             | M    | todo   | `feat/002-seats-cubicles-api`         |
| T022 | Space details form and create page                           | frontend-dev   | T014, T018, T019, T020 | M    | todo   | `feat/002-space-form`                 |
| T023 | Owner dashboard spaces, space overview, publish              | frontend-dev   | T022                   | M    | todo   | `feat/002-owner-dashboard`            |
| T024 | Seats management page                                        | frontend-dev   | T021, T023             | M    | todo   | `feat/002-seats-page`                 |
| T025 | QA US2: listing e2e, axe, owner scoping                      | qa-engineer    | T009, T011, T023, T024 | M    | todo   | `test/002-us2-listing-e2e`            |
| T026 | Docs US2                                                     | docs-writer    | T025                   | S    | todo   | `docs/002-us2-listing`                |
| T027 | Slots and pricing API                                        | backend-dev    | T007, T020             | M    | todo   | `feat/002-pricing-api`                |
| T028 | Listing detail API with offers and 24-hour saving            | backend-dev    | T027                   | S    | todo   | `feat/002-listing-detail-api`         |
| T029 | UI spec: search, listing page, booking, my bookings          | ui-ux-designer | T010                   | M    | todo   | `docs/002-ui-renter-booking`          |
| T030 | Owner pricing page                                           | frontend-dev   | T023, T027             | M    | todo   | `feat/002-pricing-page`               |
| T031 | Listing page v1: details and pass options                    | frontend-dev   | T014, T028, T029       | M    | todo   | `feat/002-listing-page`               |
| T032 | QA US3: pricing e2e, axe                                     | qa-engineer    | T030, T031             | S    | todo   | `test/002-us3-pricing-e2e`            |
| T033 | Docs US3                                                     | docs-writer    | T032                   | S    | todo   | `docs/002-us3-pricing`                |
| T034 | Listing search and location suggestions API                  | backend-dev    | T027                   | M    | todo   | `feat/002-listing-search-api`         |
| T035 | Seat availability for a pass API                             | backend-dev    | T005, T028             | M    | todo   | `feat/002-seat-availability-api`      |
| T036 | Create pass booking API (rules, holds, races)                | backend-dev    | T008, T035             | M    | todo   | `feat/002-create-pass-booking-api`    |
| T037 | Renter and owner booking emails                              | backend-dev    | T036                   | S    | todo   | `feat/002-booking-emails`             |
| T038 | Search availability filter (date, pass, slot)                | backend-dev    | T034, T035             | M    | todo   | `feat/002-search-availability-filter` |
| T039 | Find a space page                                            | frontend-dev   | T013, T014, T029, T034 | M    | todo   | `feat/002-find-page`                  |
| T040 | Listing page: seat availability for a pass                   | frontend-dev   | T031, T035             | M    | todo   | `feat/002-listing-seats`              |
| T041 | Book a pass, confirmation, problem copy                      | frontend-dev   | T036, T040             | M    | todo   | `feat/002-book-pass-ui`               |
| T042 | Retire `/book`: redirect to `/find`, remove 001 components   | frontend-dev   | T039, T041             | S    | todo   | `chore/002-retire-book-page`          |
| T043 | Retire legacy `GET /api/spaces` routes                       | backend-dev    | T042                   | S    | todo   | `chore/002-retire-legacy-spaces-api`  |
| T044 | QA US4: search and book e2e, races, performance, axe         | qa-engineer    | T009, T037, T038, T042 | M    | todo   | `test/002-us4-search-book-e2e`        |
| T045 | Docs US4                                                     | docs-writer    | T043, T044             | S    | todo   | `docs/002-us4-search-book`            |
| T046 | UI spec: occupancy, calendars, owner bookings                | ui-ux-designer | T018                   | M    | todo   | `docs/002-ui-owner-operations`        |
| T047 | Occupancy API and seat state today                           | backend-dev    | T006, T021             | M    | todo   | `feat/002-occupancy-api`              |
| T048 | Occupancy UI on the seats page                               | frontend-dev   | T024, T046, T047       | M    | todo   | `feat/002-occupancy-ui`               |
| T049 | QA US5: occupancy e2e, booking-vs-mark race, axe             | qa-engineer    | T036, T048             | M    | todo   | `test/002-us5-occupancy`              |
| T050 | Docs US5                                                     | docs-writer    | T049                   | S    | todo   | `docs/002-us5-occupancy`              |
| T051 | Availability calendars API                                   | backend-dev    | T006, T021             | M    | todo   | `feat/002-calendar-api`               |
| T052 | Availability calendar page                                   | frontend-dev   | T023, T046, T051       | M    | todo   | `feat/002-availability-page`          |
| T053 | QA US6: calendar e2e, axe                                    | qa-engineer    | T036, T052             | S    | todo   | `test/002-us6-calendar`               |
| T054 | Docs US6                                                     | docs-writer    | T053                   | S    | todo   | `docs/002-us6-calendar`               |
| T055 | My bookings and cancel API                                   | backend-dev    | T036                   | M    | todo   | `feat/002-my-bookings-api`            |
| T056 | Owner bookings list API                                      | backend-dev    | T036                   | S    | todo   | `feat/002-owner-bookings-api`         |
| T057 | My bookings page, cancel, dashboard next booking             | frontend-dev   | T014, T029, T055       | M    | todo   | `feat/002-my-bookings-page`           |
| T058 | Owner bookings page with date filter                         | frontend-dev   | T023, T046, T056       | M    | todo   | `feat/002-owner-bookings-page`        |
| T059 | QA US7: bookings lists e2e, axe                              | qa-engineer    | T057, T058             | S    | todo   | `test/002-us7-bookings`               |
| T060 | Docs US7                                                     | docs-writer    | T059                   | S    | todo   | `docs/002-us7-bookings`               |
| T061 | UI spec: layout editor and renter plan                       | ui-ux-designer | T018, T029             | M    | todo   | `docs/002-ui-layout`                  |
| T062 | Layout schema and API (owner and renter)                     | backend-dev    | T021                   | M    | todo   | `feat/002-layout-api`                 |
| T063 | Seed a sample layout                                         | backend-dev    | T009, T062             | S    | todo   | `feat/002-seed-layout`                |
| T064 | Layout editor model (pure reducer, TDD)                      | frontend-dev   | T061, T062             | M    | todo   | `feat/002-layout-editor-model`        |
| T065 | Layout editor page (grid, pointer, keyboard, form)           | frontend-dev   | T023, T064             | M    | todo   | `feat/002-layout-editor`              |
| T066 | Renter plan view on the listing page                         | frontend-dev   | T040, T061, T062       | M    | todo   | `feat/002-renter-plan`                |
| T067 | QA US8: layout e2e (keyboard only), axe                      | qa-engineer    | T063, T065, T066       | M    | todo   | `test/002-us8-layout`                 |
| T068 | Docs US8                                                     | docs-writer    | T067                   | S    | todo   | `docs/002-us8-layout`                 |
| T069 | Booking hardening carried over from 001 reviews              | backend-dev    | T037                   | S    | todo   | `chore/002-booking-hardening`         |
| T070 | QA final regression, SC-001/SC-002 timing, traceability      | qa-engineer    | see task               | S    | todo   | `test/002-final-regression`           |
| T071 | Docs release: README overview, ADR index, changesets         | docs-writer    | T070                   | S    | todo   | `docs/002-release`                    |

---

## Phase 1: Design approval

- [x] T001 Write `docs/adr/0009-pass-bookings-seat-holds-and-slots.md` and `docs/adr/0010-account-roles-and-owner-authorization.md`, update `docs/adr/README.md`, and record the verdict at the top of `specs/002-space-marketplace/plan.md`
  - **Owner**: architect · **Branch**: `docs/002-marketplace-adrs` · **Size**: M · **Depends on**: none · **Status**: done (QA verified 2026-10-27; architect verdict recorded 2026-10-27: Approved; amendments A1–A15 listed in plan.md)
  - **Scope**: Review plan.md, research.md (R-1, R-3, R-4, R-6, R-7, R-11), data-model.md and contracts/. Decide AQ-1 to AQ-8. Amend this folder directly where a decision changes it (as in 001 T001), and list the amendments under the verdict. Product questions OQ-1 to OQ-12 go to a human; the architect may comment on them.
  - **Acceptance criteria**:
    - Given the design artifacts, When the review ends, Then plan.md's verdict line reads `Approved by architect (<date>)`, or `Changes required` with a numbered list (Constitution I).
    - Given ADR-0009, When read, Then it states decision, rationale and alternatives for multi-day storage and conflicts (AQ-1, AQ-7), slot time and the DST policy at owner-set boundaries (AQ-2), the hourly retirement sequence and its ordering T008 → T005 (AQ-8), and occupancy day boundaries (R-11) (Constitution III, IV).
    - Given ADR-0010, When read, Then it states how the role is stored and kept immutable with Better Auth 1.7 (verified against current docs, AQ-5), 403 vs 404 (AQ-6), and owner scoping with 404 parity (FR-009, FR-028).
    - Given contracts/, When reviewed, Then request ids end in `Input`, response ids are nouns, no named schema is shared between directions, and the problem-extension decision (AQ-3) is recorded in contracts/README.md.
    - Given AQ-4, When decided, Then tasks.md Notes state whether generated files count toward the 400-line budget.

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: role, schema, the slot and booking engine, the hourly retirement, seed and the first UI spec.
After T001: T002, T003, T006, T010, T011, T012 and T019 can start in parallel. Migration tasks that run in parallel
(T002, T003) rebase and **re-run** `db:generate` rather than hand-merging the drizzle journal or snapshots.

- [x] T002 [P] Add the account role: `apps/api/src/db/schema/auth.ts` (`accountType`), migration `user_account_type`, `apps/api/src/auth/auth.ts` (additional field + immutability hook), `apps/api/src/auth/roles.guard.ts` (+ `.spec.ts`), `apps/api/src/me/me.controller.ts` (`accountType`), `apps/api/test/helpers.ts` (`signedInAgent(app, user, accountType = 'renter')`), `apps/api/test/roles.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-account-role` · **Size**: M · **Depends on**: T001 · **Status**: done
  - **Scope**: research R-1, ADR-0010 and contracts/accounts.md. The field is **`accountType`** (not `role`; ADR-0010). Column verbatim: `account_type text NOT NULL DEFAULT 'renter'`, CHECK `user_account_type_valid`: `account_type IN ('owner','renter')`. Better Auth: `user.additionalFields.accountType = { type: ['owner','renter'], required: true, input: true, validator: { input: z.enum(['owner','renter']) } }` with **no `defaultValue`**, and `databaseHooks.user.update.before` that **throws** `APIError('BAD_REQUEST')` when the data contains `accountType` (never `return false`; ADR-0010 section 2). `RolesGuard` + `@RequireRole()` decorator reading `session.user.accountType`, 403 via the existing mapping. Web `auth-client.ts` gets `inferAdditionalFields` only if typecheck needs it here; otherwise T015 adds it. Tests first.
  - **Acceptance criteria**:
    - Given a sign-up body without `accountType`, When posted to `/api/auth/sign-up/email`, Then 400 with code `MISSING_FIELD`; Given `accountType: "admin"`, Then 400 with code `VALIDATION_ERROR`; in both cases no `user` row exists (FR-001, AC 1.1, ADR-0010).
    - Given a sign-up with `accountType: "owner"`, When `GET /api/me` is called with its cookie, Then `accountType` is `"owner"` (FR-001).
    - Given a user row inserted without `account_type` (simulating a pre-feature account), When `GET /api/me`, Then `accountType` is `"renter"` (FR-003, AC 1.6).
    - Given a renter, When it calls `POST /api/auth/update-user` with `{ "accountType": "owner" }` (alone, and together with `name`), Then 400, the stored value is still `renter`, and the name is unchanged; Given `{ "name": "New" }` only, Then 200 and the name changes (FR-001 "cannot be changed", ADR-0010).
    - Given a direct SQL update setting `account_type = 'admin'`, Then `23514` on `user_account_type_valid`.
    - Given a controller method with `@RequireRole('owner')`, When a renter calls it, Then 403 `urn:bseat:problem:http-403`; When an owner calls it, Then it runs (unit test of the guard, R-3).
    - Given the existing integration suite, When it runs with the updated `signedInAgent`, Then it passes unchanged.
    - Given `bin/pnpm gen:api`, When run, Then `Me` includes `accountType` and `openapi.json` is committed (Constitution III).

- [x] T003 [P] Extend the listing schema in `apps/api/src/db/schema/space.ts` (space columns, `cubicle`, seat changes), migration `listings`, fixtures in `apps/api/test/fixtures.ts`, tests `apps/api/test/listing-constraints.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-listing-schema` · **Size**: M · **Depends on**: T001 · **Status**: done
  - **Scope**: data-model.md "space (changed)", "cubicle", "seat (changed)" verbatim, including: `owner_id` FK `ON DELETE RESTRICT` (nullable for legacy rows); `status space_status DEFAULT 'draft'`; generated `city_key`/`area_key` `GENERATED ALWAYS AS (lower(btrim(…))) STORED`; CHECKs `space_opening_hours_valid` (fixed hours: `closes_at > opens_at`, **OQ-7**), `space_owned_complete`, `space_published_has_owner`, `space_custom_utilities_max` (`cardinality(custom_utilities) <= 5`), description 1–2000, city/area 1–100, street address 1–200, `country ~ '^[A-Z]{2}$'`, `currency ~ '^[A-Z]{3}$'`; drop `space_name_unique` (**OQ-11**); `location` nullable; `seat_space_id_label_active_unique (space_id, label) WHERE removed_at IS NULL` replaces `seat_space_id_label_unique`; `seat_id_space_id_unique`, `cubicle_id_space_id_unique`; composite FK `(cubicle_id, space_id)`; `cubicle.removed_at` with `cubicle_space_id_name_active_unique (space_id, name) WHERE removed_at IS NULL`. Indexes as listed. Never edit `0000`–`0002`. Constraint tests first; fixtures `createOwner`, `createListing`, `createCubicle`.
  - **Acceptance criteria**:
    - Given an existing 001 space row, When the migration runs, Then it succeeds and the row has `status = 'draft'` and `owner_id IS NULL` (expand, research R-7).
    - Given a space with `owner_id` set and `description` (or any field in `space_owned_complete`) null, When inserted or updated, Then `23514`; Given a `published` space with `owner_id` null, Then `23514` on `space_published_has_owner` (FR-008 defence in depth; keeps owner and renter schemas non-nullable).
    - Given a cubicle named `Bay 1` that is soft-removed, When another active `Bay 1` is inserted in the same space, Then it succeeds; Given two active `Bay 1`, Then `23505`.
    - Given `fixed_hours` with `closes_at <= opens_at`, or `always_open` without `shift_change_at`, When inserted, Then `23514` (FR-010).
    - Given city `"  Pune "`, When inserted, Then `city_key` is `"pune"` (AC 4.2).
    - Given six custom utilities, When inserted, Then `23514` (FR-006).
    - Given two owners, When each creates a space named "Cowork Hub", Then both succeed (OQ-11).
    - Given an active seat `A-1`, When another active `A-1` is inserted in the same space, Then `23505`; When the first is soft-removed (`removed_at` set) and `A-1` is inserted again, Then it succeeds (FR-007, R-15).
    - Given a seat whose `cubicle_id` belongs to another space, When inserted, Then `23503` (FR-009 integrity).
    - Given the migrations, When `db:generate` runs again, Then no new migration is produced.

- [ ] T004 Add `apps/api/src/db/schema/pricing.ts` (`space_slot`, `pass_price`) and `apps/api/src/db/schema/calendar.ts` (`availability_calendar`), migrations `pricing_calendar` (generated) and `shared_calendar_backfill` (custom), tests `apps/api/test/pricing-calendar-constraints.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-pricing-calendar-schema` · **Size**: M · **Depends on**: T003 · **Status**: todo
  - **Scope**: data-model.md verbatim: PK `(space_id, slot)`; PK `(space_id, slot, pass)`; `amount numeric(12,2)` with `pass_price_positive` `amount > 0`; `weekdays smallint DEFAULT 127` with `availability_calendar_weekdays` `BETWEEN 1 AND 127`; `availability_calendar_range`; partial unique `availability_calendar_shared_unique (space_id) WHERE seat_id IS NULL`; `availability_calendar_seat_unique (seat_id)`; composite FK `(seat_id, space_id)`. Custom backfill: one shared calendar per existing space, `start_date = (created_at AT TIME ZONE time_zone)::date`.
  - **Acceptance criteria**:
    - Given an existing space, When the migrations run, Then it has exactly one shared calendar starting on its creation date (local), no end date, `weekdays = 127` (FR-024, AC 6.1).
    - Given a second shared calendar for a space, or a second own calendar for a seat, When inserted, Then `23505`.
    - Given `amount = 0` or negative, When inserted, Then `23514` (FR-011, AC 3.4).
    - Given `end_date < start_date` or `weekdays = 0`, When inserted, Then `23514`.
    - Given a seat calendar whose `space_id` differs from the seat's space, When inserted, Then `23503`.
    - Given the migrations, When `db:generate` runs again, Then no new migration is produced.

- [ ] T005 Turn `booking` into the pass header and add `seat_hold` and `occupancy_mark` in `apps/api/src/db/schema/booking.ts`; migrations `pass_bookings` (generated) then `seat_hold_exclusions` (custom); fixtures; tests `apps/api/test/seat-hold-constraints.int-spec.ts`; update `apps/api/test/booking-constraints.int-spec.ts`; switch the legacy availability read in `apps/api/src/spaces/spaces.service.ts` to `seat_hold` and update `apps/api/test/spaces.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-seat-hold-schema` · **Size**: M · **Depends on**: T003, T008 · **Status**: todo
  - **Scope**: data-model.md "booking (changed)", "occupancy_mark", "seat_hold" and the backfill SQL, verbatim; ADR-0009 sections 2, 3 and 6. Constraints: `booking_pass_complete`, `booking_pass_length` (`end_date - start_date = CASE pass WHEN 'day' THEN 0 WHEN 'week' THEN 6 ELSE 29 END`), `booking_price_positive`; 001's `booking_duration_bounds` and `booking_quarter_hour` re-created as `kind <> 'hourly' OR (…)`; `seat_hold_one_source`, `seat_hold_user_iff_booking`, `seat_hold_booking_bounded`, `seat_hold_ends_after_starts`, `seat_hold_booking_max_length` (`<= interval '26 hours'`); occupancy `note` ≤ 200. **Consistency keys (generated migration, AQ-7):** `booking.holds_active boolean GENERATED ALWAYS AS (status = 'active') STORED` (check the SQL says `STORED`), `booking_hold_key_unique (id, seat_id, user_id, holds_active)`, `seat_hold_booking_fk (booking_id, seat_id, user_id, active) → booking (id, seat_id, user_id, holds_active) ON UPDATE CASCADE ON DELETE CASCADE`, `occupancy_mark_id_seat_id_unique (id, seat_id)`, `seat_hold_occupancy_mark_fk (occupancy_mark_id, seat_id) → occupancy_mark (id, seat_id) ON DELETE CASCADE`, unique `seat_hold.occupancy_mark_id`. Custom migration in this order: the two `seat_hold` exclusions (`WHERE ("active")` and `WHERE ("active" AND "user_id" IS NOT NULL)`), the backfill of active, not-ended hourly bookings, `booking_no_new_hourly CHECK (kind <> 'hourly') NOT VALID`, then `DROP CONSTRAINT booking_seat_no_overlap` and `booking_user_no_overlap`. T008 must be merged first (R-7). The legacy `GET /api/spaces/{id}/availability` reads `taken` from active `seat_hold` rows (joined from `seat`, predicate spelled as the constraint, ADR-0009 section 7) instead of `booking`; the hourly `insertBooking` fixture is replaced by `insertPassBooking` / `insertHold` (hourly inserts now fail `booking_no_new_hourly`). Tests first. Fixtures `insertPassBooking`, `insertHold`, `insertOccupancyMark`. **OQ-3** decides the backfill.
  - **Acceptance criteria**:
    - Given an active hourly booking ending tomorrow and one that ended yesterday, When the migrations run, Then exactly one active `seat_hold` exists, for the first (R-7, OQ-3).
    - Given an active hold for seat S from 07:00 to 19:00, When a hold for S from 18:00 to 07:00 next day is inserted, Then `23P01` on `seat_hold_seat_no_overlap` (FR-018).
    - Given holds 07:00–19:00 and 19:00–07:00 on S for two different users, When both are inserted, Then both succeed (edge "touching slots", edge "day and night by different renters").
    - Given an occupancy hold on S with `ends_at` null from next Monday, When a booking hold on S for any later date is inserted, Then `23P01` (FR-018, R-11).
    - Given user U holds 07:00–19:00 on S1, When a hold for U on S2 from 18:00 is inserted, Then `23P01` on `seat_hold_user_no_overlap` (FR-019).
    - Given two occupancy holds on different seats at the same time (no user), When inserted, Then both succeed.
    - Given an inactive hold, When an overlapping active hold is inserted, Then it succeeds.
    - Given 20 concurrent transactions each inserting a 7-occurrence set of holds for S that overlap, When run (`Promise.all`, repeated 5 times), Then exactly one commits each time, the others fail with `23P01` or `40P01` (DB-level proof for SC-005).
    - Given a pass booking with `pass = 'week'` and `end_date - start_date = 5`, or missing `price`, When inserted, Then `23514`; Given a hold with both `booking_id` and `occupancy_mark_id`, or a booking hold without `user_id`, Then `23514`.
    - Given a booking hold whose `seat_id` or `user_id` differs from its header, or an inactive hold for an active booking, When inserted, Then `23503` on `seat_hold_booking_fk`; Given an occupancy hold on a seat other than its mark's, or a second hold for one mark, Then `23503` / `23505` (AQ-7, ADR-0009 section 3).
    - Given an active pass booking with 7 active holds, When `UPDATE booking SET status = 'cancelled', cancelled_at = now()` runs alone, Then all 7 holds are inactive and an overlapping hold for another user now inserts; Given that cancelled booking, When a hold is set back to `active = true`, Then `23503`; Given an active booking, When one of its holds is set `active = false` directly, Then `23503` (AQ-7).
    - Given the migrations, When a new `booking` row with `kind = 'hourly'` is inserted (or a legacy hourly row is updated), Then `23514` on `booking_no_new_hourly`; deleting a legacy hourly row still succeeds (ADR-0009 section 6).
    - Given an occupancy hold on S and a pass booking hold on S, When `GET /api/spaces/{id}/availability` (legacy, still live) covers them, Then S is `taken` (legacy read switched to `seat_hold`).
    - Given `pg_constraint`, When queried, Then `seat_hold_seat_no_overlap` and `seat_hold_user_no_overlap` have `contype = 'x'`, `booking` has no `x` constraint, and `booking_no_new_hourly` has `convalidated = false`.
    - Given the migrations, When `db:generate` runs again, Then no new migration is produced.

- [ ] T006 [P] Implement `apps/api/src/marketplace/slots.ts`, `calendar-rules.ts` and `pass-period.ts`, and add `toInstantCompatible` to `apps/api/src/common/time/zoned-time.ts`, with unit tests written first (`*.spec.ts`)
  - **Owner**: backend-dev · **Branch**: `feat/002-slot-engine` · **Size**: M · **Depends on**: T001 · **Status**: todo
  - **Scope**: research R-4 and R-5. Pure functions, no Nest or DB imports, no new dependency. `slotWindow(openingHours, slot, date, timeZone)`, `offeredSlots(openingHours)`, `dayBoundary(openingHours, date, timeZone)` (for occupancy, R-11), `isOpen(calendar, date)`, `passPeriod({ pass, slot, startDate, calendar, openingHours, timeZone })` → `{ endDate, occurrences, skippedDates }`. DST policy (AQ-2, ADR-0009 section 4): `toInstantCompatible(date, time, zone)` uses the offset in force before the transition (gap → instant after the gap, overlap → earlier instant); every slot and day boundary goes through it; `slotWindow` throws if `end <= start`. Existing `toInstant` (refusing) is unchanged.
  - **Acceptance criteria**:
    - Given a 24-hour space with shift 07:00 in `Asia/Kolkata`, When `slotWindow` runs for 2026-11-02, Then day = 07:00–19:00, night = 19:00–07:00 on 11-03, full_day = 07:00–07:00 on 11-03, as instants (AC 3.1, FR-010).
    - Given fixed hours 09:00–18:00, When `offeredSlots` runs, Then it is exactly `['working_hours']` (AC 3.2).
    - Given `Europe/London` shift 07:00, When the night slot of 2026-10-24 and the full_day of 2026-03-28 are computed, Then they last 13 h and 23 h (edge DST).
    - Given a shift time inside a DST gap or overlap (London 01:30 on 2026-03-29 and 2026-10-25), When computed, Then the boundary is `2026-03-29T01:30:00Z` and `2026-10-25T00:30:00Z` respectively (AQ-2 "compatible"), day end equals night start exactly, and full_day of the previous date ends at the same instant (edge "touching slots").
    - Given `toInstantCompatible` for a wall-clock that exists once, Then it equals `toInstant(...).instant` (property-style test over a year of hourly samples in `Europe/London` and `America/New_York`).
    - Given a weekly night pass starting 2026-11-02, When `passPeriod` runs, Then `endDate` is 2026-11-08 and the last occurrence ends 2026-11-09 at the shift time (edge "night crosses midnight").
    - Given a Mon–Fri calendar and a weekly pass starting Monday, When `passPeriod` runs, Then 5 occurrences and 2 `skippedDates` (Sat, Sun) (FR-017, AC 6.4).
    - Given a calendar that closes the start date, When `passPeriod` runs, Then it reports the start day as closed (AC 6.4).
    - Given a calendar with `endDate` inside a monthly pass, When run, Then days after `endDate` are skipped (AC 6.2).
    - Given the PR, When reviewed, Then the failing tests were committed first and changed-line coverage is ≥ 80% (Constitution II).

- [ ] T007 Implement `apps/api/src/common/money/money.ts`, `apps/api/src/common/errors/problem-types.ts` and `apps/api/src/marketplace/booking-rules.ts`, with unit tests written first
  - **Owner**: backend-dev · **Branch**: `feat/002-pass-rules` · **Size**: M · **Depends on**: T006 · **Status**: todo
  - **Scope**: research R-8; contracts/README.md problem types, rule order and extension schemas (AQ-3, ADR-0009 section 8). `parseDecimal`, `formatDecimal`, `fullDaySaving(day, night, fullDay)` → `{ amount, percent } | null` (percent rounded half-up). `evaluatePassBookingRules({ space, isOwner, offered, startDayOpen, firstStartsAt }, now)` returns the first violation in the documented order or `null`. Problem type constants for every row of the contracts README table. `ProblemException` gains an optional `extensions` record and `ProblemFilter` spreads it before the standard members; export `PublishIncompleteProblem`, `LabelTakenProblem` and `OccupancyConflictProblem` (`ProblemSchema.extend(...)`, response only) for T020, T021 and T047. `ProblemSchema` itself is unchanged.
  - **Acceptance criteria**:
    - Given `"1500"`, `"1500.5"`, `"0.01"`, When parsed, Then minor units 150000, 150050, 1; Given `"10.005"`, `"0"`, `"-1"`, `"1e3"`, Then rejected (FR-011, AC 3.4).
    - Given day 500.00, night 400.00, full_day 800.00, When `fullDaySaving` runs, Then `{ amount: "100.00", percent: 11 }`; Given full_day ≥ day + night, Then `null` (FR-012, AC 3.5).
    - Given one test per rule, When each breaks exactly that rule, Then its type is returned: space-not-published, own-space, pass-not-offered, start-day-closed, slot-started (first start equal to now), too-far-ahead (now + 30 × 24 h + 1 min) (FR-020, AC 4.9, edge "owner books own").
    - Given a first start exactly now + 30 × 24 h, When evaluated, Then it passes.
    - Given several broken rules, When evaluated, Then only the first in the documented order is returned.
    - Given a `ProblemException` with `extensions: { labels: ['A-1'], type: 'x', status: 200 }`, When the filter renders it, Then the body has `labels: ['A-1']` and the exception's own `type` and `status` (extensions cannot override standard members; unit test of `ProblemFilter`).

- [ ] T008 Retire the hourly create and make legacy space reads published-only: remove `POST /api/bookings` from `apps/api/src/bookings/bookings.controller.ts` and `bookings.service.ts` (keep `booking-conflicts.ts`, `booking-confirmation.mail.ts`), filter `status = 'published'` in `apps/api/src/spaces/spaces.service.ts`, update `apps/api/test/bookings.int-spec.ts` and `spaces.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `chore/002-retire-hourly-create` · **Size**: S · **Depends on**: T003 · **Status**: todo
  - **Carry-over (T003 review)**: legacy reads filter `status = 'published'`, and T008 must merge before any owner create route (T020), because owned drafts must never reach the legacy list.
  - **Scope**: research R-7 step 2 (AQ-8). No web code calls `useBookingsCreate` today; confirm with a grep in the PR. Hourly integration tests that only exercised the removed route are deleted; their coverage of `classifyInsertError` and the deadlock retry stays in unit tests. Must merge **before** T005.
  - **Acceptance criteria**:
    - Given the API, When `POST /api/bookings` is called with the 001 body, Then 404 (the route no longer exists) (R-7).
    - Given a draft space and a published space, When `GET /api/spaces` and `GET /api/spaces/{draftId}/availability` are called, Then only the published one is listed and the draft gives 404 (FR-009).
    - Given `bin/pnpm gen:api`, When run, Then `Bookings_create`, `CreateBookingInput` and the old `Booking` schema are gone from `openapi.json`, and `bin/pnpm --filter @bseat/web typecheck` still passes.

- [ ] T009 Seed demo marketplace data in `apps/api/src/db/demo-spaces.ts` and `apps/api/src/db/seed.ts`, tests in `apps/api/test/seed.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-seed-marketplace` · **Size**: M · **Depends on**: T002, T004, T012 · **Status**: todo
  - **Carry-over (T003 review)**: decide whether the seed recreates soft-removed demo seats (its seat upsert now targets active labels only).
  - **Scope**: Idempotent. Create `owner@bseat.local` (owner) and `renter@bseat.local` (renter, preferences IN / Pune once T013 exists; skip the preference row if the table is absent) with the password from `SEED_DEMO_PASSWORD` (Better Auth password hashing, no plain text stored; fail with a clear message if unset). Claim the 001 demo spaces for the owner (by name where `owner_id IS NULL`; **OQ-11**) in one `UPDATE` per space that sets `owner_id` and every listing field together (`space_owned_complete`), complete them (London HQ: GB, London, Westminster, `Europe/London`, GBP, always open, shift 07:00, day/night/full_day enabled, day and monthly prices with a 24-hour saving; Pune Hub: IN, Pune, Baner, `Asia/Kolkata`, INR, fixed 09:00–18:00, working-hours day/week/month prices), one or two cubicles each, and publish. Seat bookings and occupancy are not seeded (e2e creates its own).
  - **Acceptance criteria**:
    - Given a migrated, empty dev DB, When `bin/pnpm db:seed` runs twice, Then exactly 2 demo accounts, 2 published spaces owned by the owner, 20 active seats, their prices and shared calendars exist (Assumptions "seeded demo owner").
    - Given the seed, When `GET /api/listings?country=GB&city=london` is called by the renter (after T034), Then London HQ is returned; before T034, a direct query shows both spaces are `published` with every listing field set.
    - Given `SEED_DEMO_PASSWORD` is unset, When the seed runs, Then it exits non-zero naming the variable, and nothing is half-written.

- [ ] T010 [P] Write `specs/002-space-marketplace/ui.md` (index of the area specs) and `specs/002-space-marketplace/ui/01-shell-accounts.md`
  - **Owner**: ui-ux-designer · **Branch**: `docs/002-ui-shell-accounts` · **Size**: M · **Depends on**: T001 · **Status**: todo
  - **Scope**: Signed-in shell and main nav per role (desktop and mobile; **OQ-9**), management sub-nav pattern for owner pages, sign-up role choice ("I own a space" / "I need a space"), optional preferences step, renter and owner dashboards (empty states, next-booking summary slot for T057), preferences editing on the dashboard, shared copy conventions (local times labelled with the zone, money format, slot and pass names), and the problem-copy mapping approach. Reuse `@bseat/ui` (001 ui.md components); name any shadcn component to add.
  - **Acceptance criteria**:
    - Given each screen, When read, Then default, hover, focus, disabled, loading, empty, error and success states are specified (FR-032).
    - Given the nav, When read, Then every page per role is listed with its label and route, keyboard order and focus styles are defined, and the active page is marked with `aria-current` (FR-004, AC 1.5).
    - Given the sign-up form, When read, Then the role is a required radio group with a field error tied by `aria-describedby`, and the optional preferences fields are specified (AC 1.1, AC 1.2).
    - Given mobile, tablet and desktop, When read, Then layout, contrast notes (semantic tokens only) and live regions are defined (SC-007).

- [ ] T011 [P] Write `specs/002-space-marketplace/test-plan.md`: test levels per story, data setup, race and performance methods, axe coverage list, and the traceability skeleton
  - **Owner**: qa-engineer · **Branch**: `test/002-test-plan` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec, When the test plan is read, Then every AC, FR, SC and edge case has a planned test level and an owning task (Constitution II).
    - Given SC-003, SC-004 and SC-005, When read, Then the data volumes, repetition counts, p95 method and `EXPLAIN` evidence are defined.
    - Given SC-007, When read, Then every route in plan.md's web tree is listed for axe, including the layout editor in its editing state.

- [ ] T012 [P] Add `SEED_DEMO_PASSWORD` to `.env.example` (with a comment), the compose `migrate` service and the CI e2e job
  - **Owner**: devops · **Branch**: `chore/002-seed-env` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Scope**: `docker-compose.yml` has unrelated uncommitted local changes on the planning machine; work from the base branch's committed file. The CI value is a CI secret or a generated value, never a real password; gitleaks stays green.
  - **Acceptance criteria**:
    - Given a fresh clone with `.env` copied from `.env.example`, When `docker compose up` runs, Then the `migrate` service receives `SEED_DEMO_PASSWORD` (verified once T009 lands: the seed succeeds).
    - Given CI, When the e2e job runs, Then the seed receives the variable, and `bin/gitleaks dir .` reports no finding for it.

**Checkpoint**: role, schema, engine and the first UI spec are ready. Story work can start.

---

## Phase 3: User Story 1 - Sign up with a role and find my way from the dashboard (P1)

**Goal**: role chosen at sign-up, role dashboards, and navigation that reaches every page.
**Independent test**: Sign up once as an owner and once as a renter; each lands on its dashboard; every page they can use is reachable by clicking.

- [ ] T013 [US1] Add renter preferences: `apps/api/src/db/schema/preference.ts`, migration `renter_preferences`, `PUT /api/me/preferences` and `preferences` in `Me` (`apps/api/src/me/`), `apps/api/test/me.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-renter-preferences-api` · **Size**: S · **Depends on**: T002 · **Status**: todo
  - **Scope**: research R-2; contracts/accounts.md. Columns and CHECKs per data-model.md "renter_preference". Owners get 403.
  - **Acceptance criteria**:
    - Given a renter, When `PUT /api/me/preferences` with `{ country: "IN", city: " Pune ", area: null }`, Then 200, and `GET /api/me` returns `preferences: { country: "IN", city: "Pune", area: null }` (FR-002, AC 1.2).
    - Given a renter without preferences, When `GET /api/me`, Then `preferences` is `null`.
    - Given an owner, When it calls the PUT, Then 403. Given `country: "XX"` or a 101-char city, Then 400.
    - Given `bin/pnpm gen:api`, Then `UpdatePreferencesInput`, `Preferences` and the new `Me` field are committed.

- [ ] T014 [US1] Add the signed-in shell `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/app-nav.tsx` (+ test), `apps/web/src/lib/nav.ts` (+ route-manifest test), role dashboards in `apps/web/src/app/(app)/dashboard/page.tsx`, and widen the matcher in `apps/web/src/proxy.ts`
  - **Owner**: frontend-dev · **Branch**: `feat/002-app-nav` · **Size**: M · **Depends on**: T002, T010 · **Status**: todo
  - **Scope**: research R-16; ui/01. This is the early navigation fix the requester asked for: it links only pages that exist (typedRoutes), so "Find a space" points at the existing `/book` until T039 switches it to `/find`. Renter dashboard: "Find a space" link and an empty state that points to search (the next-booking summary arrives in T057). Owner dashboard: heading and the slot for the spaces list (T023). Matcher covers `/dashboard`, `/book`, `/find`, `/spaces`, `/bookings`, `/owner`.
  - **Acceptance criteria**:
    - Given `useMeGet` returns a renter, When any `(app)` page renders, Then the main nav shows the renter links with `aria-current` on the active one; Given an owner, Then the owner links (FR-004, AC 1.5, OQ-9).
    - Given the route-manifest test, When a page under `src/app/(app)` is not in its role's nav config and not declared "reached from" a nav page, Then the test fails (FR-004 as a test).
    - Given a renter with no bookings, When `/dashboard` renders, Then it shows "Find a space" and an empty state linking to it (AC 1.3, partial; the summary is T057).
    - Given loading or a failed `GET /api/me`, When the shell renders, Then the ui/01 loading and error states show (FR-032).
    - Given no session cookie, When visiting `/find` or `/owner/spaces/new`, Then redirect to `/sign-in?next=…` (FR-005).
    - Given keyboard only, When tabbing from the skip link, Then every nav link is reachable with a visible focus ring (AC 1.5).

- [ ] T015 [US1] Add the role choice and optional preferences to `apps/web/src/app/(auth)/sign-up/page.tsx` and `apps/web/src/components/auth-form.tsx` (+ tests), `inferAdditionalFields` in `apps/web/src/lib/auth-client.ts`, and `apps/web/src/components/preferences-form.tsx` (+ test) on the renter dashboard
  - **Owner**: frontend-dev · **Branch**: `feat/002-sign-up-role` · **Size**: M · **Depends on**: T002, T013, T014, T019 · **Status**: todo
  - **Scope**: ui/01. RHF + `zodResolver`. After a renter's successful sign-up, save preferences with `useMeUpdatePreferences` (a failure shows a non-blocking notice; the account stands). The country picker uses `useReferenceGet` (T019), the same list as the space form.
  - **Note (T002 bridge)**: T002 added a temporary `accountType: 'renter'` in `sign-up/page.tsx` (and `inferAdditionalFields` in `auth-client.ts`, which stays). Replace the hard-coded value with the user's choice and update `sign-up/page.test.tsx`.
  - **Note (T002 review)**: rewrite `sign-up/page.test.tsx` to mock HTTP with MSW (capture the request body) instead of mocking `@/lib/auth-client`, and cover the error path. Do not send `accountType` on profile edits: the update hook rejects even no-op values.
  - **Acceptance criteria**:
    - Given the sign-up form, When submitted without a role, Then a field error tied by `aria-describedby` shows and no request is sent (AC 1.1, FR-001).
    - Given "I need a space" with country IN and city Pune, When sign-up succeeds, Then preferences are saved and the user lands on `/dashboard` as a renter (AC 1.2).
    - Given "I own a space", When sign-up succeeds, Then no preferences step shows and the owner dashboard renders (AC 1.1, AC 1.4 entry).
    - Given a renter on the dashboard, When they edit preferences, Then the success state shows and `GET /api/me` reflects them (FR-002).

- [ ] T016 [US1] QA: `apps/web/e2e/accounts-nav.spec.ts` (journeys + axe); set T002, T013, T014 and T015 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us1-accounts-e2e` · **Size**: S · **Depends on**: T011, T014, T015 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new visitor, When they sign up as a renter and then as an owner (two accounts), Then each lands on its dashboard and every nav page opens by clicking and by keyboard only (AC 1.1–1.5, FR-004).
    - Given `/sign-up` (with a role error), both dashboards and the preferences form, When axe runs with WCAG 2.1 AA tags, Then zero violations (SC-007).
    - Given a pre-existing account created through a direct DB insert, When it signs in, Then the renter nav shows (AC 1.6).

- [ ] T017 [US1] Docs: README "Accounts and roles" section, `docs/runbooks/local-development.md` (demo accounts, `SEED_DEMO_PASSWORD`), changeset check for `@bseat/api` and `@bseat/web`
  - **Owner**: docs-writer · **Branch**: `docs/002-us1-accounts` · **Size**: S · **Depends on**: T016 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new contributor, When they follow the README and runbook, Then they can sign in as the demo owner and renter (Assumptions "seeded demo owner").
    - Given `bin/pnpm changeset status`, When run, Then the US1 PRs have user-visible changesets.

**Checkpoint**: US1 is shippable: roles, dashboards and navigation.

---

## Phase 4: User Story 2 - List my space (P1)

**Goal**: an owner creates a complete listing with seats and cubicles, and publishes or unpublishes it.
**Independent test**: create a space with all details and 10 seats, add a price (fixture or US3), publish, and confirm it is searchable (search itself is verified in T044).

- [ ] T018 [P] [US2] Write `specs/002-space-marketplace/ui/02-owner-listing.md`
  - **Owner**: ui-ux-designer · **Branch**: `docs/002-ui-owner-listing` · **Size**: M · **Depends on**: T010 · **Status**: todo
  - **Scope**: owner dashboard spaces list and empty state, space form (country → suggested time zone, currency, opening hours radio + times, utilities checkboxes + up to 5 custom), space overview with status and publish/unpublish (including the "what is missing" refusal), seats page (list, add one, bulk pattern with preview, rename, cubicle assign, remove with the future-bookings refusal, 200 limit), cubicles, and the pricing page (shift time, slot toggles with derived times, price grid with currency, empty = not offered). Exact copy for every problem type these screens can receive.
  - **Acceptance criteria**:
    - Given each screen, When read, Then all eight states are specified (FR-032).
    - Given every problem type in contracts/README.md reachable from these screens, When read, Then its exact copy is given, plus a fallback (FR-020 style; AC 2.4).
    - Given the price grid and the bulk seat form, When read, Then keyboard order, labels, error association and the money format are defined (SC-007, AC 3.4).

- [ ] T019 [P] [US2] Add the reference module `apps/api/src/reference/` (`GET /api/reference`, `countries.ts` ISO list) with unit and integration tests; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-reference-api` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Scope**: research R-13; contracts/accounts.md. Standard utilities per **OQ-8**. Export the validators (`isCountryCode`, `isCurrencyCode`) for T020 and T013.
  - **Acceptance criteria**:
    - Given a signed-in user, When `GET /api/reference`, Then `countries` includes `{ code: "IN", name: "India" }` with `Asia/Kolkata` in `timeZones`, and `{ code: "GB" }` with `Europe/London` (AC 2.1 "time zone suggested from the country").
    - Given the response, Then `currencies` includes `INR` and `GBP`, and `utilities` equals the 11 standard codes (AC 2.2).
    - Given no session, Then 401 (FR-005). Given `gen:api`, Then `Reference` is committed.

- [ ] T020 [US2] Build `apps/api/src/owner-spaces/` (schemas, service, controller, module; spaces only) with `apps/api/test/owner-spaces.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-owner-spaces-api` · **Size**: M · **Depends on**: T002, T004, T019 · **Status**: todo
  - **Carry-over (T003 review)**: `ownerId`, `status` and `spaceId` come only from the session or route, never the request body, and the service maintains `space.updated_at`.
  - **Scope**: contracts/owner-spaces.md "Listing". Create also inserts the shared calendar (AC 6.1). Publish check: at least one active seat and one offered pass (enabled slot valid for the mode with a price). Scope every query by `owner_id`. Integration tests first.
  - **Acceptance criteria**:
    - Given an owner, When `POST /api/owner/spaces` with every required field, Then 201 `OwnerSpace` with `status: "draft"`, and a shared calendar from today (local), no end, all days exists (AC 2.1, FR-006, AC 6.1).
    - Given a body missing any required field, a 101-char name, a 2,001-char description, an unknown country, an invalid time zone, an unknown currency, fixed hours with closing ≤ opening, or six custom utilities, When posted, Then 400 naming the field (FR-006, AC 2.1, AC 2.2).
    - Given a draft with no seats or no offered pass, When published, Then 422 `listing:publish-incomplete` with `missing` listing exactly what is absent, documented as `PublishIncompleteProblem` in `openapi.json` (FR-008, AC 2.4, AQ-3).
    - Given a draft with a seat and a price (fixtures), When published, Then 200 `published`; When unpublished, Then 200 `unpublished` and an existing booking row is unchanged (AC 2.5).
    - Given owner B, When B calls GET, PATCH, publish or unpublish on A's space, Then each returns a 404 identical to a random UUID (FR-009, AC 2.6). Given a renter, Then 403.
    - Given `GET /api/owner/spaces`, When called by A, Then only A's spaces return, ordered by name (AC 1.4).
    - Given `gen:api`, Then the listing schemas are committed.

- [ ] T021 [US2] Add seats and cubicles to `apps/api/src/owner-spaces/` with `apps/api/test/owner-seats.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-seats-cubicles-api` · **Size**: M · **Depends on**: T005, T020 · **Status**: todo
  - **Carry-over (T003 review)**: every seat read and booking path filters `removed_at IS NULL` (legacy availability, list and create already do).
  - **Scope**: contracts/owner-spaces.md "Seats and cubicles"; research R-15 (space row `FOR UPDATE` for the cap, seat `FOR UPDATE` for removal). Cubicle delete per **OQ-6** is a **soft** removal of the cubicle and its seats in one transaction (architect, T001). Label conflicts use `LabelTakenProblem`; duplicate cubicle names are 409 `listing:cubicle-name-taken`. `OwnerSeat.today` returns `vacant` with null note until T047; `calendar` returns `shared` until T051.
  - **Acceptance criteria**:
    - Given a space, When `POST …/seats` with pattern `{ prefix: "A-", from: 1, to: 20 }`, Then 201 with seats `A-1` … `A-20` (AC 2.3).
    - Given a seat with label `A-1` exists, When a bulk add includes `A-1`, Then 409 `listing:label-taken` with `labels: ["A-1"]` and nothing is created (FR-007).
    - Given 195 active seats, When 6 are added, Then 422 `listing:seat-limit`; Given two concurrent requests adding 150 each to an empty space, Then exactly one succeeds (FR-007, R-15).
    - Given a seat with an active future hold (fixture), When deleted, Then 409 `listing:seat-has-future-bookings`; Given only past holds, Then 204 and it disappears from the list (FR-007, edge).
    - Given a cubicle whose seat has a future booking, When deleted, Then 409 and nothing changes (edge, OQ-6); Given a cubicle whose seats have only past bookings, When deleted, Then 204, the cubicle and its seats have `removed_at` set, and a past booking still reports its `cubicleName`.
    - Given an active cubicle `Bay 1`, When another is created or one is renamed to `Bay 1`, Then 409 `listing:cubicle-name-taken`.
    - Given seat features and a cubicle, When created and renamed, Then the list shows them (AC 2.3).
    - Given owner B, When B touches A's seats or cubicles, Then 404 parity (FR-009). Given `gen:api`, Then the seat and cubicle schemas are committed.

- [ ] T022 [US2] Build `apps/web/src/components/space-form.tsx` (+ test) and `apps/web/src/app/(app)/owner/spaces/new/page.tsx`; add "List a space" to the owner nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-space-form` · **Size**: M · **Depends on**: T014, T018, T019, T020 · **Status**: todo
  - **Scope**: ui/02. RHF + Zod (mirrors `CreateSpaceInput`), `useReferenceGet`, `useOwnerSpacesCreate`. Time zone suggested from the country and changeable (all zones from `Intl.supportedValuesOf('timeZone')`). The form is reused for editing in T023.
  - **Acceptance criteria**:
    - Given the form, When submitted empty, Then each required field shows its error tied by `aria-describedby`, and no request is sent (AC 2.1).
    - Given country IN is chosen, When the time zone field updates, Then it suggests `Asia/Kolkata` and can be changed (AC 2.1).
    - Given "Fixed working hours", When the closing time is not after the opening time, Then a field error shows (OQ-7).
    - Given utilities, When ticking standard ones and adding a sixth custom one, Then the sixth is refused with the ui/02 copy (AC 2.2).
    - Given a successful create, Then the user lands on the space overview route (T023) or, until T023 merges, on `/dashboard` with a success message.

- [ ] T023 [US2] Owner dashboard spaces list (`apps/web/src/components/owner-spaces.tsx` + test), space overview `apps/web/src/app/(app)/owner/spaces/[spaceId]/page.tsx` with edit, publish and unpublish, and the management sub-nav `apps/web/src/components/space-manage-nav.tsx`
  - **Owner**: frontend-dev · **Branch**: `feat/002-owner-dashboard` · **Size**: M · **Depends on**: T022 · **Status**: todo
  - **Scope**: ui/02. `useOwnerSpacesList`, `useOwnerSpacesGet`, `useOwnerSpacesUpdate`, publish/unpublish mutations. The sub-nav starts with "Details" only; each later page task adds its link.
  - **Acceptance criteria**:
    - Given an owner with no spaces, When `/dashboard` renders, Then the empty state invites them to list their first space (AC 1.4).
    - Given two spaces, When the dashboard renders, Then each shows name, status and links to manage it (AC 1.4).
    - Given a draft without seats, When Publish is pressed, Then an alert lists what is missing in ui/02 copy (AC 2.4); Given a complete draft, Then the status changes to Published (FR-008).
    - Given a published space, When Unpublish is confirmed, Then the status reads Unpublished (AC 2.5).
    - Given B opens `/owner/spaces/{A's id}`, When the API returns 404, Then the not-found state shows (AC 2.6).

- [ ] T024 [US2] Seats page `apps/web/src/app/(app)/owner/spaces/[spaceId]/seats/page.tsx` with `components/seat-manager.tsx` and `components/bulk-seat-form.tsx` (+ tests); add "Seats" to the sub-nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-seats-page` · **Size**: M · **Depends on**: T021, T023 · **Status**: todo
  - **Acceptance criteria**:
    - Given the bulk form with `A-` 1 to 20, When submitted, Then a preview names the first and last label and, after confirm, 20 seats are listed (AC 2.3).
    - Given a duplicate label or the 200 limit, When the API refuses, Then the ui/02 copy shows in an alert (FR-007).
    - Given a seat with future bookings, When Remove is confirmed, Then the refusal copy shows and the seat stays (edge).
    - Given rename and cubicle assignment, When saved, Then the list updates (AC 2.3). All states per ui/02 (FR-032).

- [ ] T025 [US2] QA: `apps/web/e2e/owner-listing.spec.ts` (journey + axe) and an owner-scoping sweep `apps/api/test/owner-scoping.int-spec.ts`; set T018–T024 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us2-listing-e2e` · **Size**: M · **Depends on**: T009, T011, T023, T024 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new owner, When they create a space, add 20 seats by pattern and try to publish without prices, Then publishing is refused with what is missing; after a price is added through the API, it publishes (AC 2.1–2.4). The time from sign-up to publish is recorded against SC-001 (final check in T070).
    - Given every `/api/owner/*` route, When called by another owner with a real id and with a random UUID, Then the two responses are identical 404s, and a renter gets 403 (FR-009, AC 2.6).
    - Given the owner dashboard, space form (with errors), overview and seats pages, When axe runs, Then zero violations (SC-007).

- [ ] T026 [US2] Docs: README "Listing a space" section, changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us2-listing` · **Size**: S · **Depends on**: T025 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When an owner-side contributor reads it, Then it explains draft/published/unpublished and the publish rule (FR-008).
    - Given `bin/pnpm changeset status`, Then the US2 PRs have changesets.

**Checkpoint**: owners can create and publish listings.

---

## Phase 5: User Story 3 - Set up slots, passes and prices (P1)

**Goal**: owners enable slots and price passes; renters see exactly the offered options and the 24-hour saving.
**Independent test**: for a 24-hour space, enable day, night and 24-hour with day and monthly prices; a renter's listing page shows exactly those options and the saving.

- [ ] T027 [US3] Add pricing to `apps/api/src/owner-spaces/` (`GET`/`PUT …/pricing`) with `apps/api/test/owner-pricing.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-pricing-api` · **Size**: M · **Depends on**: T007, T020 · **Status**: todo
  - **Scope**: contracts/owner-spaces.md "Pricing". Slot times come from `slots.ts`. Changing `shiftChangeAt` or `openingHours` never touches bookings (edge).
  - **Acceptance criteria**:
    - Given a 24-hour space, When `PUT` sets shift 07:00 and enables day, night and full_day, Then `GET` returns three slots with 07:00–19:00, 19:00–07:00 (`endsNextDay`) and 07:00–07:00 (`endsNextDay`) (AC 3.1, FR-010).
    - Given a fixed-hours space 09:00–18:00, When `GET`, Then exactly one `working_hours` slot 09:00–18:00; When a `PUT` tries to disable it or enable `day`, Then 400 (AC 3.2).
    - Given a day price and an empty weekly price, When saved, Then the weekly pass is not offered (null) (AC 3.3, FR-011).
    - Given `"0"`, `"12.345"` or a negative price, When saved, Then 400; prices are returned in the space's currency with two decimals (AC 3.4).
    - Given an existing booking at 500.00, When the price changes to 600.00, Then the booking still reads 500.00 (AC 3.6, FR-013; booking fixture).
    - Given another owner, Then 404 parity. Given `gen:api`, Then `SpacePricing` and `UpdatePricingInput` are committed.

- [ ] T028 [US3] Build `apps/api/src/listings/` with `GET /api/listings/{spaceId}` (published only, offers, `fullDaySavings`, `isOwnSpace`) and `apps/api/test/listings-detail.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-listing-detail-api` · **Size**: S · **Depends on**: T027 · **Status**: todo
  - **Acceptance criteria**:
    - Given a published 24-hour space with day 500.00, night 400.00 and full_day 800.00 day passes, When a renter `GET`s it, Then `offers` lists exactly the enabled, priced slots and `fullDaySavings.day` is `{ amount: "100.00", percent: 11 }` (AC 3.5, FR-012).
    - Given a disabled slot or an unpriced pass, When fetched, Then it is absent (AC 3.3).
    - Given a draft or unpublished space, When a renter fetches it, Then 404 (FR-008, R-3).
    - Given the owner fetches their own published space, Then `isOwnSpace: true` (edge "owner books own").
    - Given the response, When inspected, Then it has no owner contact or occupancy notes (R-3). Given `gen:api`, Then `Listing` is committed.

- [ ] T029 [P] [US3] Write `specs/002-space-marketplace/ui/03-renter-booking.md`
  - **Owner**: ui-ux-designer · **Branch**: `docs/002-ui-renter-booking` · **Size**: M · **Depends on**: T010 · **Status**: todo
  - **Scope**: Find a space (filters, prefill, accessible city/area suggestions combobox, results with lowest prices, paging, "widen to the whole country" empty state), listing page (details, utilities, pass/slot options with prices and the 24-hour saving, start date picker limited to 30 days, seat list with free / taken / closed by text and icon, closed days, end date and time, price, "no seat free for the whole period" state), booking confirmation step and confirmation with the offline-payment note, My bookings (items, cancel confirmation, already-started refusal), the renter dashboard next-booking summary, and copy for every booking problem type.
  - **Acceptance criteria**:
    - Given each screen, When read, Then all eight states are specified (FR-032).
    - Given seat states, When read, Then free, taken and closed each have text and an icon, never colour alone (AC 4.4, FR-031 consistency).
    - Given every booking problem type, When read, Then exact copy plus a fallback is given (FR-020).
    - Given SC-002, When the journey from dashboard to confirmation is counted, Then it is achievable by keyboard in a stated number of steps, with focus management after booking and cancel.

- [ ] T030 [US3] Pricing page `apps/web/src/app/(app)/owner/spaces/[spaceId]/pricing/page.tsx` with `components/pricing-form.tsx` (+ test); add "Passes and prices" to the sub-nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-pricing-page` · **Size**: M · **Depends on**: T023, T027 · **Status**: todo
  - **Acceptance criteria**:
    - Given a 24-hour space, When the shift time changes, Then the derived slot times update before saving (AC 3.1).
    - Given a fixed-hours space, When the page renders, Then only "Working hours" shows and it cannot be turned off (AC 3.2).
    - Given an invalid price ("12.345", "0"), When saved, Then the field error shows and no request is sent (AC 3.4).
    - Given a successful save, Then the success state shows and empty prices read "Not offered" (AC 3.3). All states per ui/02.

- [ ] T031 [US3] Listing page v1 `apps/web/src/app/(app)/spaces/[spaceId]/page.tsx` with `components/listing-details.tsx` and `components/pass-options.tsx` (+ tests); declare the route "reached from" Find a space in `lib/nav.ts`
  - **Owner**: frontend-dev · **Branch**: `feat/002-listing-page` · **Size**: M · **Depends on**: T014, T028, T029 · **Status**: todo
  - **Acceptance criteria**:
    - Given a listing with day, night and full_day offers, When the page renders, Then each slot shows its local times labelled with the time zone and its prices per pass (AC 3.5, FR-033).
    - Given a `fullDaySavings` entry, When rendered, Then the 24-hour option shows the saving as an amount and a percentage (AC 3.5, FR-012).
    - Given a 404, When rendered, Then the not-found state shows. Given loading and 500, Then those states show (FR-032).

- [ ] T032 [US3] QA: `apps/web/e2e/pricing.spec.ts` (owner sets prices, renter sees them, axe); set T027–T031 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us3-pricing-e2e` · **Size**: S · **Depends on**: T030, T031 · **Status**: todo
  - **Acceptance criteria**:
    - Given a 24-hour space, When the owner enables three slots with day and monthly prices, Then a renter sees exactly those options and the 24-hour saving (US3 independent test, AC 3.1–3.5).
    - Given the owner switches the space to fixed hours while a night booking exists (fixture), Then the booking is unchanged and only "Working hours" is offered (edge "switching mode").
    - Given the pricing page (with errors) and the listing page, When axe runs, Then zero violations (SC-007).

- [ ] T033 [US3] Docs: README "Slots, passes and prices", changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us3-pricing` · **Size**: S · **Depends on**: T032 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When read, Then it explains the day/night/24-hour derivation from the shift time and that payment is offline (Clarifications).
    - Given `bin/pnpm changeset status`, Then the US3 PRs have changesets.

**Checkpoint**: listings carry prices; renters can see offers.

---

## Phase 6: User Story 4 - Search by location and book a seat with a pass (P1) (MVP completes here)

**Goal**: renters search, open a listing, pick pass, slot, start date and a free seat, and book; both sides get an email. The hourly flow is fully retired.
**Independent test**: two published spaces in different cities; search one city, book a weekly day-slot pass, confirm the booking, both emails, and the seat taken for those 7 days.

- [ ] T034 [US4] Add `GET /api/listings` (search) and `GET /api/listings/locations` (suggestions) to `apps/api/src/listings/` with `apps/api/test/listings-search.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-listing-search-api` · **Size**: M · **Depends on**: T027 · **Status**: todo
  - **Scope**: contracts/listings.md; research R-9. Order and paging per **OQ-12**. Without `startDate`, `pass` and `slot` filter on "offered". The availability filter is T038.
  - **Acceptance criteria**:
    - Given published spaces in Pune and London and a draft in Pune, When searching `country=IN&city=%20PUNE%20`, Then only the published Pune space returns (AC 4.1, AC 4.2, FR-014).
    - Given a space with Wi-Fi and parking and one with Wi-Fi only, When filtering `utilities=wifi&utilities=parking`, Then only the first returns (AC 4.3).
    - Given a result, When inspected, Then it has name, area, city, utilities and the lowest price per pass type (null when not offered) (FR-015).
    - Given suggestions for `country=IN&field=city&q=pu`, Then "Pune" (as most owners spelled it) is suggested from published listings only, at most 10; Given `q` with `%` or `_`, Then they are matched literally (AC 4.2).
    - Given 25 matches, When `limit=20`, Then 20 items and a `nextCursor` that returns the remaining 5 (OQ-12).
    - Given no match, Then `{ items: [], nextCursor: null }` (edge "city with no spaces"). Given `gen:api`, Then the schemas are committed.

- [ ] T035 [US4] Add `GET /api/listings/{spaceId}/seats` to `apps/api/src/listings/` with `apps/api/test/listings-seats.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-seat-availability-api` · **Size**: M · **Depends on**: T005, T028 · **Status**: todo
  - **Scope**: contracts/listings.md; research R-10 (one hold query over the envelope, spelled for the GiST index; occurrences computed once per distinct calendar).
  - **Acceptance criteria**:
    - Given 6 seats and an active weekly day-slot booking on one of them, When requesting `pass=week&slot=day&startDate=` that week, Then 5 `free` and 1 `taken`, with `endDate`, `firstStartsAt`, `lastEndsAt` and the price (AC 4.4, FR-016).
    - Given the same booking, When requesting `slot=night` for the same week, Then all 6 are `free`; When requesting `slot=full_day`, Then that seat is `taken` (edge "day and night", "24-hour blocks both").
    - Given an occupancy mark on a seat, When requested, Then that seat is `taken` and no note is present (FR-022).
    - Given a seat whose own calendar closes the start date, Then it is `closed`; Given a Mon–Fri shared calendar and a weekly pass from Monday, Then `includedDates: 5` and Sat/Sun in `closedDates` (AC 6.4, FR-017).
    - Given a disabled slot or unpriced pass, Then 422 `booking-rule:pass-not-offered`; Given a draft space, Then 404.
    - Given a night pass, When requested, Then `slotTimes.endsNextDay` is true and the last end is the morning after `endDate` (edge "night crosses midnight").

- [ ] T036 [US4] Add `POST /api/listings/{spaceId}/bookings` to `apps/api/src/bookings/` (schemas, service, controller, `bookings.service.spec.ts`) with `apps/api/test/pass-bookings.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-create-pass-booking-api` · **Size**: M · **Depends on**: T008, T035 · **Status**: todo
  - **Scope**: contracts/bookings.md (processing steps 1–4 and 6; emails are T037). Transaction with seat `FOR SHARE`, header + holds in chronological order, error mapping from `DrizzleQueryError.cause` by constraint name, `40P01` retries the whole transaction (max 3, `warn` log per retry), injected `Clock`. Unit tests of the mapping and retry first.
  - **Acceptance criteria**:
    - Given a free seat, When a renter books `pass=week, slot=day, startDate=next Monday`, Then 201 `Booking` with 7 `days`, the price and currency snapshot, and availability shows the seat `taken` for that week (AC 4.5, FR-017, FR-013).
    - Given another renter or an occupancy mark holds the seat on any day of the period in an overlapping slot, When booking, Then 409 `booking:seat-unavailable` and no header or hold row exists (AC 4.6, FR-018).
    - Given 20 renters, When all 20 book the same seat for overlapping periods concurrently (mixed day and week passes), Then exactly one 201 and nineteen 409 `seat-unavailable`, repeated 5 times (AC 4.7, SC-005).
    - Given I hold a day-slot pass at space X, When I book a day-slot pass at space Y overlapping in time, Then 409 `booking:user-overlap` (AC 4.8, FR-019).
    - Given one case per rule (unpublished, own space, pass not offered, start day closed, slot started, 31 days ahead), When booking, Then 422 with that `type` and nothing is created (AC 4.9, FR-020, edge "owner books own").
    - Given a seat in another space, or a removed seat, Then 404.
    - Given the insert transaction fails with `40P01` once then succeeds (unit test), Then the booking is created and one `booking.insert_deadlock_retry` warn is logged without user data.
    - Given the 201 body, When inspected, Then it has no user id. Given `gen:api`, Then `CreateBookingInput` and `Booking` are committed.

- [ ] T037 [P] [US4] Send renter and owner booking emails: `apps/api/src/bookings/booking-emails.ts` (+ `.spec.ts`), wire into the create service, extend `apps/api/test/pass-bookings.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-booking-emails` · **Size**: S · **Depends on**: T036 · **Status**: todo
  - **Scope**: contracts/booking-emails.md; research R-14. Replaces `booking-confirmation.mail.ts`.
  - **Acceptance criteria**:
    - Given a successful booking, When at most 60 s pass, Then Mailpit holds one email to the renter and one to the owner with the subjects and lines in the contract, including price, period with the time zone, and the "payment is made directly to the owner" sentence (AC 4.5, AC 4.10, FR-021, SC-006).
    - Given `MailService.send` rejects or never settles for both emails (unit test with fake timers), When booking, Then 201 after at most one 2 s bound (the two enqueues run concurrently), both failures are logged at `error` with the booking id only, and the booking persists (FR-021).
    - Given a night pass in `Europe/London` across a DST change, When the email is built, Then local times match the slot wall-clock (FR-033, edge DST).

- [ ] T038 [US4] Add the availability filter to `GET /api/listings` (`startDate`, `pass`, `slot`) and `apps/api/test/listings-search-availability.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-search-availability-filter` · **Size**: M · **Depends on**: T034, T035 · **Status**: todo
  - **Scope**: research R-10 (prefilter in SQL, evaluate candidates in batches until the page fills). Behaviour without pass or slot per **OQ-4**.
  - **Acceptance criteria**:
    - Given space P with one seat free for the week and space Q with every seat taken on one day of that week, When searching with `startDate`, `pass=week`, `slot=day`, Then only P returns (AC 4.3).
    - Given a space whose only free days are scattered, When searching a monthly pass, Then it is left out (edge "no seat for the whole period").
    - Given `startDate` without pass or slot, Then the OQ-4 rule applies (test named after it).

- [ ] T039 [US4] Find a space page `apps/web/src/app/(app)/find/page.tsx` with `components/listing-search-form.tsx`, `components/location-combobox.tsx` and `components/listing-results.tsx` (+ tests); point the nav's "Find a space" at `/find`
  - **Owner**: frontend-dev · **Branch**: `feat/002-find-page` · **Size**: M · **Depends on**: T013, T014, T029, T034 · **Status**: todo
  - **Scope**: ui/03. Filters prefilled from `Me.preferences`. Accessible combobox (ARIA 1.2 pattern) with debounced `useListingsLocations`. Filters in the URL so results are shareable and back-navigation works.
  - **Acceptance criteria**:
    - Given a renter with preferences IN / Pune, When `/find` opens, Then country and city are prefilled and matching results load (AC 4.1, FR-002).
    - Given typing "pu" in city, When suggestions show, Then they can be chosen by keyboard (arrow keys, Enter) and pointer (AC 4.2).
    - Given a result, When rendered, Then name, area, city, utilities and lowest price per pass type show, and it links to `/spaces/{id}` (FR-015).
    - Given no results for a city, When rendered, Then the empty state offers to search the whole country (edge "city with no spaces").
    - Given loading, error and paging, Then ui/03 states show (FR-032).

- [ ] T040 [US4] Seat availability on the listing page: `components/pass-picker.tsx` and `components/listing-seat-list.tsx` (+ tests) in `apps/web/src/app/(app)/spaces/[spaceId]/page.tsx`
  - **Owner**: frontend-dev · **Branch**: `feat/002-listing-seats` · **Size**: M · **Depends on**: T031, T035 · **Status**: todo
  - **Acceptance criteria**:
    - Given a pass, slot and start date, When the seat list loads, Then every seat shows free, taken or closed by text and icon, plus the end date and time labelled with the zone and the price (AC 4.4, FR-016, FR-033).
    - Given closed days in the period, When rendered, Then they are listed as "closed" and the price is unchanged (AC 6.4).
    - Given no seat free, When rendered, Then the "no seat is free for the whole period" state shows (edge).
    - Given the start date picker, When opened, Then dates more than 30 days ahead are not selectable (AC 4.9, UX only).

- [ ] T041 [US4] Book action and confirmation: `components/book-pass.tsx` (+ test) and `apps/web/src/lib/marketplace-problems.ts` (+ test)
  - **Owner**: frontend-dev · **Branch**: `feat/002-book-pass-ui` · **Size**: M · **Depends on**: T036, T040 · **Status**: todo
  - **Scope**: `useBookingsCreate`; invalidate seat availability and my bookings; focus handling per ui/03. Hide booking on `isOwnSpace`.
  - **Acceptance criteria**:
    - Given a free seat, When the renter books (with the ui/03 confirmation), Then the confirmation shows seat, pass, slot, period, price and the offline-payment note, and the seat reads taken after refetch (AC 4.5).
    - Given 409 `seat-unavailable`, 409 `user-overlap` or any 422 `booking-rule:*`, When booking, Then an alert (`role="alert"`) shows the ui/03 copy; an unknown type shows `detail` (AC 4.6, AC 4.8, AC 4.9, FR-020).
    - Given a pending request, When Book is pressed again, Then nothing is sent (disabled, `aria-busy`).
    - Given `isOwnSpace`, When the page renders, Then booking controls are replaced by the "mark it occupied instead" note (edge).

- [ ] T042 [US4] Retire `/book`: replace `apps/web/src/app/(app)/book/page.tsx` with a permanent redirect to `/find`, remove `book-view`, `booking-window-form`, `seat-availability`, `space-list`, `lib/booking-problems.ts` and their tests, and update `apps/web/e2e/book.spec.ts`
  - **Owner**: frontend-dev · **Branch**: `chore/002-retire-book-page` · **Size**: S · **Depends on**: T039, T041 · **Status**: todo
  - **Acceptance criteria**:
    - Given a signed-in user, When visiting `/book`, Then they land on `/find` (R-7 step 5).
    - Given the web app, When `grep -r "useSpacesList\|useSpacesAvailability" apps/web/src` runs, Then nothing is found, and lint, typecheck and tests pass.

- [ ] T043 [US4] Retire the legacy spaces API: remove `apps/api/src/spaces/` (move or delete `resolveWindow`), its tests and registration; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `chore/002-retire-legacy-spaces-api` · **Size**: S · **Depends on**: T042 · **Status**: todo
  - **Acceptance criteria**:
    - Given the API, When `GET /api/spaces` or `GET /api/spaces/{id}/availability` is called, Then 404 (R-7 step 6).
    - Given `gen:api`, Then `Space`, `SpaceList`, `AvailabilityQueryInput`, `SpaceAvailability` and `SeatAvailability` are gone from `openapi.json`, and the web typecheck passes.

- [ ] T044 [US4] QA: `apps/web/e2e/search-book.spec.ts` (journey + axe), `apps/api/test/booking-races.int-spec.ts` (mixed slots), `apps/api/test/marketplace-perf.int-spec.ts`; set T034–T043 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us4-search-book-e2e` · **Size**: M · **Depends on**: T009, T037, T038, T042 · **Status**: todo
  - **Scope**: e2e picks dates 2–28 days ahead and the first free seat (avoid collisions with persisted dev data, 001 T014 lesson). Use a sturdy sign-up helper (API sign-up, wait for hydration), no retries-only fixes.
  - **Acceptance criteria**:
    - Given two seeded cities, When a renter searches one, opens the result, books a weekly day pass on a free seat, Then the confirmation shows, both emails arrive in Mailpit, and the seat is taken for those 7 days (US4 independent test, AC 4.1, AC 4.4, AC 4.5, AC 4.10).
    - Given the dashboard, When a renter reaches a confirmed booking by keyboard only, Then no address is typed and the time is under 60 s (SC-002).
    - Given concurrent 24-hour vs day vs night bookings on one seat and date (10 each), When raced 5 times, Then the outcomes respect "24 hours blocks both; day and night coexist" exactly (edge, FR-018, SC-005).
    - Given 1,000 published spaces, When 50 searches run, Then p95 < 1000 ms; Given a 200-seat space with a month of holds, When monthly-pass availability is requested 50 times, Then p95 < 1000 ms; `EXPLAIN` in the PR shows the GiST index on `seat_hold` (SC-003, SC-004).
    - Given `/find` (results, empty), the listing page (seats loaded, conflict error) and the confirmation, When axe runs, Then zero violations (SC-007).

- [ ] T045 [US4] Docs: README "Find and book", `docs/runbooks/booking-confirmations.md` (two emails), `docs/runbooks/database-migrations.md` (the T005 expand/contract and backfill), changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us4-search-book` · **Size**: S · **Depends on**: T043, T044 · **Status**: todo
  - **Acceptance criteria**:
    - Given the runbook, When an operator reads it, Then it explains that `seat_hold` carries the no-overlap constraints, why `0003+` never edit `0000`–`0002`, and how to diagnose a missing owner email (FR-021).
    - Given `bin/pnpm changeset status`, Then the US4 PRs have changesets, including the removal of the hourly flow.

**Checkpoint**: P1 complete. The marketplace MVP (US1–US4) can be demonstrated and released.

---

## Phase 7: User Story 5 - Mark a seat occupied or vacant (P2)

**Goal**: owners block seats for internal use or other channels; renters see them as taken.
**Independent test**: mark a seat occupied for next week; renters see it taken and cannot book it; marking it vacant frees it.

- [ ] T046 [P] [US5] Write `specs/002-space-marketplace/ui/04-owner-operations.md`
  - **Owner**: ui-ux-designer · **Branch**: `docs/002-ui-owner-operations` · **Size**: M · **Depends on**: T018 · **Status**: todo
  - **Scope**: seat state today (vacant, occupied by me with note, booked by a renter), mark occupied (multi-select seats, dates, optional end, private note), conflict refusal listing dates per seat, mark vacant and future marks (**OQ-5**), shared and per-seat calendars (date range, weekday toggles, switch to own / back to shared, the "N bookings fall outside the new calendar" notice), owner bookings list with date filter and paging (`nextCursor`, architect T001).
  - **Acceptance criteria**:
    - Given each screen, When read, Then all eight states are specified (FR-032).
    - Given seat states and weekday toggles, When read, Then none rely on colour alone, and keyboard multi-select is defined (SC-007).
    - Given every problem type these screens receive, Then exact copy is given (FR-023).

- [ ] T047 [US5] Add occupancy to `apps/api/src/owner-operations/` (`GET`/`POST …/occupancy`, `POST …/occupancy/{markId}/end`) and fill `OwnerSeat.today` in `apps/api/src/owner-spaces/`, with `apps/api/test/occupancy.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-occupancy-api` · **Size**: M · **Depends on**: T006, T021 · **Status**: todo
  - **Scope**: contracts/owner-operations.md "Occupancy"; research R-11 (`dayBoundary` from T006; all seats in one transaction, holds inserted in `(seat_id, starts_at)` order; `40P01` retries the whole transaction, at most 3 attempts, with the booking create's helper; on `23P01` roll back, then build `OccupancyConflictProblem.conflicts` from the overlapping holds). Mark status comes from its hold (ADR-0009 section 3). **OQ-5** for vacate.
  - **Acceptance criteria**:
    - Given two seats, When marked occupied from next Monday with no end and a note, Then 201 with two marks, renters' seat availability shows them `taken` from that day onward, and the note never appears on `/api/listings/*` (AC 5.1, FR-022).
    - Given a renter booking on one of the seats on Wednesday, When marking both seats Mon–Fri, Then 409 `occupancy:conflicts-with-bookings` with `conflicts: [{ seatId, label, bookedDates: [Wednesday], marks: [] }]`, and no mark is created (AC 5.3, FR-023).
    - Given an open-ended mark on a seat, When an overlapping open-ended mark is requested, Then 409 `occupancy:already-occupied` with `bookedDates: []` and the existing mark as `{ id, startDate, endDate: null }` (finite body, AQ-3).
    - Given the occupancy insert fails with `40P01` once then succeeds (unit test), Then the marks are created and one retry is logged with ids only.
    - Given an active mark that started yesterday, When ended, Then the hold ends now and a booking whose first slot starts after now succeeds (AC 5.2).
    - Given a mark that starts next week, When ended, Then its hold is inactive (AC 5.2).
    - Given marks and bookings today, When `GET …/seats`, Then each seat's `today.state` is `vacant`, `occupied` (with note) or `booked` (AC 5.4).
    - Given a 24-hour space with shift 07:00, When a seat is marked from date D, Then a night booking of D−1 (ends D 07:00) is not in conflict (R-11).
    - Given another owner, Then 404 parity (FR-009). Given `gen:api`, Then the schemas are committed.

- [ ] T048 [US5] Occupancy UI on the seats page: `components/seat-state.tsx`, `components/mark-occupied-dialog.tsx` (+ tests)
  - **Owner**: frontend-dev · **Branch**: `feat/002-occupancy-ui` · **Size**: M · **Depends on**: T024, T046, T047 · **Status**: todo
  - **Acceptance criteria**:
    - Given seats, When the page renders, Then each shows today's state in text and icon, and the private note for occupied seats (AC 5.4).
    - Given selected seats and dates, When marked occupied, Then the success state shows and the states refresh (AC 5.1).
    - Given a conflict refusal, When shown, Then the conflicting dates per seat are listed (AC 5.3).
    - Given an occupied seat, When "Mark vacant" is confirmed, Then it reads vacant (AC 5.2).

- [ ] T049 [US5] QA: `apps/web/e2e/occupancy.spec.ts` (journey + axe) and `apps/api/test/occupancy-races.int-spec.ts`; set T046–T048 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us5-occupancy` · **Size**: M · **Depends on**: T036, T048 · **Status**: todo
  - **Acceptance criteria**:
    - Given a seat marked occupied for next week, When a renter views and tries to book it, Then it shows taken and booking is refused; after marking vacant it can be booked (US5 independent test).
    - Given 10 bookings and 10 occupancy marks racing for one seat and overlapping dates, When run 5 times, Then exactly one request succeeds each time (SC-005 second half, FR-018).
    - Given the seats page with states and the mark dialog (with a conflict error), When axe runs, Then zero violations (SC-007).

- [ ] T050 [US5] Docs: README "Occupied seats", changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us5-occupancy` · **Size**: S · **Depends on**: T049 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When read, Then it explains that notes are private and that occupancy cannot override renter bookings (FR-022, FR-023).

---

## Phase 8: User Story 6 - Availability calendar (P2)

**Goal**: shared and per-seat calendars restrict which days can be booked.
**Independent test**: shared calendar Mon–Fri 1 Nov to 31 Dec, one seat Saturday-only; renters can book only on those days, seat by seat.

- [ ] T051 [US6] Add calendars to `apps/api/src/owner-operations/` (`GET …/calendars`, `PUT …/calendars/shared`, `PUT`/`DELETE …/seats/{seatId}/calendar`) and `OwnerSeat.calendar`, with `apps/api/test/calendars.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-calendar-api` · **Size**: M · **Depends on**: T006, T021 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new space, When `GET …/calendars`, Then shared = from creation date, no end, all 7 days, and no seat has its own (AC 6.1, FR-024).
    - Given the shared calendar set to Mon–Fri, 1 Nov–31 Dec, When a renter requests seat availability starting on a Saturday, Then seats on the shared calendar are `closed` (AC 6.2).
    - Given a seat switched to its own Saturday-only calendar, When availability starts on Saturday, Then that seat is the only one not `closed`; When switched back, Then it follows the shared calendar again (AC 6.3).
    - Given two future bookings with a Wednesday occurrence, When Wednesday is removed from the shared calendar, Then 200 with `bookingsOutsideCalendar: 2`, and both bookings and their holds are unchanged (AC 6.5, FR-025).
    - Given `endDate < startDate` or no weekdays, Then 400. Given another owner, Then 404 parity. Given `gen:api`, Then the schemas are committed.

- [ ] T052 [US6] Availability page `apps/web/src/app/(app)/owner/spaces/[spaceId]/availability/page.tsx` with `components/calendar-form.tsx` (+ test); add "Availability" to the sub-nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-availability-page` · **Size**: M · **Depends on**: T023, T046, T051 · **Status**: todo
  - **Acceptance criteria**:
    - Given the shared calendar, When dates and weekdays are saved, Then the success state shows, and when bookings fall outside, the "N bookings…" notice shows (AC 6.2, AC 6.5).
    - Given a seat, When switched to its own calendar and back, Then the UI reflects each state (AC 6.3).
    - Given weekday toggles, When used by keyboard, Then each has a label and a pressed state not conveyed by colour alone (SC-007).

- [ ] T053 [US6] QA: `apps/web/e2e/calendar.spec.ts` (journey + axe); set T051–T052 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us6-calendar` · **Size**: S · **Depends on**: T036, T052 · **Status**: todo
  - **Acceptance criteria**:
    - Given the US6 independent test setup, When a renter books, Then only allowed days per seat can start a pass, closed days in a weekly pass are skipped at the same price, and booking a closed start day is refused with the ui/03 copy (AC 6.2–6.4).
    - Given the availability page, When axe runs, Then zero violations (SC-007).

- [ ] T054 [US6] Docs: README "Availability calendars", changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us6-calendar` · **Size**: S · **Depends on**: T053 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When read, Then it explains shared vs own calendars and that changes never cancel bookings (FR-024, FR-025).

---

## Phase 9: User Story 7 - See and cancel bookings (P2)

**Goal**: renters list and cancel their bookings; owners list bookings at their spaces.
**Independent test**: two bookings by one renter and one by another at the same space; each renter sees only theirs, the owner sees all three, cancelling one frees its seat.

- [ ] T055 [US7] Add `GET /api/bookings` and `POST /api/bookings/{bookingId}/cancel` to `apps/api/src/bookings/` with `apps/api/test/my-bookings.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-my-bookings-api` · **Size**: M · **Depends on**: T036 · **Status**: todo
  - **Scope**: contracts/bookings.md. Cancel is the single scoped `UPDATE booking`; `seat_hold_booking_fk` cascades the holds to inactive (AQ-7, ADR-0009 section 3), so the service never updates `seat_hold`. Legacy hourly rows are not listed (**OQ-3**).
  - **Acceptance criteria**:
    - Given renter A with two upcoming pass bookings, one ended, one cancelled and a legacy hourly row, and renter B with one, When A lists, Then exactly A's two upcoming pass bookings return, soonest first, with space, area, seat, pass, slot, local period with zone and price (AC 7.1, FR-026).
    - Given A's booking has not started, When A cancels it, Then 200 `cancelled`, every hold is inactive, and seat availability shows it free for the whole period (AC 7.2).
    - Given a booking whose first slot has started, When cancelled, Then 409 `booking:already-started` and it stays active (AC 7.2).
    - Given A's booking id, When B cancels it, Then a 404 identical to a random UUID, and A's booking is unchanged (AC 7.4, FR-028).
    - Given an already-cancelled booking, When cancelled again, Then 200 unchanged.
    - Given `limit=1`, Then only the next booking returns (AC 1.3). Given `gen:api`, Then `BookingList` and the cancel operation are committed.

- [ ] T056 [P] [US7] Add `GET /api/owner/spaces/{spaceId}/bookings` to `apps/api/src/owner-operations/` with `apps/api/test/owner-bookings.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-owner-bookings-api` · **Size**: S · **Depends on**: T036 · **Status**: todo
  - **Acceptance criteria**:
    - Given three bookings by two renters at A's space and one at B's, When A lists its space's bookings, Then exactly the three return, with renter name and email, seat, pass, period and price (AC 7.3, FR-027).
    - Given `from` and `to`, When filtered, Then only bookings with an occurrence in that range return; Given `to < from` or a malformed `cursor`, Then 400 (AC 7.3).
    - Given 120 upcoming bookings, When listed with the default `limit`, Then 50 items and a `nextCursor`; following the cursors returns all 120 exactly once, in `starts_at, id` order (architect, T001: paged list).
    - Given B requests A's space bookings, Then 404 parity; a renter gets 403 (AC 7.4, FR-028).

- [ ] T057 [US7] My bookings page `apps/web/src/app/(app)/bookings/page.tsx` with `components/my-bookings.tsx` (+ test), renter dashboard `components/next-booking.tsx` (+ test); add "My bookings" to both roles' nav (OQ-9)
  - **Owner**: frontend-dev · **Branch**: `feat/002-my-bookings-page` · **Size**: M · **Depends on**: T014, T029, T055 · **Status**: todo
  - **Acceptance criteria**:
    - Given two bookings, When `/bookings` renders, Then both show in API order with space, area, seat, pass, slot, local period labelled with the zone and price (AC 7.1, FR-033).
    - Given an upcoming booking, When cancelled with the ui/03 confirmation, Then it disappears after refetch; Given 409 `already-started`, Then the alert copy shows (AC 7.2).
    - Given a renter with an upcoming booking, When `/dashboard` renders, Then it summarises the next booking; with none, the empty state points to search (AC 1.3).
    - Given empty, loading and error, Then ui/03 states show (FR-032).

- [ ] T058 [US7] Owner bookings page `apps/web/src/app/(app)/owner/spaces/[spaceId]/bookings/page.tsx` with `components/owner-bookings.tsx` (+ test); add "Bookings" to the sub-nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-owner-bookings-page` · **Size**: M · **Depends on**: T023, T046, T056 · **Status**: todo
  - **Acceptance criteria**:
    - Given bookings, When the page renders, Then each shows renter name and email, seat, pass, period with the zone and price (AC 7.3).
    - Given a date range, When applied, Then the list refetches with `from` and `to`, and an invalid range shows a field error (AC 7.3).
    - Given more bookings than one page, When the owner asks for more (ui/04 paging control), Then the next page loads with `nextCursor` and focus moves per ui/04 (architect, T001: paged list).
    - Given empty, loading and error, Then ui/04 states show (FR-032).

- [ ] T059 [US7] QA: `apps/web/e2e/bookings-lists.spec.ts` (journey + axe); set T055–T058 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us7-bookings` · **Size**: S · **Depends on**: T057, T058 · **Status**: todo
  - **Acceptance criteria**:
    - Given the US7 independent test setup, When each renter and the owner open their lists, Then renters see only their own, the owner sees all three, and cancelling one frees its seat (AC 7.1–7.4).
    - Given `/bookings` (items, empty), the renter dashboard summary and the owner bookings page, When axe runs, Then zero violations (SC-007).

- [ ] T060 [US7] Docs: README "Bookings", changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us7-bookings` · **Size**: S · **Depends on**: T059 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When read, Then it explains cancellation (before the first slot only) and the owner list used to collect payment offline (FR-026, FR-027).

---

## Phase 10: User Story 8 - Lay out seats and cubicles on a canvas (P3)

**Goal**: owners draw a grid floor plan; renters choose seats from it.
**Independent test**: place 6 seats in two cubicles and a "Meeting room" area, save, and book from the renter's plan.

- [ ] T061 [P] [US8] Write `specs/002-space-marketplace/ui/05-layout.md`
  - **Owner**: ui-ux-designer · **Branch**: `docs/002-ui-layout` · **Size**: M · **Depends on**: T018, T029 · **Status**: todo
  - **Scope**: editor surface (grid size, R-12 proposal), selection, pointer drag and resize, the full keyboard model (select, move with arrows, resize, rename, delete, escape), the form alternative for every action, the unplaced tray, save and stale-version conflict, cubicle containment feedback; renter plan with free/taken by text or icon, plan/list toggle, choosing a seat to start booking, small-screen behaviour (list view by default on narrow screens is a designer call).
  - **Acceptance criteria**:
    - Given each editor action in AC 8.1, When read, Then it has a pointer, a keyboard and a form path (FR-030, AC 8.3).
    - Given the plan and the editor, When read, Then all eight states, focus order, names and live-region announcements for moves are specified (FR-032, SC-007).
    - Given the renter plan, Then seat state is never conveyed by colour alone and a list view is always reachable (AC 8.4, FR-031).

- [ ] T062 [US8] Add `apps/api/src/db/schema/layout.ts`, migration `layouts`, owner `GET`/`PUT …/layout` in `apps/api/src/owner-operations/`, renter `GET /api/listings/{spaceId}/layout`, `hasLayout` in `OwnerSpace` and `Listing`, and remove a seat's element on soft removal; tests `apps/api/test/layout.int-spec.ts`; regenerate `apps/api/openapi.json`
  - **Owner**: backend-dev · **Branch**: `feat/002-layout-api` · **Size**: M · **Depends on**: T021 · **Status**: todo
  - **Scope**: data-model.md "space_layout and layout_element" (CHECK `layout_element_kind_ref`, sizes, composite FKs); contracts/owner-operations.md "Layout"; research R-12.
  - **Acceptance criteria**:
    - Given a space with no layout, When the owner `GET`s it, Then `version: 0`, no elements, and every active seat in `unplacedSeatIds` (AC 8.2).
    - Given elements for 6 seats, 2 cubicles and an area "Meeting room", When `PUT` with `version: 0`, Then 200 `version: 1`, and the renter layout returns the same geometry with seat labels (AC 8.1, AC 8.4).
    - Given a stale `version`, Then 409 `layout:stale-version`; Given an element outside the grid or a seat outside its cubicle, Then 422 `layout:out-of-bounds` (FR-029).
    - Given a seat added through the seats API, When the owner `GET`s the layout, Then it is in `unplacedSeatIds`; Given a seat removed, Then its element is gone (AC 8.2, FR-029).
    - Given a space without a layout, When a renter requests it, Then 404, and `Listing.hasLayout` is false (AC 8.5).
    - Given another owner, Then 404 parity. Given `gen:api`, Then the layout schemas are committed.

- [ ] T063 [US8] Seed a sample layout for London HQ in `apps/api/src/db/demo-spaces.ts`, extend `apps/api/test/seed.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/002-seed-layout` · **Size**: S · **Depends on**: T009, T062 · **Status**: todo
  - **Acceptance criteria**:
    - Given the seed runs twice, Then London HQ has one layout with its 12 seats placed in two cubicles plus "Meeting room", "Kitchen" and "Entrance" areas, and Pune Hub has none (Assumptions "sample layout", AC 8.5 demo).

- [ ] T064 [US8] Layout editor model `apps/web/src/lib/layout-editor/model.ts` (pure reducer) with `model.test.ts` written first
  - **Owner**: frontend-dev · **Branch**: `feat/002-layout-editor-model` · **Size**: M · **Depends on**: T061, T062 · **Status**: todo
  - **Scope**: actions add, move, resize, rename, delete, place from tray, unplace; grid bounds; cubicle containment; selection; dirty tracking; conversion to `SaveLayoutInput`. No React, no new dependency.
  - **Acceptance criteria**:
    - Given each action, When applied, Then the resulting state matches ui/05 rules, including clamping at grid edges and refusing a seat outside its cubicle (AC 8.1, FR-029).
    - Given a seat in the tray, When placed, Then it leaves the tray; When unplaced, Then it returns (AC 8.2).
    - Given the PR, Then tests were committed first and changed-line coverage is ≥ 80% (Constitution II).

- [ ] T065 [US8] Layout editor page `apps/web/src/app/(app)/owner/spaces/[spaceId]/layout/page.tsx` with `components/layout-editor.tsx`, `components/layout-item-form.tsx` and `components/unplaced-tray.tsx` (+ tests); add "Layout" to the sub-nav
  - **Owner**: frontend-dev · **Branch**: `feat/002-layout-editor` · **Size**: M · **Depends on**: T023, T064 · **Status**: todo
  - **Scope**: DOM/SVG grid, pointer events, keyboard model and form per ui/05. Seat and cubicle create, rename and delete call T021's endpoints immediately; Save calls the layout PUT. No new dependency (research R-12).
  - **Acceptance criteria**:
    - Given the editor, When the owner adds, moves, resizes, renames and deletes seats, cubicles and areas with a pointer, Then the plan updates and Save persists it (AC 8.1, FR-029).
    - Given keyboard only, When every item is selected, moved with arrows, resized and renamed, Then the same results occur, and moves are announced (AC 8.3, FR-030).
    - Given the form panel, When used for each action, Then the same results occur (FR-030).
    - Given a seat added on the canvas, When the seats page is opened, Then it is listed; Given a seat added in the list, Then it appears in the tray (AC 8.2).
    - Given a stale save, When 409 returns, Then the ui/05 conflict state offers to reload.

- [ ] T066 [US8] Renter plan view `apps/web/src/components/listing-plan.tsx` (+ test) on the listing page with a plan/list toggle
  - **Owner**: frontend-dev · **Branch**: `feat/002-renter-plan` · **Size**: M · **Depends on**: T040, T061, T062 · **Status**: todo
  - **Acceptance criteria**:
    - Given a listing with a layout and a chosen pass, slot and date, When the plan renders, Then each seat shows its label and free/taken with text or icon, and choosing a free seat starts the T041 booking flow (AC 8.4, FR-031).
    - Given the toggle, When switched, Then the list view shows the same seats (FR-031). Given no layout, Then only the list shows (AC 8.5).

- [ ] T067 [US8] QA: `apps/web/e2e/layout.spec.ts` (pointer and keyboard-only journeys + axe); set T061–T066 to `done` when green
  - **Owner**: qa-engineer · **Branch**: `test/002-us8-layout` · **Size**: M · **Depends on**: T063, T065, T066 · **Status**: todo
  - **Acceptance criteria**:
    - Given the US8 independent test, When run with a pointer and again with the keyboard only, Then the saved plan matches and a renter books from it (AC 8.1–8.4).
    - Given the editor (with an item selected and a form open) and the renter plan, When axe runs, Then zero violations (SC-007).

- [ ] T068 [US8] Docs: README "Floor plans", changeset check
  - **Owner**: docs-writer · **Branch**: `docs/002-us8-layout` · **Size**: S · **Depends on**: T067 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, When read, Then it documents the editor's keyboard shortcuts and the form alternative (FR-030).

---

## Phase 11: Polish and release

- [ ] T069 [P] Booking hardening carried over from the 001 reviews: producer fail-fast when Redis is not ready (`apps/api/src/mail/`), `MAILPIT_URL` for the test helper (`apps/api/test/fixtures.ts`, `.env.example`), age-based `removeOnComplete` comment or change
  - **Owner**: backend-dev · **Branch**: `chore/002-booking-hardening` · **Size**: S · **Depends on**: T037 · **Status**: todo
  - **Scope**: 001 T012 review follow-ups (c), (g), (h), now that each booking queues two emails. Only if a human confirms OQ-2 (001 T012 superseded); otherwise they stay with 001.
  - **Acceptance criteria**:
    - Given Redis is not ready (unit test), When a booking is created, Then both enqueues reject at once, 201 returns well inside the bound, and `booking.*_not_queued` is logged for each (FR-021).
    - Given the Mailpit helper, When it builds its URL, Then it comes from `MAILPIT_URL` (default `http://localhost:8025`) and no other host is contacted.

- [ ] T070 Final QA: full suite, SC-001 and SC-002 timed journeys, traceability sign-off in `specs/002-space-marketplace/test-plan.md`
  - **Owner**: qa-engineer · **Branch**: `test/002-final-regression` · **Size**: S · **Depends on**: T016, T025, T032, T044, T049, T053, T059, T067, T069 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new owner, When they sign up, list a space with 20 seats, set prices and publish without help, Then it takes under 10 minutes (recorded run; SC-001).
    - Given a renter, When they go from the dashboard to a confirmed booking by keyboard only, Then under 60 s with no typed address (SC-002).
    - Given the traceability table below, When QA checks each row, Then every AC, FR, SC and edge row names a passing test. Missing rows reopen the owning task.
    - Given `bin/pnpm lint typecheck test build`, e2e (5 consecutive green runs, no retries) and `bin/security`, When run, Then all pass.

- [ ] T071 Docs release: README overview of the marketplace, `docs/adr/README.md` index check (0009, 0010), `docs/runbooks/` review, changeset status
  - **Owner**: docs-writer · **Branch**: `docs/002-release` · **Size**: S · **Depends on**: T070 · **Status**: todo
  - **Acceptance criteria**:
    - Given a new contributor, When they follow `specs/002-space-marketplace/quickstart.md` and the README, Then every step produces the documented result.
    - Given `bin/pnpm changeset status`, When run, Then user-visible changesets exist for `@bseat/api` and `@bseat/web` covering every story.

---

## Traceability (spec → tasks)

| Spec id                                             | Tasks (test location)                                              |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| AC 1.1                                              | T002 (roles.int-spec), T015 (auth-form.test), T016 (e2e)           |
| AC 1.2                                              | T013 (me.int-spec), T015, T016                                     |
| AC 1.3                                              | T014 (dashboard), T055 (`limit=1`), T057 (next-booking.test), T016 |
| AC 1.4                                              | T020 (owner-spaces.int-spec), T023 (owner-spaces.test), T025       |
| AC 1.5                                              | T014 (app-nav.test, route manifest), T016                          |
| AC 1.6                                              | T002, T016                                                         |
| AC 2.1                                              | T019, T020, T022 (space-form.test), T025                           |
| AC 2.2                                              | T019, T020, T022                                                   |
| AC 2.3                                              | T021 (owner-seats.int-spec), T024, T025                            |
| AC 2.4                                              | T020, T023, T025                                                   |
| AC 2.5                                              | T020, T023                                                         |
| AC 2.6                                              | T020, T021, T023, T025 (owner-scoping sweep)                       |
| AC 3.1                                              | T006 (slots.spec), T027, T030, T032                                |
| AC 3.2                                              | T006, T027, T030                                                   |
| AC 3.3                                              | T027, T028, T030                                                   |
| AC 3.4                                              | T004, T007 (money.spec), T027, T030                                |
| AC 3.5                                              | T007, T028, T031, T032                                             |
| AC 3.6                                              | T027, T036                                                         |
| AC 4.1                                              | T034, T039, T044                                                   |
| AC 4.2                                              | T003 (keys), T034, T039                                            |
| AC 4.3                                              | T034, T038                                                         |
| AC 4.4                                              | T035, T040, T044                                                   |
| AC 4.5                                              | T036, T037, T041, T044                                             |
| AC 4.6                                              | T005, T036, T041                                                   |
| AC 4.7                                              | T005, T036 (20 × 5), T044                                          |
| AC 4.8                                              | T005, T036, T041                                                   |
| AC 4.9                                              | T007, T036, T040, T041                                             |
| AC 4.10                                             | T037, T044                                                         |
| AC 5.1                                              | T047, T048, T049                                                   |
| AC 5.2                                              | T047, T048, T049                                                   |
| AC 5.3                                              | T047, T048                                                         |
| AC 5.4                                              | T047, T048                                                         |
| AC 6.1                                              | T004, T020, T051                                                   |
| AC 6.2                                              | T006, T051, T052, T053                                             |
| AC 6.3                                              | T051, T052, T053                                                   |
| AC 6.4                                              | T006, T035, T040, T053                                             |
| AC 6.5                                              | T051, T052                                                         |
| AC 7.1                                              | T055, T057, T059                                                   |
| AC 7.2                                              | T055, T057, T059                                                   |
| AC 7.3                                              | T056, T058, T059                                                   |
| AC 7.4                                              | T055, T056, T059                                                   |
| AC 8.1                                              | T062, T064, T065, T067                                             |
| AC 8.2                                              | T062, T064, T065                                                   |
| AC 8.3                                              | T061, T065, T067                                                   |
| AC 8.4                                              | T062, T066, T067                                                   |
| AC 8.5                                              | T062, T066, T063                                                   |
| FR-001                                              | T002, T015                                                         |
| FR-002                                              | T013, T015, T039                                                   |
| FR-003                                              | T002                                                               |
| FR-004                                              | T014 (route manifest test), every page task adds its link          |
| FR-005                                              | T014 (proxy), 401 tests in every API task                          |
| FR-006                                              | T003, T019, T020, T022                                             |
| FR-007                                              | T003, T021, T024                                                   |
| FR-008                                              | T003 (CHECK), T020, T023, T028, T034                               |
| FR-009                                              | T003, T008, T020, T021, T025, T047, T051, T056, T062               |
| FR-010                                              | T006, T027                                                         |
| FR-011                                              | T004, T007, T027                                                   |
| FR-012                                              | T007, T028, T031                                                   |
| FR-013                                              | T005 (CHECKs), T027, T036                                          |
| FR-014, FR-015                                      | T034, T039                                                         |
| FR-016                                              | T035, T040                                                         |
| FR-017                                              | T006, T035, T036                                                   |
| FR-018                                              | T005, T036, T044, T049                                             |
| FR-019                                              | T005, T036                                                         |
| FR-020                                              | T007, T036, T041                                                   |
| FR-021                                              | T037, T069                                                         |
| FR-022, FR-023                                      | T047, T048                                                         |
| FR-024                                              | T004, T051, T052                                                   |
| FR-025                                              | T051, T052                                                         |
| FR-026                                              | T055, T057                                                         |
| FR-027                                              | T056, T058                                                         |
| FR-028                                              | T055, T056                                                         |
| FR-029                                              | T062, T064, T065                                                   |
| FR-030                                              | T061, T065                                                         |
| FR-031                                              | T066                                                               |
| FR-032                                              | T010, T018, T029, T046, T061 and every frontend task               |
| FR-033                                              | T006, T035, T037, T040, T057                                       |
| SC-001                                              | T025 (recorded), T070                                              |
| SC-002                                              | T029, T044, T070                                                   |
| SC-003, SC-004                                      | T044                                                               |
| SC-005                                              | T005 (DB), T036 (API), T044 (mixed slots), T049 (vs occupancy)     |
| SC-006                                              | T037                                                               |
| SC-007                                              | T016, T025, T032, T044, T049, T053, T059, T067                     |
| Edge: night crosses midnight                        | T006, T035                                                         |
| Edge: day/night different renters; 24 h blocks both | T005, T035, T044                                                   |
| Edge: touching slots                                | T005, T006                                                         |
| Edge: DST                                           | T006, T037                                                         |
| Edge: switching to fixed hours                      | T027, T032                                                         |
| Edge: delete seat or cubicle with future bookings   | T021, T024                                                         |
| Edge: city with no spaces                           | T034, T039                                                         |
| Edge: owner books own space                         | T007, T028, T036, T041                                             |
| Edge: no seat for the whole pass                    | T038, T040                                                         |

## Dependencies & execution order

```text
Level 0:  T001
Level 1:  T002 T003 T006 T010 T011 T012 T019                 (each needs only T001)
Level 2:  T004 T007 T008 T013 T014 T018 T029
Level 3:  T005 T009 T015 T020 T046 T061
Level 4:  T016 T021 T022 T027
Level 5:  T017 T023 T028 T034 T047 T051 T062
Level 6:  T024 T030 T031 T035 T039 T052 T063 T064
Level 7:  T025 T032 T036 T038 T040 T048 T065
Level 8:  T026 T033 T037 T041 T049 T053 T055 T056 T066
Level 9:  T042 T050 T054 T057 T058 T067 T069
Level 10: T043 T044 T059 T068
Level 11: T045 T060 T070
Level 12: T071
```

- **Critical path** (13 steps): T001 → T003 → T004 → T020 → T027 → T028 → T035 → T036 → T041 → T042 → T044 → T070 → T071.
  T005 joins it at T035 through T003 → T008 → T005, so T008 and T005 must not slip.
- **Backend contract before frontend**: every frontend task depends on the backend task that runs `gen:api` for the
  hooks it uses (T014←T002, T015←T013, T022←T019/T020, T024←T021, T030←T027, T031←T028, T039←T034, T040←T035,
  T041←T036, T048←T047, T052←T051, T057←T055, T058←T056, T064/T066←T062).
- **UI spec before UI**: T014/T015 ← T010; T022–T024, T030 ← T018; T031, T039–T041, T057 ← T029; T048, T052, T058 ← T046; T064–T066 ← T061.
- **Expand/contract order**: T003 → T008 → T005; T039 + T041 → T042 → T043.
- There are no cycles (checked with a script over the summary table). Every task is S or M.

### Parallel opportunities

- After T001: **T002, T003, T006, T010, T011, T012, T019** in parallel (separate owners or files; T002 and T003 both generate migrations, so the second to merge rebases and re-runs `db:generate`).
- Designers can run **T018 and T029** in parallel after T010, then **T046 and T061**, each in its own `ui/` file.
- After T021: **T047, T051 and T062** in parallel (separate files in `owner-operations/`; each regenerates `openapi.json`, so the second to merge rebases and re-runs `gen:api`).
- After T036: **T037, T055, T056** in parallel; T037 and T055 both edit `bookings.service.ts` (different methods).
- US5, US6, US7 and US8 are independent of each other once US4's backend (T036) is in; with enough developers they run side by side.
- Docs tasks never block development.

## Implementation strategy

1. **Approve**: T001 (architect). Humans answer OQ-1 (base branch) before any branch is cut, and the other OQs before the tasks that name them.
2. **Foundation**: T002, T003, T006, T010, T011, T012, T019 in parallel; then T004, T007, T008, T013, T014; then T005, T009.
3. **Early win**: T014 ships the role-aware nav as soon as T002 lands, fixing "the dashboard is a dead end".
4. **MVP (US1–US4)**: US1 → US2 → US3 → US4. Demo find-and-book, then retire `/book` and the legacy API (T042, T043).
5. **P2**: US5, US6, US7 in any order or in parallel. **P3**: US8.
6. **Release**: T069, T070, T071; code-reviewer and security-reviewer on each PR; a human merges.

## Notes

- One task = one branch = one PR, under about 400 changed lines. Conventional Commits with an `api`, `web`, `db`, `ui` or `docs` scope. Developers add a changeset in each user-visible PR.
- **PR line budget (AQ-4, decided by the architect in T001):**
  - **Excluded** from the ~400 lines (machine-generated, reviewed by diff tooling and CI checks): `apps/api/openapi.json`, `apps/api/drizzle/meta/**` (snapshots and `_journal.json`), `pnpm-lock.yaml`, and `packages/api-client/src/generated/**` (gitignored anyway).
  - **Counted**: everything hand-written, including tests, fixtures and every migration `.sql` file (generated or custom). Migration SQL is reviewed line by line.
  - The PR description states both numbers (`git diff --stat` with and without the exclusions).
- Tests first for business logic (T005, T006, T007, T036, T047, T055, T064). The PR shows the failing-test commit.
- No new runtime dependency is planned. Any new dependency needs a justification in the PR and must be raised with the task-manager.
- Migrations: `0000`–`0002` are never edited; new migrations are generated first and `--custom` second (data-model.md).
- `docker-compose.yml` and other files have uncommitted local changes on the planning machine that are not part of this feature; tasks work from their base branch.

## Open questions (human decision needed)

See [plan.md → Open questions](./plan.md#open-questions) (OQ-1 to OQ-12) and the architect questions (AQ-1 to AQ-8).
Tasks that depend on an answer: OQ-1 all; OQ-2 T069; OQ-3 T005, T055; OQ-4 T038, T039; OQ-5 T047, T048;
OQ-6 T021, T065; OQ-7 T003, T006, T022; OQ-8 T019; OQ-9 T014, T057; OQ-11 T003, T009; OQ-12 T034, T039.
