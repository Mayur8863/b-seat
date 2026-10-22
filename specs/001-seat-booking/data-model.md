# Data model: Seat booking

Drizzle schema files are `apps/api/src/db/schema/space.ts` (space, seat) and
`apps/api/src/db/schema/booking.ts` (booking, `booking_status`), both exported from `schema/index.ts`.
Columns are snake_case through the drizzle `casing: 'snake_case'` setting. IDs are `uuid` with
`defaultRandom()` (`gen_random_uuid()`, built into PG 13+). All times are `timestamptz`.

## Entities

### space

| Column     | Type        | Null | Default             | Notes                                                                                                                      |
| ---------- | ----------- | ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| id         | uuid        | no   | `gen_random_uuid()` | PK                                                                                                                         |
| name       | text        | no   |                     | `UNIQUE (name)`, used as the seed's natural key. CHECK `length(btrim(name)) between 1 and 100`                             |
| location   | text        | no   |                     | free-text description, e.g. "London, United Kingdom". CHECK `length(location) <= 200`                                      |
| time_zone  | text        | no   |                     | IANA zone id (e.g. `Europe/London`). Validated in TS by `isValidTimeZone` (seed). PG cannot CHECK IANA validity immutably. |
| created_at | timestamptz | no   | `now()`             |                                                                                                                            |

Relationships: one space has many seats.

### seat

| Column     | Type        | Null | Default             | Notes                                                                                                                                 |
| ---------- | ----------- | ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| id         | uuid        | no   | `gen_random_uuid()` | PK                                                                                                                                    |
| space_id   | uuid        | no   |                     | FK → `space.id` `ON DELETE RESTRICT` (seats with bookings must not vanish silently; spaces are seeded only)                           |
| label      | text        | no   |                     | `UNIQUE (space_id, label)` (also serves the "seats of a space ordered by label" query). CHECK `length(btrim(label)) between 1 and 20` |
| features   | text[]      | no   | `'{}'`              | optional features, e.g. `{"standing desk","dual monitor"}`                                                                            |
| created_at | timestamptz | no   | `now()`             |                                                                                                                                       |

Relationships: belongs to one space, has many bookings.

### booking

| Column       | Type                                          | Null | Default             | Notes                                                                                                              |
| ------------ | --------------------------------------------- | ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| id           | uuid                                          | no   | `gen_random_uuid()` | PK                                                                                                                 |
| seat_id      | uuid                                          | no   |                     | FK → `seat.id` `ON DELETE RESTRICT`                                                                                |
| user_id      | text                                          | no   |                     | FK → `user.id` `ON DELETE CASCADE` (Better Auth user ids are `text`; a deleted account takes its bookings with it) |
| starts_at    | timestamptz                                   | no   |                     | UTC instant of the local start                                                                                     |
| ends_at      | timestamptz                                   | no   |                     | UTC instant of the local end (exclusive)                                                                           |
| status       | `booking_status` enum (`active`, `cancelled`) | no   | `'active'`          |                                                                                                                    |
| created_at   | timestamptz                                   | no   | `now()`             |                                                                                                                    |
| cancelled_at | timestamptz                                   | yes  |                     | set when the booking is cancelled                                                                                  |

Relationships: belongs to one seat (and through it, one space) and to one user.

## Constraints (invariants in the database, Constitution IV)

| Name                         | Definition                                                                                                   | Protects                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `booking_ends_after_starts`  | `CHECK (ends_at > starts_at)`                                                                                | FR-007 end after start                                                                                                             |
| `booking_duration_bounds`    | `CHECK (ends_at - starts_at BETWEEN interval '15 minutes' AND interval '10 hours')`                          | FR-007 min/max duration                                                                                                            |
| `booking_quarter_hour`       | `CHECK (extract(epoch FROM starts_at)::bigint % 900 = 0 AND extract(epoch FROM ends_at)::bigint % 900 = 0)`  | FR-007 15-minute boundaries (UTC alignment equals local alignment because every zone offset is a multiple of 15 min; research R-2) |
| `booking_cancel_consistency` | `CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))`                                                | soft-cancel state is coherent                                                                                                      |
| `booking_seat_no_overlap`    | `EXCLUDE USING gist (seat_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active')` | FR-005, AC 2.3, AC 2.4, SC-002                                                                                                     |
| `booking_user_no_overlap`    | `EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active')` | FR-006, AC 2.5                                                                                                                     |
| `seat_space_id_label_unique` | `UNIQUE (space_id, label)`                                                                                   | seat label unique within its space                                                                                                 |
| `space_name_unique`          | `UNIQUE (name)`                                                                                              | idempotent seed                                                                                                                    |

