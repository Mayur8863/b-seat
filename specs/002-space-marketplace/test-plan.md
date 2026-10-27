# Test plan: 002 space marketplace

**Owner**: qa-engineer (T011) · **Status**: planned (no task has been tested yet; the Result column is `planned` until the
owning QA task or T070 records a run) · **Inputs**: spec.md, plan.md, data-model.md, research.md, contracts/, ui.md,
ui/01-shell-accounts.md, ADR-0009, ADR-0010, the 001 test plan (format).

This plan is the traceability skeleton the constitution asks for (II: every AC maps to an automated test). It adds what
tasks.md leaves open: the level of each test, the data and method for the race and performance criteria (SC-003 to
SC-005), and the full axe route list (SC-007). T070 signs off by turning every `planned` into a named passing test.

## 1. Levels and conventions

| Level | Code | Where                                                        | Tooling                                                                           |
| ----- | ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Unit  | U    | `apps/api/src/**/*.spec.ts`, `apps/web/src/**/*.test.ts(x)`  | Vitest; pure modules (`marketplace/*`, `money`, `lib/nav`, editor model) no mocks |
| DB    | DB   | `apps/api/test/*-constraints.int-spec.ts`                    | real Postgres, raw inserts that bypass the service; assert the SQLSTATE and name  |
| Int   | I    | `apps/api/test/*.int-spec.ts`                                | `createTestApp`, `resetDb`, `signedInAgent(app, user, accountType)`, Mailpit      |
| Comp  | C    | `apps/web/src/components/*.test.tsx`, `app/**/page.test.tsx` | Testing Library + MSW at the HTTP boundary (generated handlers), no hook mocks    |
| E2E   | E    | `apps/web/e2e/*.spec.ts`, projects `chromium` and `mobile`   | Playwright against the full stack                                                 |
| Axe   | A    | inside the E2E journeys                                      | `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`           |
| Rec   | R    | recorded run in this file                                    | timed manual or scripted run (SC-001, SC-002), result copied here by QA           |

Rules every task's tests follow (from AGENTS.md and the 001 lessons):

- **Negatives are part of the AC.** Every API route gets: 401 signed out; 403 for the wrong role (`/api/owner/*` as a
  renter, ADR-0010); 400 for each invalid field; 404 for another owner's or renter's id **and** a random UUID, asserted
  byte-identical apart from `instance` (FR-009, FR-028); 409/422 per problem type with the type URI, and "no row
  written" checked in the DB.
- **Public interfaces only.** API tests go through HTTP; web tests mock only HTTP (MSW). Pure modules are tested
  directly. The only other mock is the mail queue, and only where an AC is about a failing or never-settling queue.
- **Dates.** E2E and race tests pick start dates 2 to 28 days ahead and the first free seat, and use unique sign-ups
  (API sign-up helper, wait for hydration), because dev data persists (001 T014 lesson). Time-sensitive unit tests use
  fake timers or an injected clock, never the wall clock.
- **Weak spots to assert on purpose** (found by 001 review, not by axe): radio groups and tab order reachable by keyboard
  (`user.tab()` lands on the control), `aria-describedby` on every field error, focus moved to the first invalid field,
  no raw `error.message` in the UI (ui/01 section 7), status never colour alone.
- **E2E stability.** No retries as a fix. T070 requires 5 consecutive green e2e runs.
- **Seeded demo accounts** need `SEED_DEMO_PASSWORD` in the compose `e2e` service (T012 review note, first needed in T025).
- **Coverage.** At least 80% on changed lines per PR (diff-cover); pure modules aim for 100%.

## 2. Stories: level, data and owning task

| Story | Independent test (spec)                           | Data setup                                                                                             | Levels                        | Owning tasks                               |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------ |
| US1   | Sign up as owner and renter, reach every page     | API sign-up helper for pre-existing accounts; direct DB insert of a legacy user (AC 1.6)               | U, I, C, E, A                 | T002, T013, T014, T015, T016               |
| US2   | Create a space with 10 seats, publish, searchable | `fixtures.ts` owner, space, seats; two owners for the scoping sweep                                    | DB, U, I, C, E, A             | T003, T019 to T021, T022 to T025           |
| US3   | 24-hour space, 3 slots, day and monthly prices    | space with `open_24h`, shift 07:00, slots on, prices; a legacy night booking fixture for the edge case | U, DB, I, C, E, A             | T004, T006, T007, T027, T028, T030 to T032 |
| US4   | Two cities, search, book a weekly day pass        | seed (T009) plus fixtures; Mailpit with unique recipient addresses                                     | U, DB, I, C, E, A, perf, race | T005 to T007, T034 to T044                 |
| US5   | Mark occupied, renter sees taken, vacant frees    | space with 3 seats, one renter booking on one seat                                                     | DB, I, C, E, A, race          | T005, T047 to T049                         |
| US6   | Shared Mon-Fri calendar, one seat Saturday only   | space with 2 seats, shared and own calendar, one existing booking                                      | U, DB, I, C, E, A             | T004, T006, T051 to T053                   |
| US7   | Two renters, one owner, cancel frees the seat     | 3 bookings at one space                                                                                | I, C, E, A                    | T055 to T059                               |
| US8   | 6 seats, 2 cubicles, "Meeting room", renter books | space with 6 seats; pointer run and a separate keyboard-only run                                       | U (reducer), I, C, E, A       | T061 to T067                               |

