# Test plan: 001-seat-booking, T009 and T010 (create booking API, confirmation email)

Run 2026-10-23 on `feat/001-seat-booking`. All results: pass. Files: `I` = `apps/api/test/bookings.int-spec.ts`,
`S` = `apps/api/src/bookings/bookings.service.spec.ts`, `C` = `booking-conflicts.spec.ts`,
`M` = `booking-confirmation.mail.spec.ts`, `MS` = `apps/api/src/mail/mail.service.spec.ts`.

| Criterion                                                                                                             | Test(s)                                                                                                                                                                                                                                                                                              | Level             | Result                |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------- |
| T009 201 body, local and UTC times, availability shows `taken` (AC 2.1)                                               | I "books a free seat and returns local and UTC times"; S "inserts an active booking"                                                                                                                                                                                                                 | integration, unit | pass                  |
| T009 409 seat-unavailable, no row (AC 2.3)                                                                            | I "is 409 seat-unavailable when another user holds the seat"; S "maps an exclusion violation"                                                                                                                                                                                                        | integration, unit | pass                  |
| T009 20 distinct users x 5 rounds, one 201 and nineteen 409 seat-unavailable, one active row (AC 2.4)                 | I "lets exactly one of 20 concurrent requests book a seat, 5 times over" (20 separate `signedInUser`, `Promise.all`, new seat and window per round, DB count asserted)                                                                                                                               | integration       | pass, 3 reruns stable |
| T009 409 user-overlap (AC 2.5)                                                                                        | I "is 409 user-overlap"; C                                                                                                                                                                                                                                                                           | integration, unit | pass                  |
| T009 422 per rule type, no row (AC 2.6)                                                                               | I `it.each` over all 8 `booking-rule:*` types, each asserts type, detail and zero rows                                                                                                                                                                                                               | integration       | pass                  |
| T009 touching windows                                                                                                 | I "allows a booking that touches"                                                                                                                                                                                                                                                                    | integration       | pass                  |
| T009 40P01 retry then 409; 3 attempts rethrown                                                                        | S "retries a deadlock and returns the 409", "rethrows after 3 deadlocked attempts"; C                                                                                                                                                                                                                | unit              | pass                  |
| T009 404 unknown seat, 400 validation (6 cases), 401                                                                  | I (404 and 400 now also assert no row); I 401                                                                                                                                                                                                                                                        | integration       | pass                  |
| T009 no `userId` in body (FR-011)                                                                                     | I "never returns the user id"                                                                                                                                                                                                                                                                        | integration       | pass                  |
| T009 openapi has `CreateBookingInput` and `Booking`                                                                   | `openapi.json` in commit; generated by `gen:api`                                                                                                                                                                                                                                                     | static            | pass                  |
| T010 Mailpit message, subject and body (AC 2.2)                                                                       | I "reaches Mailpit with the booking in the space local time" (unique address, polls Mailpit)                                                                                                                                                                                                         | integration       | pass                  |
| T010 send rejects or never settles, 2 s bound, `booking.confirmation_not_queued` with `bookingId`, no address or body | S "still returns the booking and logs", "within the 2 s bound when enqueueing never settles" (fake timers, never-settling promise, logger payload checked); I "still books within the 2 s bound when the queue never answers" (never-settling send, 1.9 to 4 s), "still books when enqueueing fails" | unit, integration | pass                  |
| T010 jobId dedupe                                                                                                     | I "keeps one queued job per booking"; MS "passes a caller-chosen job id"; M `confirmationJobId`                                                                                                                                                                                                      | integration, unit | pass                  |
| T010 GMT and BST local times                                                                                          | M winter and summer tests                                                                                                                                                                                                                                                                            | unit              | pass                  |

## Results

- `lint`, `typecheck` (api): clean. `test`: 20 files, 221 tests passed. `test:coverage`: passed.
- `bookings.int-spec.ts` run 3 more times: 26/26 each time.
- Changed-line coverage of the files in commit ab169ba (lcov, diff vs main): 83 of 83 executable changed lines (100%).
- Web, build and e2e not run (out of scope for this task; web is being built concurrently).

