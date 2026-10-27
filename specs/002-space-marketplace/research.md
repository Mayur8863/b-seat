# Research: Space marketplace (Phase 0)

Every decision uses the format Decision / Rationale / Alternatives considered. Items marked **(ADR)** were decided
by the architect in T001 (2026-10-27) and recorded in
[ADR-0009](../../docs/adr/0009-pass-bookings-seat-holds-and-slots.md) (time, storage, conflicts, hourly retirement,
problem extensions) or [ADR-0010](../../docs/adr/0010-account-roles-and-owner-authorization.md) (roles and
authorization). Where a decision changed the original proposal, the item says so. Product gaps are not decided here; they are the open questions in [plan.md](./plan.md#open-questions).

Baseline: everything in [ADR-0008](../../docs/adr/0008-booking-time-and-conflict-model.md) and
[001 research](../001-seat-booking/research.md) still applies unless an item below says otherwise.

## R-1. Storing the role with Better Auth (ADR)

**Decided by the architect (T001, [ADR-0010](../../docs/adr/0010-account-roles-and-owner-authorization.md)).** The
plan's proposal (a field named `role`, a hook that "rejects") is amended below. The behaviour was verified
against the installed `better-auth@1.7.12` source and the official docs. context7 was not available to the
architect session, so the source was the reference.

**Decision**: Add the role to Better Auth's `user` model as an additional field named **`accountType`**, and to
`src/db/schema/auth.ts` as `account_type text NOT NULL DEFAULT 'renter'` with
`CHECK (account_type IN ('owner','renter'))` (`user_account_type_valid`). "Role" stays the product word (and the
guard is still `RolesGuard` / `@RequireRole`). The field is not called `role` because Better Auth's `admin` plugin
defines `user.role` (`input: false`, default `"user"`) and would override ours if it were ever added.

- Better Auth config: `user.additionalFields.accountType = { type: ['owner','renter'], required: true, input: true,
validator: { input: z.enum(['owner','renter']) } }`, with **no `defaultValue`**. A JS default would satisfy
  `required` and skip the choice.
  - A sign-up without the field fails with 400 `MISSING_FIELD`.
  - A value outside the enum fails with 400 `VALIDATION_ERROR`.
  - Sign-up runs in a transaction, so in both cases no row is written. These are Better Auth `{ code, message }`
    bodies, not RFC 9457 problems.
- **Immutable** (FR-001): `input: true` also makes the field writable through `POST /api/auth/update-user`.
  `databaseHooks.user.update.before` **throws** `new APIError('BAD_REQUEST', …)` (from `better-auth/api`) when the
  update data contains `accountType`. It must not `return false`. In 1.7.12 that aborts only the DB write:
  update-user still replies `{ status: true }` and builds the session user from the requested value. An
  integration test proves the 400 and the unchanged stored value.
- **Existing accounts** (FR-003): `ADD COLUMN … NOT NULL DEFAULT 'renter'` only changes metadata in PostgreSQL
  11 and later, so every existing row reads `renter` with no rewrite and only a brief `ACCESS EXCLUSIVE` lock.
- The field is part of `session.user` (additional fields are returned by default), so `AuthGuard` and
  `RolesGuard` read it with no extra query. `GET /api/me` adds `accountType`.
- Web typing: `createAuthClient({ plugins: [inferAdditionalFields({ user: { accountType: { type: ['owner','renter'],
required: true } } })] })` from `better-auth/client/plugins` (part of `better-auth`, no new dependency).
- Tests: `test/helpers.ts` `signedInAgent(app, user, accountType = 'renter')`. Every existing integration test
  keeps working with the default.

**Rationale**: The role must be set atomically with the account (FR-001: chosen before the account exists), and
Better Auth owns the `user` row. An additional field is Better Auth's documented extension point, and the
session already carries it. A DB CHECK stops any path that bypasses validation.

**Alternatives considered**:

- A separate `account_role` table written after sign-up: a crash between the two writes leaves an account
  without a role, and every session read needs a join.
- Better Auth's `admin` plugin roles: built for admin/user permissions and bans, with more surface than needed,
  and its `role` cannot be set at sign-up.
- The key `role`: collides with the `admin` plugin (see above).
- A PostgreSQL enum: Better Auth's adapter writes plain strings, and changing an enum later needs a custom
  migration. `text` + CHECK is easier to evolve.

## R-2. Renter preferences

**Decision**: A separate table `renter_preference (user_id PK → user ON DELETE CASCADE, country, city, area,
updated_at)`. The web saves it with `PUT /api/me/preferences` right after a successful sign-up, and from the
dashboard later (FR-002). `GET /api/me` returns `preferences` (or `null`). Owners get 403 on the PUT.

**Rationale**: The fields are optional and editable, unlike the role, and Better Auth's table should stay
minimal. If the second call fails, the account still exists and the dashboard offers to set preferences again;
nothing is lost but an optional value.

**Alternatives considered**: three more Better Auth additional fields (couples product data to the auth table and
to its update endpoint); local storage only (lost across devices, cannot prefill server-side).

## R-3. Authorization model (ADR)

**Decision**:

- `AuthGuard` on every route (FR-005), as today.
- `RolesGuard` with `@RequireRole('owner')` on every `/api/owner/*` controller. A renter gets **403**
  `urn:bseat:problem:http-403` (AQ-6, accepted). The check reads `session.user.accountType`.
- Every owner query includes `space.owner_id = caller` in the SQL `WHERE` (or joins through it). Another owner's
  space, seat, cubicle, calendar, mark, booking or layout gives the same 404 as a random UUID (FR-009, AC 2.6).
- Renter catalogue routes (`/api/listings/*`) read `status = 'published'` only. Unpublished and draft spaces
  are 404 there. Booking a space whose status is `unpublished` (it was listed, then withdrawn after the page
  loaded) is a 422 `space-not-published` (FR-020 requires naming the rule). Booking a `draft` space is 404, the
  same as `GET /api/listings/{id}`, because it has never been listed (architect, T001).
- Bookings: renters see and cancel only their own (`booking.user_id = caller`); owners see bookings at their own
  spaces only. Both with 404 parity (FR-028).
- Renter responses never contain occupancy notes or other renters' identities. The owner bookings response is the
  only place a renter's name and email appear (FR-027).

**Rationale**: Role is a coarse permission; ownership is data scoping and must not leak existence (ADR-0008
section 3). A 403 for the wrong role does not reveal anything about a particular space.

**Alternatives considered**: 404 for wrong role (indistinguishable from a broken link for a confused user, with no
security gain); authorization in controllers (AGENTS.md puts it in services).

## R-4. Slot time model (ADR)

**Decision**: Slots are derived from the space's opening hours, never stored as instants:

| Opening hours                                   | Slot            | Local start            | Local end                              |
| ----------------------------------------------- | --------------- | ---------------------- | -------------------------------------- |
| Open 24 hours, shift change `T`                 | `day`           | D at T                 | D at T+12h (D+1 if it passes midnight) |
|                                                 | `night`         | D at T+12h (same rule) | D+1 at T                               |
|                                                 | `full_day`      | D at T                 | D+1 at T                               |
| Fixed hours `open`–`close` (close > open, OQ-7) | `working_hours` | D at open              | D at close                             |

- A slot **belongs to the local date it starts on** (edge case "night slot crosses midnight").
- `slots.ts` converts each boundary with `zoned-time.ts` in the space's zone, so slots follow the wall clock and
  can last 11 or 13 hours on a changeover day (edge case DST).
- Adjacent slots share one computed boundary instant, so `day` ends exactly where `night` starts, and the
  half-open ranges touch without overlapping (edge case "touching slots"). `full_day` overlaps both, so it
  blocks them and either blocks it (edge case), with no special code: it is the same exclusion constraint.
- **Boundaries in a DST gap or overlap** (for example `T = 01:30` in London on 29 March). **Decided (AQ-2,
  [ADR-0009](../../docs/adr/0009-pass-bookings-seat-holds-and-slots.md) section 4; this amends ADR-0008 section 1
  for owner-set boundaries only).** They resolve like Temporal's `disambiguation: 'compatible'`: a gap gives the
  instant after the gap, an overlap gives the earlier instant. Both cases come to one rule, which is to use the
  offset in force **before** the transition (in `toInstant`'s algorithm, the offset read at `W − 24 h`). London
  `01:30` on 2026-03-29 resolves to 01:30 UTC, and on 2026-10-25 to 00:30 UTC. `zoned-time.ts` gains
  `toInstantCompatible`, unit-tested. `slots.ts` asserts `end > start` for every slot and throws otherwise. The cause is a tzdata anomaly or
  owner fixed hours inside one DST gap (e.g. New York 02:30-03:15 on 2026-03-08); `passPeriod` treats such a date
  as closed (skipped, no occurrence). **Shift change restriction (product decision):** the shift change time is
  00:00-11:59, so the night slot (T + 12 h) always starts on its own date; `slotWindow` and `offeredSlots` assert it.
  Local times accept `HH:mm` or `HH:mm:00` (Postgres `time`). Renter inputs are dates, not times, so `invalid-local-time` is not part of
  the 002 contract. The ADR-0008 refusal still applies to renter-typed times, and none remain after T043.
- Shift change and opening times are `HH:mm` (`LocalTime`). The spec sets no step, so none is enforced.

**Rationale**: One function owns slot arithmetic, so availability, booking, occupancy day boundaries and emails
agree. Deriving slots means a change of opening hours applies only to new bookings, and existing holds keep their
instants (edge case "switching to fixed hours").

**Alternatives considered**: storing a slot table with fixed UTC instants (wrong across DST and time zones);
storing per-slot custom times (custom shift lengths are out of scope); PostgreSQL `make_timestamptz` (silently
shifts gap times and moves the rule into SQL).

## R-5. Pass period and calendar evaluation

**Decision**:

- Pass lengths: `day` = 1, `week` = 7, `month` = 30 calendar days from the start date (Assumptions).
  `endDate = startDate + length − 1`. For a night slot the last occurrence ends the morning after `endDate`.
- A seat's calendar is its own row in `availability_calendar` if one exists, otherwise the space's shared row.
  A date is open when `start_date ≤ date`, `end_date` is null or `date ≤ end_date`, and the weekday bit is set
  (ISO weekday of the **local** date; Monday = bit 0).
- `pass-period.ts` returns `{ occurrences: [{ date, startsAt, endsAt }], skippedDates: [date] }` for
  (pass, slot, startDate, calendar, opening hours, timeZone). The start date must be open (`start-day-closed`
  otherwise, AC 6.4). The price never changes with skipped days (FR-017, Assumptions).
- A shared calendar row is created with each space (start = creation date in the space's zone, no end, all 7
  days; FR-024, AC 6.1). The migration backfills one for each existing space.
- Calendar changes never touch holds (FR-025). The response counts future active pass bookings for the affected
  seats that have at least one occurrence on a now-closed date (AC 6.5).

**Rationale**: Skipped days produce no hold, so other renters can still book them if the calendar later opens
them. No separate "closed" storage is needed.

**Alternatives considered**: a row per open date (huge for open-ended calendars); RRULE strings (a parser
dependency and more expressive than the spec).

## R-6. Multi-day pass storage and the conflict model (ADR)

**Decision (recommended option A)**:

- `booking` becomes the **pass header**: renter, seat, space, pass, slot, `start_date`, `end_date`, price and
  currency snapshot (FR-013), status, and `starts_at`/`ends_at` as the envelope (first occurrence start, last
  occurrence end). It is used for sorting, "not ended" (`ends_at > now`) and "has started" (`starts_at <= now`).
- New **`seat_hold`**: one row per held interval. A pass gets one row per occurrence (`booking_id`, `user_id`).
  An occupancy mark gets one row per seat (`occupancy_mark_id`, no user), with `ends_at` null for "until I mark
  it vacant" (an unbounded `tstzrange`). Each row has an `active` flag.
- Exclusion constraints (custom migration, same pattern as ADR-0008 section 2):
  - `seat_hold_seat_no_overlap EXCLUDE USING gist (seat_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (active)`
    covers bookings and occupancy together (FR-018, SC-005 both halves).
  - `seat_hold_user_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (active AND user_id IS NOT NULL)`
    (FR-019; occupancy rows have no user, so owners can mark many seats at once).
- **Create**: one transaction: lock the seat `FOR SHARE` (so a concurrent removal waits; R-15), insert the header,
  then insert all holds in chronological order (one multi-row INSERT). Map errors from `DrizzleQueryError.cause`:
  `23P01` on `seat_hold_seat_no_overlap` → 409 `booking:seat-unavailable`; on `seat_hold_user_no_overlap` → 409
  `booking:user-overlap`; `40P01` → retry the **whole transaction**, at most 3 attempts; anything else → rethrow.
  Multi-row inserts deadlock more often than 001's single row, so the retry is essential for SC-005.
- **Holds cannot disagree with their source** (AQ-7, **decided: database**, ADR-0009 section 3, verified on PG 18):
  - `booking.holds_active` is `GENERATED ALWAYS AS (status = 'active') STORED`, with
    `UNIQUE (id, seat_id, user_id, holds_active)`.
  - `seat_hold_booking_fk (booking_id, seat_id, user_id, active) → booking (id, seat_id, user_id, holds_active)
ON UPDATE CASCADE ON DELETE CASCADE`.
  - `seat_hold_occupancy_mark_fk (occupancy_mark_id, seat_id) → occupancy_mark (id, seat_id)`, plus
    `UNIQUE (occupancy_mark_id)`.

  A booking hold therefore always carries its header's seat and renter, and is active exactly when the header
  is. Changing `active` directly fails with `23503`.

- **Cancel**: the single statement `UPDATE booking SET status='cancelled', cancelled_at=$now WHERE … RETURNING`
  (scoped and guarded as in 001). The FK cascade deactivates every hold in the same statement. No second
  `UPDATE seat_hold` is written, so no code path can leave a cancelled booking blocking, or an active booking
  unprotected.
- Queries that should use the partial GiST indexes spell the predicate as the constraint does
  (`seat_hold.active` and `'[)'` as SQL literals; 001 data-model rule), **and** join the seats in by `space_id`
  rather than filtering `seat_id = ANY($ids)`. In a PG 18 spike (T001), `ANY` chose the btree and filtered the
  whole hold history (ADR-0009 section 7).
- Remaining limits (service plus test): the header envelope equals the first hold's start and the last hold's
  end, and every mark has its hold. Both are written in one transaction from the same computed list.

**Rationale**: The invariants stay plain exclusion constraints that ADR-0008 already proved (20-way race tests).
Bookings and occupancy marks share one seat constraint, which is what FR-018 and SC-005 demand. Skipped days need
no special encoding. Day and night slots on the same seat by different renters do not conflict, because each
occurrence is its own range (an envelope range per booking would wrongly block them). At most 30 rows per booking
is small.

**Alternatives considered**:

- **(B) Occurrence rows in the existing `booking` table** with a `pass_booking` header: the existing constraints
  keep working unchanged, but occupancy marks would have to become `booking` rows (with a nullable `user_id` and
  changed constraint predicates), and "booking" would mean a day-occurrence. Confusing names for little gain.
- **(C) One `tstzmultirange` column per booking** with `EXCLUDE … (during WITH &&)`: one row per booking and
  elegant, but Drizzle has no multirange type (custom type and raw SQL everywhere), conflict dates need `unnest`,
  occupancy still needs a row in the same table, and the GiST support for exclusion on multiranges needs a spike.
- **A trigger that checks overlaps**: not concurrency-safe without explicit locking, and hidden logic.
- **Cancel consistency in the service only** (the plan's first proposal for AQ-7): one plausible bug, such as
  deactivating holds when the header update matched no row, silently reopens a booked seat.
- **`SERIALIZABLE` or advisory locks per seat**: they do not cover the renter rule across seats (ADR-0008).

## R-7. Retiring the hourly flow (expand/contract) (ADR)

**Decision**: Follow the sequence in [plan.md](./plan.md#expandcontract-sequence-hourly-flow-retirement).
The key points:

1. The hourly `POST /api/bookings` is removed **before** the old exclusion constraints are dropped (T008 before
   T005), because nothing else would protect hourly rows inserted after the move. The web never called it (001
   T011 was not built), so no consumer breaks (AQ-8). `booking-conflicts.ts`, `booking-confirmation.mail.ts` and
   the deadlock-retry logic are kept and reused.
2. T005's migrations, in order:
   - (a) **generated**:
     - add `booking.kind` (`hourly`|`pass`, default `hourly`), the pass columns and `holds_active`;
     - add `seat_hold`, `occupancy_mark`, the composite FKs, CHECKs and indexes;
     - the 001 duration and quarter-hour CHECKs become `kind <> 'hourly' OR …` (drop and re-add in the generated
       migration).
   - (b) **custom**, one transaction, so there is no unprotected window:
     1. create the two `seat_hold` exclusions;
     2. `INSERT INTO seat_hold … SELECT` from active, not-ended hourly bookings;
     3. add `booking_no_new_hourly CHECK (kind <> 'hourly') NOT VALID`;
     4. drop `booking_seat_no_overlap` and `booking_user_no_overlap`.

   The `NOT VALID` CHECK keeps the legacy rows but refuses any new or updated hourly row. No hourly row can
   exist outside the old exclusions, even if T008 and T005 were merged in the wrong order (AQ-8: the ordering stays
   a requirement, and this is the safety net). Legacy rows become read-only (deletes still work).

3. In the same task, the legacy `GET /api/spaces/{id}/availability` (alive until T043) reads its `taken` state
   from active `seat_hold` rows instead of `booking`, so pass bookings and occupancy marks show correctly on the
   old page. Its tests and the `insertBooking` fixture move to `insertPassBooking` and `insertHold`, because hourly
   fixtures now fail `booking_no_new_hourly`.
4. Legacy hourly rows stay for history and are not listed (OQ-3).
5. `0000`–`0002` are never edited. New migrations are `0003` onward, generated table migrations first and
   `--custom` second (ADR-0008 migration order note).
6. Until T043 removes them, the legacy `GET /api/spaces` and `GET /api/spaces/{id}/availability` filter
   `status = 'published'`, so drafts never leak (FR-009).

**Rationale**: Constitution III and AGENTS.md (never edit a merged migration). Every intermediate state on `main`
keeps the invariants and compiles.

**Alternatives considered**: a new header table beside `booking` (two "booking" concepts forever); cancelling all
future hourly bookings in the migration (destroys data and needs product approval; OQ-3); keeping the hourly
route and writing holds from it during the transition (extra code for a path that is being deleted).

## R-8. Money and pricing

**Decision**:

- `pass_price.amount numeric(12,2) CHECK (amount > 0)`, unique per (space, slot, pass). `booking.price
numeric(12,2)` and `booking.currency char(3)` copy it at booking time (FR-013).
- The API carries money as `{ amount: "1500.00", currency: "INR" }`. Input regex
  `^(0|[1-9]\d{0,9})(\.\d{1,2})?$` plus a "greater than zero" refine, so "at most two decimals" is a 400, not a
  silent rounding (FR-011, AC 3.4). Output always has two decimals.
- `money.ts` converts to integer minor units (×100) for arithmetic. The 24-hour saving is
  `day + night − full_day` for the same pass length, shown only when positive, with the percentage of
  `day + night` rounded half-up to a whole number (FR-012, AC 3.5; the rounding is a proposal for the designer).
- Currency codes come from `Intl.supportedValuesOf('currency')`, validated on the server.

**Rationale**: Floats lose cents; strings are exact and easy to show. The spec fixes two decimals for every
currency, so a per-currency minor unit table is not needed.

**Alternatives considered**: integer minor units in the API (clients must know the scale); `money` type
(locale-dependent).

## R-9. Location search and suggestions

**Decision**:

- `space.country` is an ISO 3166-1 alpha-2 code (`char(2)`), required in search (FR-014).
- `city` and `area` keep the owner's text (trimmed). Stored generated columns `city_key = lower(btrim(city))`
  and `area_key = lower(btrim(area))` drive matching, so "ignoring letter case and surrounding spaces" is a plain
  equality (AC 4.2).
- Index `space_search_idx (country, city_key, area_key) WHERE status = 'published'`, and GIN on `utilities`
  for "all chosen utilities" (`utilities @> $chosen`; standard utilities only).
- Suggestions: `GET /api/listings/locations?country&field=city|area[&city]&q` returns distinct values among
  published spaces whose key starts with `lower(btrim(q))` (LIKE with `%`, `_` and `\` escaped), with the most
  common original spelling as the label (`mode() WITHIN GROUP (ORDER BY city)`), at most 10 (AC 4.2).
  Index with `text_pattern_ops` on the key.
- Order and paging per OQ-12 (name, then id; 20 per page; opaque cursor).

**Alternatives considered**: `citext` (an extension for two columns, and LIKE prefix still needs care);
`pg_trgm` fuzzy matching (the spec asks for case-insensitive, not fuzzy); a separate locations table (owners type
free text, Assumptions).

## R-10. Availability computation and performance (SC-003, SC-004)

**Decision**:

- **Seat availability** for (space, pass, slot, startDate): load seats, the shared calendar and own calendars in
  one query each. Compute the occurrence list once per distinct calendar (usually one) with `pass-period.ts`.
  Fetch every active hold of the space's seats that overlaps the envelope `[first start, last end)` in **one**
  query. Spell it for the GiST index (see R-6: literals, and `seat JOIN seat_hold … WHERE seat.space_id = $1
AND seat.removed_at IS NULL`). Then mark a seat `taken` if any hold overlaps any of its occurrences (sorted sweep
  in TS). A T001 spike on PG 18, with 200 of 2,000 seats and a year of holds each, ran a month-envelope query in
  about 20 ms: 200 GiST probes and no filtered rows. The `seat_id = ANY` form filtered 133,600 rows.
- **Search**: SQL prefilter by country, city and area keys, utilities, `published`, and "offers this pass and
  slot" (join on `space_slot` and `pass_price`), ordered and paged. Only when a start date is given, evaluate seat
  availability for the candidate page in batches until the page is full (T038).
- QA proves both with seeded volume (1,000 spaces; 200 seats with a month of holds) and records `EXPLAIN` output.

**Alternatives considered**: precomputed per-day availability tables (a second source of truth that must stay in
sync under concurrency); computing occurrences in SQL with `generate_series` and `make_timestamptz` (duplicates the
slot rules and their DST policy).

## R-11. Occupancy semantics (ADR)

**Decision**:

- A mark covers whole days: from the space's **day boundary** on the start date to the day boundary after the end
  date. The day boundary is the shift change time for 24-hour spaces and 00:00 for fixed-hours spaces, so a mark
  never clips the night slot of the day before. No end date → unbounded hold (`ends_at` null).
- One request may mark several seats. All marks and holds are inserted in one transaction, ordered by
  `(seat_id, starts_at)`, all or nothing. A `40P01` deadlock (likely when racing multi-row booking inserts) retries
  the **whole transaction**, at most 3 attempts in total, with the same helper as booking create (ADR-0009
  section 2).
- A renter booking in the way gives `23P01` on `seat_hold_seat_no_overlap`. The service rolls back, then reads
  the active holds that overlap each requested range (index-friendly spelling, R-6).
  - If any is a booking hold, it returns 409 `occupancy:conflicts-with-bookings`.
  - Otherwise (only the owner's own marks) it returns 409 `occupancy:already-occupied`.
  - Both carry the `OccupancyConflictProblem` extension (AQ-3): `conflicts: [{ seatId, label, bookedDates:
LocalDate[], marks: [{ id, startDate, endDate | null }] }]`.
  - `bookedDates` are the renter occurrences' `service_date` values (finite: bookings start at most 30 days
    ahead). Existing marks are reported as ranges, because an open-ended mark has no finite date list (FR-023,
    AC 5.3).
- "Mark vacant" ends the mark covering today: `ends_at = now` if it has started, `active = false` if not
  (AC 5.2: "bookable again from the next slot that has not started"; a slot that has started cannot be booked
  anyway). Future marks are removed individually (OQ-5). The hold is the source of truth for the mark's status,
  and `occupancy_mark.ended_at` is an audit timestamp (ADR-0009 section 3).
- The day boundary on a DST changeover resolves with the same "compatible" rule as slots (R-4), so a mark's
  start equals the matching slot start exactly.
- Seat state "today" (AC 5.4): `occupied` if an active mark overlaps today's local day, else `booked` if an active
  booking hold does, else `vacant`. The note is returned only on owner routes.

**Alternatives considered**: occupancy as instants chosen by the owner (more input, not asked for); a separate
occupancy table with its own constraint (cannot exclude against bookings across tables).

## R-12. Layout storage and the editor without a new dependency

**Decision**:

- Storage: `space_layout (space_id PK, columns, rows, version, updated_at)` and `layout_element (id, space_id,
kind seat|cubicle|area, seat_id UNIQUE?, cubicle_id UNIQUE?, label, x, y, w, h)` with CHECKs for kind/reference
  consistency and positive sizes. Bounds against the grid and "a seat in a cubicle lies inside it" are validated
  in the service.
- Seats and cubicles on the plan are the same rows as in the list (FR-029). The editor creates, renames and
  deletes them through the seat and cubicle endpoints immediately. The layout `PUT` saves geometry and areas
  only, with `version` for optimistic concurrency (409 `layout:stale-version`). Seats with no element appear in an
  "unplaced" tray (AC 8.2).
- Rendering: a CSS-grid or SVG surface of real DOM elements (buttons with accessible names), not `<canvas>`, so
  every item is focusable and axe can check it (SC-007). Pointer dragging uses pointer events and snaps to cells.
  Keyboard: Tab to an item, arrows move by one cell, Shift+arrows resize, Enter renames, Delete deletes, Escape
  cancels; every action is also in a side-panel form (FR-030, AC 8.3). The designer finalises the model (T061).
- Grid size proposal: 40 × 30 cells, adjustable within 10–80 (designer confirms).

**Rationale**: The constitution asks for justification of any new runtime dependency. The editor needs grid-snapped
moves and resizes of rectangles, which plain pointer events handle in about 100 lines, and the accessibility
model must be custom anyway (form alternative, arrow keys).

**Alternatives considered**: `@dnd-kit` (good keyboard support for sortable lists, but not for free 2-D
placement and resize; a dependency for little gain); `react-konva`/`fabric` (canvas-based, invisible to screen
readers and axe); a JSON document column (loses the FK link to seats and cubicles, so deletes could leave dangling
references).

## R-13. Reference data without a dependency

**Decision**: `GET /api/reference` returns:

- `countries`: a committed constant list of ISO 3166-1 alpha-2 codes, with English names from
  `Intl.DisplayNames(['en'], { type: 'region' })` and suggested time zones from `new Intl.Locale('und-' + code)`
  (`getTimeZones()` or the older `timeZones` getter, whichever the Node 22 V8 build provides; verify in the
  toolbox, and fall back to an empty list, in which case the owner picks from all zones).
- `currencies`: `Intl.supportedValuesOf('currency')` with `Intl.DisplayNames` names.
- `utilities`: the standard utility codes (OQ-8). The web owns their labels.

The web lists all time zones with `Intl.supportedValuesOf('timeZone')`; the server validates with
`isValidTimeZone` (001 R-1 note about canonical ids).

**Alternatives considered**: `i18n-iso-countries`, `countries-and-timezones` (dependencies for data `Intl` and a
short constant already give).

## R-14. Booking emails

**Decision**: After the booking transaction commits, queue two jobs with the existing bounded await (2 s each,
ADR-0008 section 5): renter confirmation (`jobId booking-confirmed-<id>`) and owner notification
(`booking-owner-notified-<id>`). Content per [contracts/booking-emails.md](./contracts/booking-emails.md): space,
seat, pass, slot, period in local time with the zone, price, and "payment is made directly to the owner"
(FR-021, AC 4.5, AC 4.10). Failures are logged without addresses and never undo the booking. The producer
fail-fast follow-up from 001 (T012 (c)) is carried into T069.

## R-15. Seat limits, labels and removal

**Decision**:

- Labels are unique among a space's active seats: partial unique index `(space_id, label) WHERE removed_at IS
NULL` replaces 001's `seat_space_id_label_unique`, so a removed seat's label can be reused.
- Removal is soft (`removed_at`), because past bookings keep pointing at the seat. It runs in a transaction that
  locks the seat `FOR UPDATE` and refuses with 409 `listing:seat-has-future-bookings` if any active hold of a
  booking ends after now (FR-007, edge case). Booking takes `FOR SHARE` on the seat, so the two serialise.
- The 200-seat cap: adding seats locks the space row `FOR UPDATE`, counts active seats, and refuses with 422
  `listing:seat-limit`. Bulk adds are all-or-nothing; duplicate labels give 409 `listing:label-taken` listing the
  labels.
- Bulk pattern: `{ prefix, from, to, padTo? }` → `prefix + n` (e.g. `A-1` … `A-20`), at most 200 per request.
- Cubicles are soft-removed too (`cubicle.removed_at`, name unique among active cubicles). Deleting one removes
  its seats with it (OQ-6) in one transaction that locks those seats `FOR UPDATE`. A hard delete would break the
  composite FK from the removed seats and lose the cubicle name on past bookings (architect, T001). A duplicate
  cubicle name is 409 `listing:cubicle-name-taken`.

## R-16. Web structure and navigation

**Decision**:

- `app/(app)/layout.tsx` renders the signed-in shell: skip link target, header with the role-aware nav
  (`<nav aria-label="Main">`), and the page. The nav reads the role from `useMeGet`.
- `lib/nav.ts` holds the per-role nav config. A unit test enumerates `src/app/(app)/**/page.tsx` and fails when a
  static route is neither in the role's nav nor declared as "reached from" a nav page (dynamic routes like
  `/spaces/[spaceId]`). This makes FR-004 a test, not a convention.
- `proxy.ts` matcher covers every `(app)` route (`/dashboard`, `/find`, `/spaces`, `/bookings`, `/owner`, `/book`).
- Owner pages live under `/owner/spaces/[spaceId]/…` with a management sub-nav (details, seats, pricing,
  availability, bookings, layout). Each page task adds its own link, because `typedRoutes` rejects links to
  routes that do not exist yet.
- `/book` becomes a permanent redirect to `/find` in T042 (old bookmarks keep working).