## 3. Traceability: acceptance criteria

`Test location` names the file or test group the owning task creates. Where a task did not fix a file name, the plan
proposes one (marked "proposed"). Every Result is `planned`.

| ID      | Test (level)                                                                                                                                                                                                              | Owning task(s)         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC 1.1  | `roles.int-spec` 400 without role (I); `auth-form.test` required radio group, no request sent (C); `accounts-nav.spec` (E)                                                                                                | T002, T015, T016       |
| AC 1.2  | `me.int-spec` PUT then GET `preferences` (I); sign-up step 2 saves and lands on `/dashboard` (C); journey (E)                                                                                                             | T013, T015, T016       |
| AC 1.3  | `dashboard` renter links and neutral card (C); `next-booking.test` (C); `my-bookings.int-spec` `limit=1` (I); journey (E)                                                                                                 | T014, T055, T057, T016 |
| AC 1.4  | `owner-spaces.int-spec` list scoped (I); `owner-spaces.test` empty and filled (C); `owner-listing.spec` (E)                                                                                                               | T020, T023, T025       |
| AC 1.5  | `app-nav.test` per role, `aria-current` (C); `nav.test` route manifest (U); keyboard-only nav walk (E)                                                                                                                    | T014, T016             |
| AC 1.6  | `roles.int-spec` row inserted without the field reads as renter (I); sign-in as a DB-inserted account shows renter nav (E)                                                                                                | T002, T016             |
| AC 2.1  | `owner-spaces.int-spec` required fields, one 400 per field, 24 h vs fixed hours (I); `space-form.test` (C); `reference` unit                                                                                              | T019, T020, T022, T025 |
| AC 2.2  | `owner-spaces.int-spec` utilities list, 5 custom max, 40 chars (I); `space-form.test` (C)                                                                                                                                 | T019, T020, T022       |
| AC 2.3  | `owner-seats.int-spec` label unique, bulk pattern, 200 cap with concurrent bulk adds (I, DB); `seat-manager.test`, `bulk-seat-form.test` (C); journey (E)                                                                 | T003, T021, T024, T025 |
| AC 2.4  | `owner-spaces.int-spec` publish refused names what is missing, `PublishIncompleteProblem` (I); `owner-listing.spec` (E)                                                                                                   | T020, T023, T025       |
| AC 2.5  | `owner-spaces.int-spec` unpublish removes from search, bookings stay valid (I); overview component (C)                                                                                                                    | T020, T023             |
| AC 2.6  | `owner-scoping.int-spec` sweep of every `/api/owner/*` route: other owner and random UUID give identical 404, renter gets 403 (I)                                                                                         | T020, T021, T025       |
| AC 3.1  | `slots.spec` (U); `owner-pricing.int-spec` (I); `pricing-form.test` (C); `pricing.spec` (E)                                                                                                                               | T006, T027, T030, T032 |
| AC 3.2  | `slots.spec` fixed hours gives one slot (U); `owner-pricing.int-spec` (I); `pricing-form.test` (C)                                                                                                                        | T006, T027, T030       |
| AC 3.3  | `owner-pricing.int-spec` empty price = not offered (I); `listings-detail.int-spec` offers (I); `pricing-form.test` (C)                                                                                                    | T027, T028, T030       |
| AC 3.4  | `pricing-calendar-constraints` price > 0 and scale (DB); `money.spec` (U); `owner-pricing.int-spec` 400 cases (I)                                                                                                         | T004, T007, T027       |
| AC 3.5  | `money.spec` saving amount and percent, only when 24 h < day + night (U); `listings-detail.int-spec` (I); `pass-options.test` (C); `pricing.spec` (E)                                                                     | T007, T028, T031, T032 |
| AC 3.6  | `owner-pricing.int-spec` and `pass-bookings.int-spec`: change price after booking, booking keeps price (I)                                                                                                                | T027, T036             |
| AC 4.1  | `listings-search.int-spec` prefill-equivalent query, card fields, lowest price per pass (I); `listing-results.test`, `find` prefill (C); `search-book.spec` (E)                                                           | T034, T039, T044       |
| AC 4.2  | `listings-search.int-spec` suggestions from published only, case and space insensitive (I); key columns (DB); `location-combobox.test` (C)                                                                                | T003, T034, T039       |
| AC 4.3  | `listings-search-availability.int-spec` date, pass, slot, utilities (all-of) (I)                                                                                                                                          | T034, T038             |
| AC 4.4  | `listings-seats.int-spec` free/taken, end instant, price (I); `listing-seat-list.test` text and icon (C); `search-book.spec` (E)                                                                                          | T035, T040, T044       |
| AC 4.5  | `pass-bookings.int-spec` 201 body, holds written, email in Mailpit (I); `book-pass.test` confirmation and offline-payment note (C); journey (E)                                                                           | T036, T037, T041, T044 |
| AC 4.6  | `seat-hold-constraints` 23P01 (DB); `pass-bookings.int-spec` 409 `seat-unavailable`, no rows (I); `book-pass.test` conflict copy (C)                                                                                      | T005, T036, T041       |
| AC 4.7  | `seat-hold-constraints` (DB); `pass-bookings.int-spec` 20 users x 5 rounds (I); `booking-races.int-spec` (I); method in section 5                                                                                         | T005, T036, T044       |
| AC 4.8  | `seat-hold-constraints` `seat_hold_user_no_overlap` across spaces (DB); `pass-bookings.int-spec` 409 `user-overlap` (I); `book-pass.test` (C)                                                                             | T005, T036, T041       |
| AC 4.9  | `booking-rules.spec` every rule and its order (U); `pass-bookings.int-spec` one 422 per `booking-rule:*` type (I); `book-pass.test`, `listing-seat-list.test` (C)                                                         | T007, T036, T040, T041 |
| AC 4.10 | `booking-emails.spec` (U); `pass-bookings.int-spec` owner email in Mailpit (I); `search-book.spec` (E)                                                                                                                    | T037, T044             |
| AC 5.1  | `occupancy.int-spec` create with and without end date, note stored (I); `mark-occupied-dialog.test` (C); `occupancy.spec` renter sees taken (E)                                                                           | T047, T048, T049       |
| AC 5.2  | `occupancy.int-spec` vacant ends the mark today, bookable from the next slot not started (I); `seat-state.test` (C); `occupancy.spec` (E)                                                                                 | T047, T048, T049       |
| AC 5.3  | `occupancy.int-spec` 409 `OccupancyConflictProblem` with `bookedDates` (I); `mark-occupied-dialog.test` conflict list (C)                                                                                                 | T047, T048             |
| AC 5.4  | `occupancy.int-spec` `OwnerSeat.today` is vacant, occupied or booked, note present for owner (I); note never in any renter response, asserted on `listings-seats` and `listings-detail` bodies (I); `seat-state.test` (C) | T047, T048             |
| AC 6.1  | `pricing-calendar-constraints` one shared per space, backfill (DB); `owner-spaces.int-spec` default shared calendar (I)                                                                                                   | T004, T020, T051       |
| AC 6.2  | `calendar-rules.spec` (U); `calendars.int-spec` (I); `calendar-form.test` (C); `calendar.spec` (E)                                                                                                                        | T006, T051, T052, T053 |
| AC 6.3  | `calendars.int-spec` own calendar PUT and DELETE, one per seat (I); `calendar-form.test` (C); `calendar.spec` (E)                                                                                                         | T051, T052, T053       |
| AC 6.4  | `pass-period.spec` skipped days (U); `listings-seats.int-spec` `closedDates`, start must be open (I); `listing-seat-list.test` "closed" (C); `calendar.spec` same price (E)                                               | T006, T035, T040, T053 |
| AC 6.5  | `calendars.int-spec` change keeps bookings and returns the outside count (I); `calendar-form.test` notice (C)                                                                                                             | T051, T052             |
| AC 7.1  | `my-bookings.int-spec` own only, not ended, soonest first, local time and zone (I); `my-bookings.test` (C); `bookings-lists.spec` (E)                                                                                     | T055, T057, T059       |
| AC 7.2  | `my-bookings.int-spec` cancel frees all holds (DB cascade, I), started booking refused 422 (I); `my-bookings.test` confirm and error (C); `bookings-lists.spec` (E)                                                       | T055, T057, T059       |
| AC 7.3  | `owner-bookings.int-spec` name, email, filter by date, paging (I); `owner-bookings.test` (C); `bookings-lists.spec` (E)                                                                                                   | T056, T058, T059       |
| AC 7.4  | `my-bookings.int-spec` and `owner-bookings.int-spec` other user's booking and random UUID give identical 404 (I); `owner-scoping` sweep                                                                                   | T055, T056, T059       |
| AC 8.1  | `layout.int-spec` GET and PUT, version conflict (I); `model.test` reducer add, move, resize, rename, delete (U); `layout-editor.test` (C); `layout.spec` pointer run (E)                                                  | T062, T064, T065, T067 |
| AC 8.2  | `layout.int-spec` seats are the list's seats, unplaced tray, soft removal drops the element (I); `unplaced-tray.test` (C)                                                                                                 | T062, T064, T065       |
| AC 8.3  | `model.test` keyboard actions (U); `layout-editor.test`, `layout-item-form.test` (C); `layout.spec` keyboard-only run (E)                                                                                                 | T061, T065, T067       |
| AC 8.4  | `layout.int-spec` renter layout GET (I); `listing-plan.test` text and icon, list toggle (C); `layout.spec` renter books from the plan (E)                                                                                 | T062, T066, T067       |
| AC 8.5  | `layout.int-spec` `hasLayout: false`, 404 on layout GET (I); `listing-plan.test` list only (C)                                                                                                                            | T062, T066, T063       |