---

# Test plan: 001-seat-booking, T008 (`/book` page)

Run 2026-10-23, commit `1008bdc` plus QA tests. Level: unit/component (Vitest, Testing Library, MSW) unless noted.
`BV` = `book-view.test.tsx`, `SL` = `space-list.test.tsx`, `WF` = `booking-window-form.test.tsx`,
`SA` = `seat-availability.test.tsx`, `PA` = `problem-alert.test.tsx`, `PG` = `app/(app)/book/page.test.tsx`,
`PX` = `proxy.test.ts`, `E2E` = `apps/web/e2e/book.spec.ts` (Playwright + axe). All under `apps/web/src/...` except E2E.

| Criterion                                                                                       | Test(s)                                                                                                                                               | Level      | Result |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| Loading first, then each space name and location (AC 1.1)                                       | SL "shows a loading state, then hands the spaces to its child" (asserts "Loading office spaces…" before data); WF "shows space details on each card"  | component  | pass   |
| `items: []` shows the empty state, no form                                                      | SL "shows the empty state without a form"                                                                                                             | component  | pass   |
| 500 problem shows `role="alert"`, with Try again (FR-013)                                       | SL "shows an error alert with a working Try again button"; PA "renders a role=alert..."                                                               | component  | pass   |
| 6 seats (1 taken): 5 "Free", 1 "Taken" in text, time zone in the window line (AC 1.2)           | SA "shows six seats, five free and one taken, in text, with the space time zone"; BV "loads spaces, then seats for the chosen window"                 | component  | pass   |
| Loading state for seats, stale note, all-taken, no-seats, error with retry                      | SA (loading, stale, empty, all taken, error); BV (stale and refetch, availability error)                                                              | component  | pass   |
| end <= start: field error linked by `aria-describedby`, focus on field, no request sent         | WF "rejects an end time that is not after the start..." (onSubmit not called); BV "sends no availability request when validation fails" (MSW not hit) | component  | pass   |
| Every input has a `<Label>`                                                                     | WF "labels every field and describes the time zone" (`getByLabelText` for Date, Start, End; space cards are labelled radios)                          | component  | pass   |
| Page has metadata title, one h1, `main#main`                                                    | PG "has a metadata title, one h1, main#main..."                                                                                                       | component  | pass   |
| No cookie: `/book` and `/bookings` redirect to `/sign-in?next=...`; matcher lists both          | PX "guards the booking pages", `it.each` redirect for `/book` and `/bookings` (307, `next` param); E2E "/book" and "/bookings redirects" (real stack) | unit + e2e | pass   |
| Problem copy for every ui.md section 6 type used on this page                                   | `lib/booking-problems.test.ts` (extended with the 8 remaining types), PA (links, 401, network)                                                        | unit       | pass   |
| axe (WCAG 2.1 AA) on `/book` with spaces loaded, and again with seats shown; desktop and mobile | E2E "/book lists spaces and seats and has no WCAG 2.1 AA violations" (projects chromium and mobile)                                                   | e2e, axe   | pass   |
| lint, typecheck, test pass; changed-line coverage >= 80%                                        | see Results                                                                                                                                           | -          | pass   |

## Judgement on the ui.md deviations

- `SpaceChoice` radiogroup `aria-label="Office space"` and `tabIndex={-1}`: **withdrawn, this verdict was wrong** (see Re-verification).
  The group was kept out of the Tab order (WCAG 2.1.1) and neither axe nor the earlier tests could see it.
- Legend only in the loading state: acceptable. In empty the h2 stands alone with a message (no controls to group); in error the alert has its own
  title and is `role="alert"`. No unlabeled control exists in either state. Nit for ui.md: update section 3.2 to say so.

## Results