The ranges are half-open (`'[)'`), so a booking ending at 12:00 and one starting at 12:00 do not
overlap (AC 1.3, edge case "touching windows"). The partial predicate means a cancelled booking
stops blocking both the seat and the user (FR-010).

The service enforces these rules and they have **no** DB constraint (they depend on the clock
or on `space.time_zone`; research R-3): within 07:00–20:00 local, the local time exists, not in
the past, at most 30 days ahead.

## Indexes and query paths

| Query                                                  | Used by                          | Index                                                                                                                                           |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Spaces with seat count, ordered by name                | `GET /api/spaces`                | `space_name_unique` + `seat_space_id_label_unique` (aggregate over a tiny table)                                                                |
| Seats of a space, ordered by label                     | availability                     | `seat_space_id_label_unique` (btree on `space_id, label`)                                                                                       |
| Active bookings of a seat overlapping a window         | availability, conflict detection | GiST index backing `booking_seat_no_overlap` (expression matches the query, research R-9)                                                       |
| A user's active bookings that have not ended, by start | `GET /api/bookings`              | `booking_user_upcoming_idx` btree `(user_id, starts_at) WHERE status = 'active'`                                                                |
| Booking by id and owner                                | cancel                           | PK (`id`), then filter on `user_id`                                                                                                             |
| FK lookups                                             | deletes                          | `booking_seat_id_idx` is covered by the GiST index's leading `seat_id`. `user_id` is covered by `booking_user_upcoming_idx` and the GiST index. |

## State transitions (booking)

```text
            create (rules pass, no overlap)
  (none) ───────────────────────────────▶ active
                                            │ cancel (owner, starts_at > now)
                                            ▼
                                         cancelled   (cancelled_at = now; terminal)
```

- `active → cancelled`: only by the owner, only while `starts_at > now()` (AC 3.3). Otherwise
  409 `booking:already-started` (AC 3.5).
- `cancelled → cancelled`: idempotent no-op returning the booking (open question 2).
- There is no stored "ended" state. A booking has ended when `ends_at <= now()`, which is derived
  at read time. It drops out of "My bookings" (FR-009).

## Validation rules (from the spec, applied at the API boundary or in the rules)

| Field                            | Rule                                                                       | Where                                        |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `date`                           | `YYYY-MM-DD`, a real calendar date                                         | Zod (`z.iso.date()`) → 400                   |
| `startTime`, `endTime`           | `HH:mm`, 00:00–23:59                                                       | Zod regex `^([01]\d\|2[0-3]):[0-5]\d$` → 400 |
| `seatId`, `spaceId`, `bookingId` | UUID                                                                       | Zod (`z.uuid()`) → 400                       |
| window                           | rules in the order of research R-3                                         | `booking-rules.ts` → 422 per-rule `type`     |
| availability window              | `endTime > startTime` only (rule-breaking windows are viewable, edge case) | Zod refine → 400                             |

## Migrations

Both migrations are additive (new types and tables only), so they are safe to apply ahead of the
code and need no expand/contract steps.

1. `0001_<generated>.sql`: produced by `bin/pnpm --filter @bseat/api db:generate --name spaces_bookings`.
   It contains the `booking_status` enum, the `space`, `seat` and `booking` tables, FKs, uniques,
   CHECKs and `booking_user_upcoming_idx`. Review the generated SQL for the CHECK expressions.
2. `0002_booking_exclusions.sql`: hand-written, created with `db:generate --custom --name booking_exclusions`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE "booking" ADD CONSTRAINT "booking_seat_no_overlap"
     EXCLUDE USING gist ("seat_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
     WHERE ("status" = 'active');
   ALTER TABLE "booking" ADD CONSTRAINT "booking_user_no_overlap"
     EXCLUDE USING gist ("user_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
     WHERE ("status" = 'active');
   ```
   Drizzle-kit cannot model `EXCLUDE`, so these constraints exist only in SQL. Later
   `db:generate` runs will not drop them, because drizzle-kit diffs its own snapshots.

The tables are new and empty, so there are no locking concerns. Rollback means dropping the three
tables and the enum (no data loss outside this feature).