## 4. Traceability: functional requirements, success criteria, edge cases

| ID                                                | Test (level)                                                                                                                                                                                           | Owning task(s)                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| FR-001                                            | `roles.int-spec` (I); `auth-form.test` (C); update-user rejects `accountType` even as a no-op (I)                                                                                                      | T002, T015                                           |
| FR-002                                            | `me.int-spec` (I); `preferences-form.test` success state (C); find prefill (C)                                                                                                                         | T013, T015, T039                                     |
| FR-003                                            | DB default `renter` on a row without the column, then `GET /api/me` (I)                                                                                                                                | T002                                                 |
| FR-004                                            | `nav.test` route manifest fails when a page under `(app)` is not in its role's nav or "reached from" (U); keyboard nav walk (E)                                                                        | T014, every page task                                |
| FR-005                                            | `proxy.test` matcher and redirect with `next` for each `(app)` route (U); 401 in every API task (I); e2e sweep of signed-out visits (E, section 7 gap)                                                 | T014, every API task, T016                           |
| FR-006                                            | `listing-constraints.int-spec` CHECKs (DB); `owner-spaces.int-spec` (I); `space-form.test` (C)                                                                                                         | T003, T019, T020, T022                               |
| FR-007                                            | `listing-constraints` unique active label (DB); `owner-seats.int-spec` 200 cap, remove with future bookings refused (I); `seat-manager.test` (C)                                                       | T003, T021, T024                                     |
| FR-008                                            | `space_owned_complete` and publish CHECKs (DB); `owner-spaces.int-spec` publish refusal (I); search and detail exclude drafts (I)                                                                      | T003, T020, T023, T028, T034                         |
| FR-009                                            | `owner-scoping.int-spec` sweep (I) plus the per-route cases in each owner API task; legacy `GET /api/spaces` returns published only (I)                                                                | T003, T008, T020, T021, T025, T047, T051, T056, T062 |
| FR-010                                            | `slots.spec` (U); `owner-pricing.int-spec` (I)                                                                                                                                                         | T006, T027                                           |
| FR-011                                            | `pricing-calendar-constraints` (DB); `money.spec` (U); `owner-pricing.int-spec` (I)                                                                                                                    | T004, T007, T027                                     |
| FR-012                                            | `money.spec` (U); `listings-detail.int-spec` (I); `pass-options.test` (C)                                                                                                                              | T007, T028, T031                                     |
| FR-013                                            | `seat-hold-constraints` price CHECKs (DB); `owner-pricing.int-spec` and `pass-bookings.int-spec` (I)                                                                                                   | T005, T027, T036                                     |
| FR-014, FR-015                                    | `listings-search.int-spec` (I); `listing-results.test`, `listing-search-form.test` (C)                                                                                                                 | T034, T039                                           |
| FR-016                                            | `listings-seats.int-spec` (I); `pass-picker.test`, `listing-seat-list.test` (C)                                                                                                                        | T035, T040                                           |
| FR-017                                            | `pass-period.spec` (U); `listings-seats.int-spec`, `pass-bookings.int-spec` hold rows equal the occurrence list (I)                                                                                    | T006, T035, T036                                     |
| FR-018                                            | `seat-hold-constraints` (DB); `pass-bookings.int-spec` 20 x 5 (I); `booking-races.int-spec` (I); `occupancy-races.int-spec` (I)                                                                        | T005, T036, T044, T049                               |
| FR-019                                            | `seat-hold-constraints` (DB); `pass-bookings.int-spec` same user, two seats, overlapping periods (I)                                                                                                   | T005, T036                                           |
| FR-020                                            | `booking-rules.spec` (U); `pass-bookings.int-spec`: slot started, over 30 days, unpublished (422 `space-not-published`), draft (404), own space (I); `book-pass.test` (C)                              | T007, T036, T041                                     |
| FR-021                                            | `booking-emails.spec` (U); `pass-bookings.int-spec` queue rejecting or never settling still books within the 2 s bound (I); producer fail-fast (U)                                                     | T037, T069                                           |
| FR-022, FR-023                                    | `occupancy.int-spec` (I); `mark-occupied-dialog.test` (C); note length 200 (I)                                                                                                                         | T047, T048                                           |
| FR-024                                            | `pricing-calendar-constraints` (DB); `calendars.int-spec` (I); `calendar-form.test` (C)                                                                                                                | T004, T051, T052                                     |
| FR-025                                            | `calendars.int-spec` outside-count, no hold or booking touched (I); `calendar-form.test` (C)                                                                                                           | T051, T052                                           |
| FR-026                                            | `my-bookings.int-spec` (I); `my-bookings.test` (C)                                                                                                                                                     | T055, T057                                           |
| FR-027                                            | `owner-bookings.int-spec` (I); `owner-bookings.test` (C)                                                                                                                                               | T056, T058                                           |
| FR-028                                            | `my-bookings.int-spec`, `owner-bookings.int-spec`, `owner-scoping` sweep (I)                                                                                                                           | T055, T056, T025                                     |
| FR-029                                            | `layout.int-spec` (I); `model.test` (U); `layout-editor.test` (C)                                                                                                                                      | T062, T064, T065                                     |
| FR-030                                            | `model.test`, `layout-editor.test`, `layout-item-form.test` (U, C); keyboard-only run (E)                                                                                                              | T061, T065, T067                                     |
| FR-031                                            | `listing-plan.test` (C); `layout.spec` renter books from the plan (E)                                                                                                                                  | T066, T067                                           |
| FR-032                                            | each frontend task's component tests assert loading, empty, error, success (C); axe on the routes in section 6 (A)                                                                                     | T010, T018, T029, T046, T061, every UI task          |
| FR-033                                            | `slots.spec` and `zoned-time` (U); `listings-seats.int-spec`, `my-bookings.int-spec` bodies carry local time and zone (I); `booking-emails.spec` (U); `my-bookings.test`, `listing-seat-list.test` (C) | T006, T035, T037, T040, T057                         |
| SC-001                                            | owner journey to publish, timed (R, section 5.4); `owner-listing.spec` records its own time                                                                                                            | T025, T070                                           |
| SC-002                                            | renter keyboard-only dashboard to booking, timed (R, E)                                                                                                                                                | T044, T070                                           |
| SC-003, SC-004                                    | `marketplace-perf.int-spec`, method in section 5.1 to 5.3                                                                                                                                              | T044                                                 |
| SC-005                                            | DB level (T005), API level 20 x 5 (T036), mixed slots (T044), booking vs mark (T049); method in section 5.5                                                                                            | T005, T036, T044, T049                               |
| SC-006                                            | `pass-bookings.int-spec` polls Mailpit, asserts both messages within 60 s of the 201 (I); `search-book.spec` (E)                                                                                       | T037                                                 |
| SC-007                                            | axe on every route in section 6                                                                                                                                                                        | T016, T025, T032, T044, T049, T053, T059, T067       |
| Edge: night crosses midnight                      | `slots.spec` end on the next date, last night of a weekly pass ends the morning after day 7 (U); `listings-seats.int-spec` `lastEndsAt` (I)                                                            | T006, T035                                           |
| Edge: day and night differ; 24 h blocks both      | `seat-hold-constraints` (DB); `listings-seats.int-spec` (I); `booking-races.int-spec` mixed slots (I)                                                                                                  | T005, T035, T044                                     |
| Edge: touching slots                              | `seat-hold-constraints` touching ranges allowed (DB); `slots.spec` adjacent slots touch (U)                                                                                                            | T005, T006                                           |
| Edge: DST (11 or 13 h day)                        | `slots.spec` spring and autumn in `Europe/London` and a 2-hour shift zone (U); `booking-emails.spec` (U); `seat_hold_booking_max_length` (DB)                                                          | T005, T006, T037                                     |
| Edge: switch to fixed hours                       | `owner-pricing.int-spec` existing night booking unchanged, new bookings use the working slot (I); `pricing.spec` (E)                                                                                   | T027, T032                                           |
| Edge: delete seat or cubicle with future bookings | `owner-seats.int-spec` 409, whole cubicle delete refused if any seat has one (I); `seat-manager.test` (C)                                                                                              | T021, T024                                           |
| Edge: city with no spaces                         | `listings-search.int-spec` empty page (I); `listing-results.test` empty state suggests the country (C); `search-book.spec` (E)                                                                         | T034, T039, T044                                     |
| Edge: owner books own space                       | `booking-rules.spec` (U); `listings-detail.int-spec` `isOwnSpace` (I); `pass-bookings.int-spec` 422 (I); `book-pass.test` (C)                                                                          | T007, T028, T036, T041                               |
| Edge: no seat free for the whole pass             | `listings-search-availability.int-spec` space left out (I); `listing-seat-list.test` "no seat is free for the whole period" (C)                                                                        | T038, T040                                           |

