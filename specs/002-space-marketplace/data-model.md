# Data model: Space marketplace

Builds on [001 data-model](../001-seat-booking/data-model.md). Drizzle schema files live in
`apps/api/src/db/schema/`. Columns are snake_case through drizzle `casing: 'snake_case'`. New ids are `uuid`
(`defaultRandom()`), Better Auth ids stay `text`, and all instants are `timestamptz`. Local calendar dates are
`date`, and local wall-clock times are `time` (no zone; the space's zone applies).

Constraint names are given so that tests and error mapping can refer to them. "(new)" marks a new object;
"(changed)" marks a change to a 001 object, made by a **new** migration.

## Enums

| Enum                        | Values                                      | Notes                                           |
| --------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `space_status` (new)        | `draft`, `published`, `unpublished`         | default `draft`                                 |
| `opening_mode` (new)        | `always_open`, `fixed_hours`                |                                                 |
| `slot_kind` (new)           | `day`, `night`, `full_day`, `working_hours` | API labels: Day, Night, 24 hours, Working hours |
| `pass_type` (new)           | `day`, `week`, `month`                      | lengths 1, 7, 30 days                           |
| `booking_kind` (new)        | `hourly`, `pass`                            | `hourly` = legacy 001 rows                      |
| `layout_element_kind` (new) | `seat`, `cubicle`, `area`                   |                                                 |
| `booking_status` (001)      | `active`, `cancelled`                       | unchanged                                       |

`user.account_type` is `text` + CHECK rather than an enum (research R-1, ADR-0010).

## Entities

### user (changed; Better Auth table, `schema/auth.ts`)

The product concept is the user's **role**. The stored and wire field is `accountType`, not `role`, because
Better Auth's `admin` plugin owns `user.role` (ADR-0010).

| Column       | Type | Null | Default    | Notes                                                                                                                                                                              |
| ------------ | ---- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account_type | text | no   | `'renter'` | CHECK `user_account_type_valid`: `account_type IN ('owner','renter')`. Existing rows read `renter` (FR-003). Required at sign-up, immutable after it (Better Auth hook, ADR-0010). |

### renter_preference (new, `schema/preference.ts`)

| Column     | Type        | Null | Default | Notes                                         |
| ---------- | ----------- | ---- | ------- | --------------------------------------------- |
| user_id    | text        | no   |         | PK, FK → `user.id` `ON DELETE CASCADE`        |
| country    | char(2)     | yes  |         | CHECK `country ~ '^[A-Z]{2}$'`                |
| city       | text        | yes  |         | CHECK `length(btrim(city)) between 1 and 100` |
| area       | text        | yes  |         | CHECK `length(btrim(area)) between 1 and 100` |
| updated_at | timestamptz | no   | `now()` |                                               |

### space (changed, `schema/space.ts`)

Existing columns: `id`, `name` (CHECK 1–100 kept), `location` (legacy), `time_zone`, `created_at`.

| Column              | Type           | Null              | Default   | Notes                                                                                                                                                                                                |
| ------------------- | -------------- | ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| owner_id            | text           | yes               |           | FK → `user.id` `ON DELETE RESTRICT`. Nullable only for legacy rows (expand); the seed claims them.                                                                                                   |
| status              | `space_status` | no                | `'draft'` |                                                                                                                                                                                                      |
| description         | text           | yes               |           | CHECK `length(btrim(description)) between 1 and 2000`                                                                                                                                                |
| country             | char(2)        | yes               |           | ISO 3166-1 alpha-2; CHECK `country ~ '^[A-Z]{2}$'`                                                                                                                                                   |
| city                | text           | yes               |           | CHECK 1–100 after trim                                                                                                                                                                               |
| area                | text           | yes               |           | CHECK 1–100 after trim                                                                                                                                                                               |
| city_key            | text           | yes               | generated | `GENERATED ALWAYS AS (lower(btrim(city))) STORED`                                                                                                                                                    |
| area_key            | text           | yes               | generated | `GENERATED ALWAYS AS (lower(btrim(area))) STORED`                                                                                                                                                    |
| street_address      | text           | yes               |           | CHECK 1–200 after trim                                                                                                                                                                               |
| currency            | char(3)        | yes               |           | ISO 4217; CHECK `currency ~ '^[A-Z]{3}$'`; validated against `Intl` in TS                                                                                                                            |
| opening_mode        | `opening_mode` | yes               |           |                                                                                                                                                                                                      |
| opens_at, closes_at | time           | yes               |           | fixed hours                                                                                                                                                                                          |
| shift_change_at     | time           | yes               |           | 24-hour spaces; CHECK `shift_change_at < '12:00'` (night slot starts on its own date, R-4)                                                                                                           |
| utilities           | text[]         | no                | `'{}'`    | standard codes (OQ-8), validated by Zod; CHECK `space_utilities_max`: `cardinality(utilities) <= 11`                                                                                                 |
| custom_utilities    | text[]         | no                | `'{}'`    | CHECK `space_custom_utilities_max`: `cardinality(custom_utilities) <= 5`; each 1–40 chars (Zod); CHECK `space_custom_utilities_length`: total `length(array_to_string(custom_utilities, '')) <= 200` |
| updated_at          | timestamptz    | no                | `now()`   |                                                                                                                                                                                                      |
| location            | text           | **yes** (changed) |           | legacy; NOT NULL dropped; dropped in a later contract migration                                                                                                                                      |

Constraints:

- `space_name_unique` **dropped** (OQ-11).
- `space_opening_hours_valid`: `opening_mode IS NULL OR (opening_mode = 'always_open' AND shift_change_at IS NOT NULL) OR (opening_mode = 'fixed_hours' AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)` (OQ-7).
- `space_owned_complete`: `owner_id IS NULL OR (description, country, city, area, street_address, currency, opening_mode are all NOT NULL)`.
  Every space an owner can reach is complete, so the owner and renter response schemas stay non-nullable
  (architect, T001). Owners can only create complete spaces (`CreateSpaceInput`), and the seed claims a legacy row
  by setting `owner_id` and every listing field in one `UPDATE`.
- `space_published_has_owner`: `status = 'draft' OR owner_id IS NOT NULL`. Together with the CHECK above, a
  published or unpublished space is always complete (FR-008, defence in depth). This replaces the plan's
  `space_published_complete`.

Indexes: `space_owner_id_idx (owner_id)`; `space_search_idx (country, city_key, area_key) WHERE status = 'published'`;
`space_city_prefix_idx (country, city_key text_pattern_ops) WHERE status = 'published'`;
`space_area_prefix_idx (country, city_key, area_key text_pattern_ops) WHERE status = 'published'`;
`space_utilities_gin` GIN `(utilities)`.

### cubicle (new, `schema/space.ts`)

| Column     | Type        | Null | Default | Notes                                                                   |
| ---------- | ----------- | ---- | ------- | ----------------------------------------------------------------------- |
| id         | uuid        | no   | random  | PK                                                                      |
| space_id   | uuid        | no   |         | FK → `space.id` `ON DELETE RESTRICT`                                    |
| name       | text        | no   |         | CHECK `length(btrim(name)) between 1 and 100` (confirmed in T018, OQ-D) |
| created_at | timestamptz | no   | `now()` |                                                                         |
| removed_at | timestamptz | yes  |         | soft removal (architect, T001; see below)                               |

`cubicle_space_id_name_active_unique (space_id, name) WHERE removed_at IS NULL`; `cubicle_id_space_id_unique (id, space_id)`
(target of composite FKs).

Cubicles are **soft-removed**, like seats. Deleting a cubicle (OQ-6) sets `removed_at` on the cubicle and on its
seats in one transaction, and deletes their layout elements. A hard delete would break the composite FK from the
removed seats, and past bookings would lose their cubicle name.

### seat (changed)

| Column     | Type        | Null | Default | Notes                                                                                                            |
| ---------- | ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| cubicle_id | uuid        | yes  |         | composite FK `(cubicle_id, space_id)` → `cubicle (id, space_id)`, so a seat's cubicle is in the same space       |
| removed_at | timestamptz | yes  |         | soft removal (R-15)                                                                                              |
| features   | text[]      | no   | `'{}'`  | (001, unchanged type) new CHECK `seat_features_max`: `cardinality(features) <= 10` (T021, OQ-D); each 1–40 (Zod) |

- `seat_space_id_label_unique` **replaced** by the partial unique index `seat_space_id_label_active_unique (space_id, label) WHERE removed_at IS NULL`.
- New `seat_id_space_id_unique (id, space_id)` as the target of composite FKs from `booking`, `availability_calendar`, `occupancy_mark` and `layout_element`. (`seat_hold` has no `space_id`; its seat is pinned through `seat_hold_booking_fk` / `seat_hold_occupancy_mark_fk`.)

### space_slot (new, `schema/pricing.ts`)

| Column   | Type        | Null | Notes           |
| -------- | ----------- | ---- | --------------- |
| space_id | uuid        | no   | FK → `space.id` |
| slot     | `slot_kind` | no   |                 |
| enabled  | boolean     | no   |                 |

PK `(space_id, slot)`. Which kinds are **offered** depends on `space.opening_mode` (`always_open` → day, night,
full_day; `fixed_hours` → working_hours). Rows for the other mode are kept but ignored, so switching mode never
deletes prices (edge case). Space create inserts the rows of its mode with `enabled = true`, and a mode switch
inserts the new mode's missing rows the same way (T020, decided in T018), so every offered kind always has a row.

### pass_price (new, `schema/pricing.ts`)

| Column     | Type          | Null | Notes                                                                               |
| ---------- | ------------- | ---- | ----------------------------------------------------------------------------------- |
| space_id   | uuid          | no   | FK → `space.id`                                                                     |
| slot       | `slot_kind`   | no   |                                                                                     |
| pass       | `pass_type`   | no   |                                                                                     |
| amount     | numeric(12,2) | no   | CHECK `pass_price_positive`: `amount > 0 AND amount <> 'NaN'` (numeric accepts NaN) |
| updated_at | timestamptz   | no   | default `now()`                                                                     |

PK `(space_id, slot, pass)`. No row = pass not offered (FR-011). A pass is **offered** when its slot is offered,
`space_slot.enabled` is true, and a price row exists. A disabled slot keeps its price rows (OQ-E, decided in
T018), and changing `space.currency` does not convert `amount` (OQ-G).

### availability_calendar (new, `schema/calendar.ts`)

| Column     | Type        | Null | Default | Notes                                                                                                   |
| ---------- | ----------- | ---- | ------- | ------------------------------------------------------------------------------------------------------- |
| id         | uuid        | no   | random  | PK                                                                                                      |
| space_id   | uuid        | no   |         | FK → `space.id`                                                                                         |
| seat_id    | uuid        | yes  |         | null = the shared calendar; composite FK `(seat_id, space_id)` → `seat (id, space_id)`                  |
| start_date | date        | no   |         |                                                                                                         |
| end_date   | date        | yes  |         | CHECK `availability_calendar_range`: `end_date IS NULL OR end_date >= start_date`                       |
| weekdays   | smallint    | no   | `127`   | bitmask, Monday = 1 … Sunday = 64; CHECK `availability_calendar_weekdays`: `weekdays BETWEEN 1 AND 127` |
| updated_at | timestamptz | no   | `now()` |                                                                                                         |

Unique: `availability_calendar_shared_unique (space_id) WHERE seat_id IS NULL`, `availability_calendar_seat_unique (seat_id)`.
A shared row is created with every space, and the migration backfills one per existing space with
`start_date = (created_at AT TIME ZONE time_zone)::date` (FR-024, AC 6.1). Switching a seat back to the shared
calendar deletes its own row (AC 6.3).

### booking (changed: becomes the pass header, `schema/booking.ts`)

Existing columns keep their meaning for legacy rows. For `kind = 'pass'`, `starts_at` and `ends_at` are the
envelope (first occurrence start, last occurrence end).

| Column       | Type           | Null | Default    | Notes                                                                                                            |
| ------------ | -------------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| kind         | `booking_kind` | no   | `'hourly'` | new code always writes `pass`                                                                                    |
| space_id     | uuid           | yes  |            | composite FK `(seat_id, space_id)` → `seat (id, space_id)`                                                       |
| pass         | `pass_type`    | yes  |            |                                                                                                                  |
| slot         | `slot_kind`    | yes  |            |                                                                                                                  |
| start_date   | date           | yes  |            | local date of the first day of the period                                                                        |
| end_date     | date           | yes  |            | `start_date + length − 1`                                                                                        |
| price        | numeric(12,2)  | yes  |            | snapshot (FR-013); CHECK `booking_price_positive`: `price IS NULL OR price > 0`                                  |
| currency     | char(3)        | yes  |            | snapshot                                                                                                         |
| holds_active | boolean        | no   | generated  | `GENERATED ALWAYS AS (status = 'active') STORED` (ADR-0009 section 3; must be STORED, PG 18 defaults to VIRTUAL) |

Constraints:

- `booking_hold_key_unique`: `UNIQUE (id, seat_id, user_id, holds_active)`, the target of `seat_hold_booking_fk`.
  With it, a cancelled booking can never keep an active hold, and an active booking can never lose one (AQ-7).
- `booking_no_new_hourly`: `CHECK (kind <> 'hourly') NOT VALID` (custom migration, ADR-0009 section 6). Existing
  hourly rows stay as read-only history. Any new or updated hourly row is refused with `23514`, so no hourly row
  can exist outside the old exclusions' protection.

- `booking_pass_complete`: `kind = 'hourly' OR (space_id, pass, slot, start_date, end_date, price, currency are all NOT NULL)`.
- `booking_pass_length`: `kind = 'hourly' OR end_date - start_date = CASE pass WHEN 'day' THEN 0 WHEN 'week' THEN 6 ELSE 29 END`.
- `booking_duration_bounds` and `booking_quarter_hour` (001) are **re-created** as `kind <> 'hourly' OR (<001 expression>)`.
- `booking_ends_after_starts` and `booking_cancel_consistency` are unchanged.
- `booking_seat_no_overlap` and `booking_user_no_overlap` are **dropped** after the backfill (R-7), superseded by
  the `seat_hold` exclusions.

New index: `booking_space_id_starts_at_idx (space_id, starts_at)` (owner bookings list). Existing
`booking_user_id_starts_at_idx (user_id, starts_at)` serves "my bookings".

### occupancy_mark (new, `schema/booking.ts`)

| Column     | Type        | Null | Default | Notes                                                                                                      |
| ---------- | ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------- |
| id         | uuid        | no   | random  | PK                                                                                                         |
| space_id   | uuid        | no   |         | composite FK `(seat_id, space_id)` → `seat (id, space_id)`                                                 |
| seat_id    | uuid        | no   |         |                                                                                                            |
| start_date | date        | no   |         |                                                                                                            |
| end_date   | date        | yes  |         | null = until marked vacant; CHECK `end_date IS NULL OR end_date >= start_date`                             |
| note       | text        | yes  |         | private; CHECK `note IS NULL OR length(note) <= 200` (FR-022)                                              |
| created_by | text        | no   |         | FK → `user.id` `ON DELETE RESTRICT`                                                                        |
| created_at | timestamptz | no   | `now()` |                                                                                                            |
| ended_at   | timestamptz | yes  |         | audit only: when it was vacated or removed. The mark's hold is the source of truth for blocking and status |

`occupancy_mark_id_seat_id_unique (id, seat_id)` is the target of `seat_hold_occupancy_mark_fk`.

### seat_hold (new, `schema/booking.ts`)

| Column            | Type        | Null | Default | Notes                                                                                     |
| ----------------- | ----------- | ---- | ------- | ----------------------------------------------------------------------------------------- |
| id                | uuid        | no   | random  | PK                                                                                        |
| seat_id           | uuid        | no   |         | FK → `seat.id` `ON DELETE RESTRICT`                                                       |
| user_id           | text        | yes  |         | renter, for booking holds; FK → `user.id` `ON DELETE CASCADE`                             |
| booking_id        | uuid        | yes  |         | part of `seat_hold_booking_fk` (below)                                                    |
| occupancy_mark_id | uuid        | yes  |         | UNIQUE (one hold per mark); part of `seat_hold_occupancy_mark_fk` (below)                 |
| service_date      | date        | yes  |         | local date the occurrence belongs to (booking holds; used for conflict dates and display) |
| starts_at         | timestamptz | no   |         |                                                                                           |
| ends_at           | timestamptz | yes  |         | null = unbounded (occupancy without end date only)                                        |
| active            | boolean     | no   | `true`  |                                                                                           |

CHECKs:

- `seat_hold_one_source`: `num_nonnulls(booking_id, occupancy_mark_id) = 1`
- `seat_hold_user_iff_booking`: `(booking_id IS NULL) = (user_id IS NULL)`
- `seat_hold_booking_bounded`: `booking_id IS NULL OR (ends_at IS NOT NULL AND service_date IS NOT NULL)`
- `seat_hold_ends_after_starts`: `ends_at IS NULL OR ends_at > starts_at`
- `seat_hold_booking_max_length`: `booking_id IS NULL OR ends_at - starts_at <= interval '26 hours'` (a 24-hour slot on a DST change day, including 2-hour shifts such as `Antarctica/Troll`; ADR-0009 section 4)

Composite foreign keys (generated migration; Drizzle `foreignKey()`, `MATCH SIMPLE`, so a null `booking_id` or
`occupancy_mark_id` skips that key). Verified on PG 18 in T001 (ADR-0009 section 3):

- `seat_hold_booking_fk`: `(booking_id, seat_id, user_id, active)` → `booking (id, seat_id, user_id, holds_active)`
  `ON UPDATE CASCADE ON DELETE CASCADE`. A booking hold always has its header's seat and renter. It is active
  exactly when the header is. Cancelling the header turns every hold off in the same statement, and updating a
  hold's `active` directly fails with `23503`.
- `seat_hold_occupancy_mark_fk`: `(occupancy_mark_id, seat_id)` → `occupancy_mark (id, seat_id)` `ON DELETE CASCADE`.

Exclusions (custom migration, R-6):

```sql
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_seat_no_overlap"
  EXCLUDE USING gist ("seat_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("active");
ALTER TABLE "seat_hold" ADD CONSTRAINT "seat_hold_user_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("active" AND "user_id" IS NOT NULL);
```

Write locking (runtime rule, no migration; ADR-0009 section 9). Every transaction that **inserts active holds**
(T036 booking create, T047 occupancy create) begins with `SET LOCAL lock_timeout = '5s'`, then
`lockSeats(tx, seatIds)`, before any row lock or insert:

```sql
SELECT pg_advisory_xact_lock(1112735745, k)  -- class 0x42530001 "seat-hold write"; two-int form, never bigint
FROM (SELECT DISTINCT hashtext(id::text) AS k FROM unnest($1::uuid[]) AS t(id) ORDER BY k) AS keys;
```

That means one lock per seat, de-duplicated and taken in ascending key order: a pass takes one, and occupancy
takes one per requested seat. The exclusion constraints still decide the outcome. The renter rule has no lock (it
uses the `40P01` retry), and `55P03` is rethrown, not retried. Cancel, vacate and removal take no seat lock. T005
adds the helper.

Btree indexes (FK lookups; the GiST indexes are partial and cannot serve them): `seat_hold_seat_id_idx (seat_id)`,
`seat_hold_booking_id_idx (booking_id)`, `seat_hold_user_id_idx (user_id)`. The unique index on `occupancy_mark_id`
serves the mark lookups.

### space_layout and layout_element (new, `schema/layout.ts`, US8)

`space_layout`: `space_id` PK/FK, `columns smallint` and `rows smallint` (CHECK between 10 and 80, proposal R-12),
`version integer NOT NULL DEFAULT 0`, `updated_at`.

`layout_element`:

| Column     | Type                  | Null | Notes                                                                                        |
| ---------- | --------------------- | ---- | -------------------------------------------------------------------------------------------- |
| id         | uuid                  | no   | PK                                                                                           |
| space_id   | uuid                  | no   | FK → `space_layout.space_id` `ON DELETE CASCADE`                                             |
| kind       | `layout_element_kind` | no   |                                                                                              |
| seat_id    | uuid                  | yes  | UNIQUE; composite FK `(seat_id, space_id)` → `seat (id, space_id)`                           |
| cubicle_id | uuid                  | yes  | UNIQUE; composite FK `(cubicle_id, space_id)` → `cubicle (id, space_id)` `ON DELETE CASCADE` |
| label      | text                  | yes  | areas only; CHECK 1–40 after trim                                                            |
| x, y       | smallint              | no   | CHECK `>= 0`                                                                                 |
| w, h       | smallint              | no   | CHECK `>= 1`                                                                                 |

CHECK `layout_element_kind_ref`: `(kind = 'seat') = (seat_id IS NOT NULL) AND (kind = 'cubicle') = (cubicle_id IS NOT NULL) AND (kind = 'area') = (label IS NOT NULL)`.
Soft-removed seats and cubicles lose their element in the same transaction as the removal. Because cubicles are
soft-removed, the `ON DELETE CASCADE` on `cubicle_id` never fires in normal operation, so the service deletes the
element.

## Relationships

```text
user 1─* space (owner)            space 1─* seat 1─* seat_hold *─1 booking *─1 user (renter)
user 1─0..1 renter_preference     space 1─* cubicle 1─* seat        seat_hold *─1 occupancy_mark *─1 seat
space 1─* space_slot              space 1─* pass_price              space 1─1 shared availability_calendar
seat 0..1─1 own availability_calendar                               space 1─0..1 space_layout 1─* layout_element
```

## Indexes and query paths

| Query                                                    | Used by                               | Index                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner's spaces                                           | `GET /api/owner/spaces`               | `space_owner_id_idx`                                                                                                                                                                       |
| Search by location                                       | `GET /api/listings`                   | `space_search_idx` (+ GIN on utilities)                                                                                                                                                    |
| City/area suggestions                                    | `GET /api/listings/locations`         | prefix indexes with `text_pattern_ops`                                                                                                                                                     |
| Active seats of a space by label                         | owner seats, availability             | `seat_space_id_label_active_unique`                                                                                                                                                        |
| Active holds of a space's seats overlapping an envelope  | seat availability, search filter      | GiST of `seat_hold_seat_no_overlap`; predicate spelled with `seat_hold.active` and `'[)'` literals, **joined from `seat` by `space_id`**, never `seat_id = ANY($ids)` (ADR-0009 section 7) |
| Holds overlapping a new mark (conflict listing)          | occupancy refusal                     | same GiST, same spelling, joined from the requested seats                                                                                                                                  |
| Renter's bookings not ended                              | `GET /api/bookings`                   | `booking_user_id_starts_at_idx` (filter `kind = 'pass'`, `status`, `ends_at`)                                                                                                              |
| Owner's bookings for a space                             | `GET /api/owner/spaces/{id}/bookings` | `booking_space_id_starts_at_idx`                                                                                                                                                           |
| Holds of a booking (cancel cascade, `days` in responses) | cancel, booking responses             | `seat_hold_booking_id_idx` (also serves the `ON UPDATE CASCADE` of `seat_hold_booking_fk`)                                                                                                 |
| Future holds of a seat (removal guard)                   | seat removal                          | `seat_hold_seat_id_idx`                                                                                                                                                                    |

## State transitions

**Space**

```text
(create) ─▶ draft ──publish (≥1 active seat, ≥1 offered pass)──▶ published ──unpublish──▶ unpublished
                                                                     ▲                         │
                                                                     └────────publish──────────┘
```

Publishing refuses with 422 `listing:publish-incomplete` and `missing: ['seat' | 'pricedPass']` (FR-008, AC 2.4).
Unpublishing keeps bookings (AC 2.5). There is no delete (spec: out of scope).

**Pass booking**: `active → cancelled` only by its renter while `starts_at > now` (first slot not started). It is one
`UPDATE booking`, and `seat_hold_booking_fk` cascades `active = false` to every hold in the same statement (AQ-7,
ADR-0009 section 3). Re-cancel returns 200 unchanged (ADR-0008 section 4); started → 409
`booking:already-started` (AC 7.2). "Ended" is derived (`ends_at <= now`). There is no transition back to `active`
(the FK refuses it).

**Occupancy mark**: `active` → `ended`. Vacating sets the hold's `ends_at = now` if it has started, else
`active = false`, and sets the mark's `ended_at` (audit). The status is always derived from the hold: `ended` when
`NOT active` or `ends_at <= now`.

## Validation rules (API boundary)

| Field               | Rule                                                                 | Where                                                              |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `accountType`       | `owner` \| `renter`, required at sign-up, never updated              | Better Auth `required` + `validator.input` + update hook; DB CHECK |
| `name`              | 1–100 after trim                                                     | Zod + CHECK                                                        |
| `description`       | 1–2,000 after trim                                                   | Zod + CHECK                                                        |
| `country`           | ISO alpha-2 in the reference list                                    | Zod refine + CHECK format                                          |
| `city`, `area`      | 1–100 after trim                                                     | Zod + CHECK                                                        |
| `streetAddress`     | 1–200 after trim                                                     | Zod + CHECK                                                        |
| `timeZone`          | `OfferedTimeZone`: reference zones plus `UTC`, max 64 (OQ-B)         | Zod refine                                                         |
| `currency`          | in `Intl.supportedValuesOf('currency')`                              | Zod refine + CHECK format                                          |
| `openingHours`      | discriminated union; fixed: `closesAt > opensAt`                     | Zod + CHECK                                                        |
| `utilities`         | subset of the standard codes, no duplicates                          | Zod                                                                |
| `customUtilities`   | at most 5, each 1–40 after trim, unique case-insensitively           | Zod + CHECK cardinality                                            |
| seat `label`        | 1–20 after trim; unique among active seats                           | Zod + partial unique                                               |
| seat `features`     | at most 10, each 1–40 after trim, no repeats ignoring case (OQ-D)    | Zod + CHECK `seat_features_max`                                    |
| cubicle `name`      | 1–100 after trim; unique among a space's active cubicles             | Zod + CHECK + partial unique                                       |
| seats per space     | at most 200 active                                                   | service with space row lock                                        |
| price `amount`      | decimal string, > 0, at most 2 decimals                              | Zod + CHECK                                                        |
| calendar            | `endDate >= startDate`; at least one weekday                         | Zod + CHECK                                                        |
| occupancy `note`    | at most 200 chars                                                    | Zod + CHECK                                                        |
| booking `startDate` | `LocalDate`; open day; first slot not started; at most 30 days ahead | Zod + `booking-rules.ts`                                           |

## Migrations

Generated migrations first, `--custom` second, statements separated by `--> statement-breakpoint`, and
`0000`–`0002` are never edited (ADR-0008, AGENTS.md). Tasks that generate migrations in parallel rebase and
**re-run** `db:generate` instead of hand-merging the journal or snapshots.

| Task | Migration (name)           | Kind      | Content                                                                                                                                                                                                                                                                                                                                                        |
| ---- | -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T002 | `user_account_type`        | generated | `user.account_type` + CHECK                                                                                                                                                                                                                                                                                                                                    |
| T003 | `listings`                 | generated | enums `space_status`, `opening_mode`; space columns, generated keys, CHECKs (`space_owned_complete`, `space_published_has_owner`, ...), indexes; drop `space_name_unique`; `location` nullable; `cubicle` (with `removed_at`, partial name index); seat `cubicle_id`, `removed_at`, partial label index, `seat_id_space_id_unique`                             |
| T004 | `pricing_calendar`         | generated | `slot_kind`, `pass_type`; `space_slot`, `pass_price`, `availability_calendar`                                                                                                                                                                                                                                                                                  |
| T004 | `shared_calendar_backfill` | custom    | one shared calendar per existing space                                                                                                                                                                                                                                                                                                                         |
| T005 | `pass_bookings`            | generated | `booking_kind`; booking pass columns, `holds_active` (stored generated) and CHECKs (re-created hourly CHECKs); `booking_hold_key_unique`; `occupancy_mark` + `occupancy_mark_id_seat_id_unique`; `seat_hold` + CHECKs + composite FKs `seat_hold_booking_fk` (`ON UPDATE CASCADE`), `seat_hold_occupancy_mark_fk` + unique `occupancy_mark_id` + btree indexes |
| T005 | `seat_hold_exclusions`     | custom    | in this order: (1) the two exclusions; (2) backfill holds from active, not-ended hourly bookings; (3) `booking_no_new_hourly CHECK (kind <> 'hourly') NOT VALID`; (4) drop `booking_seat_no_overlap`, `booking_user_no_overlap`                                                                                                                                |
| T013 | `renter_preferences`       | generated | `renter_preference`                                                                                                                                                                                                                                                                                                                                            |
| T021 | `seat_features_max`        | generated | CHECK `seat_features_max` on `seat` (scans the small seat table once)                                                                                                                                                                                                                                                                                          |
| T062 | `layouts`                  | generated | `layout_element_kind`; `space_layout`, `layout_element`                                                                                                                                                                                                                                                                                                        |

The backfill in T005:

```sql
INSERT INTO seat_hold (seat_id, user_id, booking_id, service_date, starts_at, ends_at, active)
SELECT b.seat_id, b.user_id, b.id, (b.starts_at AT TIME ZONE s.time_zone)::date, b.starts_at, b.ends_at, true
FROM booking b JOIN seat st ON st.id = b.seat_id JOIN space s ON s.id = st.space_id
WHERE b.status = 'active' AND b.ends_at > now();
```

Locking: every table changed here is small (dev seed data only; 001 never reached production). Adding
`NOT NULL DEFAULT` columns is metadata-only. Two statements **rewrite** their table under `ACCESS EXCLUSIVE`:
adding the stored generated `booking.holds_active` and the generated `space.city_key`/`area_key`. That is
harmless at today's sizes, but it must be flagged if the pattern is reused on a large table (add a plain column,
backfill in batches, then switch). `ADD CONSTRAINT … NOT VALID` takes only a brief lock and does not scan the
table. Rollback is a new migration that reverses the step. The custom exclusion migration's rollback drops
`booking_no_new_hourly` and re-creates the two 001 constraints.