- `bin/pnpm --filter @bseat/web lint`: clean (`--max-warnings=0`). `typecheck`: clean. `test`: 11 files, 61 tests passed (was 9 files, 43).
- `test:coverage`: statements 83.64%, branches 88.08%, functions 77.58%, lines 83.33% (package; the web vitest config sets no thresholds).
- Changed-line coverage, files in `1008bdc` (lcov): `book-view.tsx` 14/15 (line 63, the retry callback), all other executable lines of
  the changed files covered, including `problem-alert.tsx` 3/3, `proxy.ts` 5/5, `book/page.tsx` 2/2, `booking-problems.ts` 29/29 after the added cases. Total over 98%.
- `bin/pnpm install --frozen-lockfile`: passes ("Lockfile is up to date"). `bin/pnpm --filter @bseat/web build`: succeeds, lists `/book`.
- e2e: `docker compose --profile e2e run --rm e2e` on the migrated and seeded stack: 16 passed (auth and book specs, chromium and mobile), axe clean.
- Not covered here (T011/T013/T014): keyboard-only walk-through in a real browser, perf, booking and the My bookings link.

## Re-verification after review fixes (`d44fbf9`)

Code review found a blocker that QA and axe missed: `tabIndex={-1}` on the space radio group. Fixed in `d44fbf9` (B1: `tabIndex` removed,
`aria-labelledby` on the legend). Each fix and the test that asserts it:

| Fix                                                        | Test                                                                                                                                                                               | Level     | Result |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| B1 radios in tab order, group named by legend              | WF "puts the space radios in the tab order, first in the form" (`user.tab()` lands on the radio), "names the space group once, from its legend"                                    | component | pass   |
| B1 keyboard-only journey in a real browser                 | E2E "/book can be completed with the keyboard only": Tab to radio, ArrowDown selects, Tab through Date (segments), Start, End, button, Enter shows seats; `:focus-visible` on each | e2e       | pass   |
| Invalid range focuses End time                             | E2E "/book moves focus to End time when the range is invalid" (submit with Enter from Date; error shown, End focused, `aria-invalid`, no seats); WF unit test                      | e2e       | pass   |
| M1 `fallbackTitle` only for generic outcomes               | `booking-problems.test.ts`; PA "uses the caller fallback title for generic outcomes only" (404 keeps its own title); BV "keeps the generic ... title"                              | unit      | pass   |
| Minor 1 no busy UI on background refetch                   | BV "does not show the busy state for a background refetch"                                                                                                                         | component | pass   |
| Minor 2 failed refetch keeps data                          | BV "keeps the seats when a background refetch fails"; SL "keeps the form when a later refetch fails"                                                                               | component | pass   |
| Minor 3 scroll only on user-requested fetches              | BV "scrolls to the seats once the submitted request succeeds" and the not-called case (lines 132-154)                                                                              | component | pass   |
| Minor 4 401 `next` from `usePathname`, relative paths only | PA "defaults the sign-in next path to the current page"; `booking-problems.test.ts` "only puts a relative path in the sign-in next parameter", "does not put unsafe paths..."      | unit      | pass   |
| Minor 5 404 retry invalidates spaces                       | BV "refetches the spaces when Try again follows a 404"                                                                                                                             | component | pass   |

Notes from writing the e2e: Chromium's native date input has day/month/year segments, so Tab needs several presses to leave it; the test
asserts focus stays on Date until it reaches Start time. Enter inside a native `<select>` does not submit the form, so the submit path uses Date and the button.

Results: web `lint` and `typecheck` clean; `test`: 11 files, 79 tests passed; `test:coverage`: statements 85.15%, branches 88.99%, functions 80%, lines 84.97%.
Changed-line coverage for `d44fbf9` (lcov, non-test files): 30/30 executable changed lines (100%).
e2e (`docker compose --profile e2e run --rm e2e`): 22 passed (was 16; +2 specs on chromium and mobile). Two earlier runs while writing the tests had 2-3 flaky failures
in `auth.spec.ts` (sign-up redirect timeout, axe "execution context destroyed") and one `book.spec.ts` sign-up; the final two consecutive runs were 22/22. Cause not
isolated: parallel sign-ups hitting hydration timing. Not a product defect found; worth watching in CI.
Still not covered: booking from the grid (T011), the submit-from-fresh-cache scroll gap (known, dev-reported).