## 5. Race, performance and timing methods

### 5.1 Data volume (SC-003 and SC-004)

Built by `marketplace-perf.int-spec.ts` in `beforeAll` with bulk SQL (`INSERT … SELECT generate_series`), not through the
API, then `ANALYZE` on every touched table so the planner sees realistic statistics. The volume is created once per run
and removed in `afterAll`. The spec file is excluded from the default `test` run and runs under a dedicated script, so
`bin/pnpm test` stays fast (T044 adds the script).

| Entity                | Volume                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published spaces      | **1,000** across 10 countries, 50 cities (5 per country) and 4 areas per city, so a city holds about 20 spaces and an area about 5                                                                                                                                             |
| Owners                | 100 (10 spaces each)                                                                                                                                                                                                                                                           |
| Slots and prices      | Every space offers day, night and 24 h (60%) or "Working hours" (40%), with day, week and month prices on each enabled slot                                                                                                                                                    |
| Utilities             | 3 to 6 of the 11 standard utilities per space, so the all-of filter has selective and unselective cases                                                                                                                                                                        |
| Seats                 | 20 per space (20,000 seats), plus the **target space** below                                                                                                                                                                                                                   |
| Background holds      | At least **100,000** `seat_hold` rows across the 1,000 spaces (daily and monthly passes over today minus 30 days to today plus 60 days)                                                                                                                                        |
| Target space (SC-004) | One published space with **200 seats**, an own calendar on 20 of them, and **a month of holds**: every seat has bookings and occupancy marks covering about 60% of the next 30 days, in all slots, so the monthly-pass envelope overlaps at least 30 holds per seat on average |

### 5.2 Method (p95)

- **Client**: HTTP through the Nest test app (`supertest` against a listening server), signed in as one renter, sequential
  requests so the number is latency and not queueing. One extra informational pass with 5 concurrent clients is recorded
  but does not gate.
- **Warm-up**: 5 requests per query class, discarded (connection pool, plan cache).
- **Repetitions**: **50 measured requests per class**. Timing with `performance.now()` around the full request including
  JSON parse. Search classes rotate through 50 distinct filter combinations so the cache cannot make them identical.
- **p95**: nearest rank on the 50 sorted durations, index `ceil(0.95 x 50) = 48` (the 48th smallest). Record p50, p95 and max.
- **Gate**: p95 < 1000 ms for each class, in **3 consecutive runs** on the same container stack (the first run on a cold
  database is allowed to be recorded and discarded). A class fails if any of the 3 runs fails. Nothing else may be
  running (no parallel Vitest workers on this file, no e2e).
- **Search classes** (SC-003): (a) country only, (b) country + city, (c) country + city + area, (d) with 2 utilities,
  (e) with pass and slot, (f) with a start date (T038 availability evaluation). Each class p95 < 1000 ms; they are not averaged.
  Result pages are the default 20 items with a cursor.
- **Availability class** (SC-004): `GET /api/listings/{spaceId}/seats` for the target space, monthly pass, each of the 3 slots,
  50 requests with start dates spread over the next 28 days.

### 5.3 `EXPLAIN` evidence

For the seat-availability hold query on the target space (the exact SQL the service runs, taken from the service by
exporting the query builder, never retyped), run
`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` once after the data is loaded and record the full plan in this file under Results.
The test also asserts on the plan text:

- it contains an index or bitmap scan on `seat_hold_seat_no_overlap` (the GiST index), and
- it does not contain `Seq Scan on seat_hold`, and
- `Rows Removed by Filter` on `seat_hold` is below 1,000 (ADR-0009 section 7: the `seat_id = ANY($ids)` form filtered 133,600 rows, so this threshold separates the two forms), and
- execution time is under 100 ms (the T001 spike measured about 20 ms; this is headroom, not a gate for SC-004).

Also record `EXPLAIN` for the search prefilter (country, city, area keys, `published`) and assert it uses `space_search_idx` (T003), not a sequential scan of `space`. The plan text goes in the T044 PR description as well (its AC).

### 5.4 Timed journeys (SC-001, SC-002)

- **SC-001**: a scripted Playwright run (not a retry-tolerant test): sign up as owner, create a space, add 20 seats by
  pattern (A-1 to A-20), set the shift time, enable slots and prices, publish. Time from the sign-up click to the "Published"
  status. Target under 10 minutes; a scripted run takes seconds, so the recorded number is also the **count of steps and
  fields** and a hand run by a person who has not seen the UI is noted if one is available. T025 records the first
  number, T070 the final one.
- **SC-002**: keyboard only (no `fill` on an address bar, no `goto` after sign-in) from `/dashboard` through Find a space,
  search, open a space, pick pass, slot, date, seat, book, and the confirmation. Assert the URL is reached by clicks and
  keys, and that the elapsed time is under 60 s. T044 runs it, T070 records it.

### 5.5 Race method (SC-005 and AC 4.7)

- **Actors**: 20 distinct signed-in renters (separate sessions, never one user: one user would trip `user-overlap`
  instead of `seat-unavailable`). Requests start together with `Promise.all` after all sessions exist.
- **Rounds**: **5 rounds**, each on a fresh seat and a fresh pass window (so a previous round cannot hide a bug).
- **Assert per round**: exactly one `201` and nineteen `409 seat-unavailable`, no `5xx`, no other status; DB count of active holds
  for the seat and window equals the occurrence count of one booking; DB count of active booking headers is 1.
- **Levels**: T005 runs the same insert race on `seat_hold` directly (23P01 count), T036 through the API, T044 mixed slots,
  T049 booking vs occupancy.
- **Mixed slots (T044)**: on one seat and date, 10 requests each for the 24-hour, day and night slots (30 users), 5 rounds.
  Valid outcomes are exactly: one 24 h `201` and no other `201`, **or** one day `201` and one night `201` and no 24 h `201`.
  Everything else is `409 seat-unavailable`. Assert from the DB, not only from statuses.
- **Booking vs mark (T049)**: 10 booking requests and 10 occupancy-mark requests on the same seat and overlapping dates,
  5 rounds, exactly one winner overall, the loser's problem body is `seat-unavailable` or `OccupancyConflictProblem`,
  never a 500. Marks lock seats before inserting (ADR-0009 section 9), so also assert no `40P01` escapes as a 500.
- **Repetition for flakiness**: T070 reruns every race spec 3 more times. A single flaky round is a failure, not a retry.

## 6. Axe coverage (SC-007)

Every route in plan.md's web tree, every state ui/01 section 8 and the task ACs name, desktop (chromium) and mobile
projects. The run uses WCAG 2.1 AA tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) and fails on any violation. Each
state is reached by real interaction or a seeded fixture, never by calling the component directly. Each page also asserts
one `h1`, `main#main` and a skip link as plain assertions, because axe did not catch the radio group tab-order defect
in 001.

| Route (plan.md web tree)               | Role   | States run through axe                                                                                                                                       | Task             |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `/sign-up`                             | none   | step 1 with the role error; step 2 preferences; "Check your email" (ui/01 section 8)                                                                         | T016             |
| `/sign-in`                             | none   | default and with a field error (existing page, changed by the signed-in redirect in T015)                                                                    | T016             |
| `/dashboard`                           | renter | loading, error (failed `GET /api/me`), empty (neutral card until T057), preferences form open, preferences saved, mobile menu open                           | T016             |
| `/dashboard`                           | owner  | loading, error, empty (no spaces), with spaces                                                                                                               | T016, T025       |
| `/dashboard` renter, with summary      | renter | next booking summary and the empty "no upcoming bookings" state, which is asserted only once T057 lands                                                      | T059             |
| `/find`                                | renter | results, empty (no spaces in the city), error, loading                                                                                                       | T044             |
| `/spaces/[spaceId]` (listing page)     | renter | details and passes (T032); seats loaded; no seat free for the whole period; conflict error (409); confirmation after booking; plan view and list view (T067) | T032, T044, T067 |
| `/bookings`                            | renter | items, empty, cancel confirmation open, error                                                                                                                | T059             |
| `/owner/spaces/new`                    | owner  | empty form, with field errors                                                                                                                                | T025             |
| `/owner/spaces/[spaceId]` (overview)   | owner  | draft with the "missing" publish message, published                                                                                                          | T025             |
| `/owner/spaces/[spaceId]/seats`        | owner  | seat list, bulk form with errors, seat states, **mark occupied dialog with a conflict error**                                                                | T025, T049       |
| `/owner/spaces/[spaceId]/pricing`      | owner  | default, with errors, 24-hour saving visible                                                                                                                 | T032             |
| `/owner/spaces/[spaceId]/availability` | owner  | shared calendar, a seat on its own calendar, the "N bookings fall outside" notice                                                                            | T053             |
| `/owner/spaces/[spaceId]/bookings`     | owner  | items, empty, date filter applied                                                                                                                            | T059             |
| `/owner/spaces/[spaceId]/layout`       | owner  | **editing state: an item selected, the item form open, and a keyboard-moved item**; empty canvas with the unplaced tray; save error / version conflict       | T067             |
| `/book` (redirect)                     | renter | no axe of its own; e2e asserts the permanent redirect to `/find` (T042), and axe runs on `/find`                                                             | T044             |

Viewports for the screenshot review that ui/01 requests: 375, 768, 1280 px (not an axe gate). Contrast pairs come from
tokens.md only; axe `color-contrast` stays on (never disabled), and any `exclude` or `disableRules` in a spec is a
review finding.

## 7. Cases the task ACs do not spell out (planned here)

These add tests under tasks QA already owns. They are not new tasks.

1. **Stale cookie must not redirect** (ui/01 section 4, T015): e2e in `accounts-nav.spec.ts` (T016). Sign in, then invalidate
   the session server side (delete the session row through the test helper, or sign out in a second context so the
   cookie survives in the first), then visit `/sign-up` and `/sign-in`. Expected: the page renders and **no redirect loop**,
   and the shell shows its 401 sign-in state when opened. Positive pair: a valid session visiting `/sign-up` lands on
   `/dashboard`, and `/sign-in?next=/find` lands on `/find`, while `/sign-in?next=//example.com` lands on `/dashboard`
   (reuses the open-redirect cases in `sign-in-redirect.spec.ts`).
2. **Signed-out sweep** (FR-005): one e2e table over every route in section 6 asserting a redirect to `/sign-in?next=<route>`
   with no cookie, plus the matching `401` for each API route (done per API task).
3. **T016 and neutral dashboard card**: T016 must not assert "You have no upcoming bookings" until T057 lands. It asserts the
   neutral card (T014) and the "Find a space" link. T059 owns the final empty-state text.
4. **Wrong role in the browser**: a renter opening `/owner/spaces/new` shows the courtesy gate or the 403 copy "You don't have access to this.", not a blank page (ui/01
   sections 3 and 7); an owner opening `/owner/spaces/<other owner's id>` shows the not-found state.
5. **Hourly retirement** (T008, T042, T043): `POST /api/bookings` returns 404 (route removed); legacy `GET /api/spaces` returns
   published only (T008), then 404 after T043; `/book` redirects to `/find`; the OpenAPI document no longer lists the removed
   operations (`openapi.json` diff check).
6. **Migrations** (T005): the backfill test creates not-yet-ended hourly rows before migrating, then asserts the holds exist
   and `booking_no_new_hourly` rejects a new hourly insert.

## 8. Commands and gates (per QA task and T070)

| Check                        | Command                                                                | Gate                                                   |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Dependencies                 | `docker compose up -d postgres redis mailpit`                          | healthy                                                |
| Lint, typecheck              | `bin/pnpm lint` and `bin/pnpm typecheck`                               | clean, `--max-warnings=0`                              |
| Unit, component, integration | `bin/pnpm test`                                                        | all pass                                               |
| Coverage                     | `bin/pnpm test:coverage`                                               | package floors; changed lines at least 80%             |
| Build                        | `bin/pnpm build`                                                       | succeeds, lists every route in section 6               |
| Contract current             | `bin/pnpm gen:api` then `git diff --exit-code apps/api/openapi.json`   | no diff                                                |
| E2E and axe                  | `docker compose --profile e2e run --rm e2e` (full stack up and seeded) | all pass; T070 requires 5 consecutive runs, no retries |
| Performance                  | the perf script added by T044                                          | section 5.2 gate, 3 consecutive runs                   |
| Security                     | `bin/security`, `bin/gitleaks dir .`                                   | no finding                                             |

## 9. Results

None yet. Each QA task appends a dated section here in the 001 format (criterion, test, level, result), and T070 completes
the tables in sections 3 and 4 and records the section 5 numbers (p50, p95, max per class, the `EXPLAIN` plans, the race
round counts, and the SC-001 and SC-002 times).

## 10. Open questions (gaps found while mapping; no task invented)

1. **T016 does not list the stale-cookie and signed-in redirect e2e cases** that T015's last AC adds, nor the full ui/01 section 8
   axe states (step 2, "Check your email", loading, empty and error dashboards, mobile menu open). Section 6 and 7.1 plan them
   under T016. Task-manager: please add these lines to T016's acceptance criteria so the task and the plan agree.
2. **No task owns an e2e sweep of signed-out access (FR-005) across all routes.** The traceability row names T014 (proxy unit test)
   and API 401 tests. Planned in T016 as section 7.2; confirm it belongs there, or assign it to T070.
3. **`/sign-in` has no axe owner in tasks.md.** It is not in the feature's web tree but T015 changes it. Planned in T016 (section 6).
4. **SC-003 and SC-004 need a perf script outside the default `bin/pnpm test`** (1,000 spaces and 100,000 holds make the normal run
   slow and the shared test DB noisy). T044 lists `marketplace-perf.int-spec.ts` but no script or CI job for it. Does CI run it (devops),
   or is it a manual QA gate recorded in the PR? The plan assumes a dedicated script run by QA, and 3 recorded runs in T070.
5. **SC-001 "under 10 minutes without help"** is a human measure; an automated run proves only that the flow works and how many steps it
   takes. Confirm that a scripted time plus step count, with an optional human run, is accepted evidence (T025, T070).
6. **SC-006 "within 1 minute"** has one owning task (T037, an integration test that polls Mailpit) and no e2e timing. Accepted as sufficient
   unless the architect wants queue latency measured under load.
7. **AC 5.3, AC 5.4, AC 6.1 and AC 6.5 have API and component tests but no e2e step** in the QA tasks. Planned as covered at
   those levels; say if a journey step should be added to T049 or T053.
8. **T070 refers to "the traceability table below" in tasks.md** (the spec to task table, without tests). This file is where the test
   names live; T070 should sign off here, with the tasks.md table kept as the owner map.
