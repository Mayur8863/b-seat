# Data model: Space photos (003)

Proposed for architect review (T001). Drizzle schema in `apps/api/src/db/schema/photo.ts` (one file for the photo
aggregate), exported from `schema/index.ts`. One generated migration plus, if drizzle-kit cannot express the
deferrable unique constraint, a `--custom` migration right after it (T005). Domain tables use `uuid` ids and
`timestamptz`, as AGENTS.md requires. Nothing in 002's tables changes.

## `space_photo`

One fully added photo of one space. A row exists only after the image was validated, processed and written to
storage (FR-006). In-flight uploads have no row.

| Column           | Type          | Null | Default             | Notes                                                                        |
| ---------------- | ------------- | ---- | ------------------- | ---------------------------------------------------------------------------- |
| `id`             | `uuid`        | no   | `gen_random_uuid()` | PK. Also part of the object keys (`spaces/{space_id}/{id}/{variant}.webp`)   |
| `space_id`       | `uuid`        | no   |                     | FK → `space(id)` `ON DELETE RESTRICT` (spaces are never deleted, 002)        |
| `position`       | `smallint`    | no   |                     | 1 = cover. Exactly 1..n per space (service rule, R-6)                        |
| `description`    | `text`        | yes  |                     | Plain text, 1–150 characters after trim; `NULL` = none (R-8)                 |
| `display_width`  | `integer`     | no   |                     | Pixel size of the `display` variant (layout without shift, R-10)             |
| `display_height` | `integer`     | no   |                     |                                                                              |
| `byte_size`      | `integer`     | no   |                     | Total bytes of both stored variants (ops visibility; never shown to renters) |
| `created_at`     | `timestamptz` | no   | `now()`             |                                                                              |
| `updated_at`     | `timestamptz` | no   | `now()`             | Set by the service on describe and reorder                                   |

The `card` variant is always 640 × 480 (R-3), so its size is a constant, not a column. If the architect changes
the ratio in T001, it stays a constant.

**Constraints** (constitution IV):

- `space_photo_position_range` CHECK `(position BETWEEN 1 AND 10)`.
- `space_photo_position_unique` UNIQUE `(space_id, position)` **DEFERRABLE INITIALLY IMMEDIATE**. With the range
  check, a space can never have more than 10 photos (FR-002, SC-006). Reorder defers it inside its transaction.
- `space_photo_description_length` CHECK `(description IS NULL OR char_length(description) BETWEEN 1 AND 150)`.
- `space_photo_display_size_positive` CHECK `(display_width > 0 AND display_height > 0 AND byte_size > 0)`.

**Indexes**: the unique constraint's index `(space_id, position)` serves every read: the owner list, the listing
gallery (`WHERE space_id = $1 ORDER BY position`) and the search cover join (`space_id = s.id AND position = 1`).
No other index is needed.

**Not in the database, enforced by the service with the space row lock (R-6)**: positions have no gaps. Covered by
integration tests after add, delete, reorder and their races.

## `photo_object_purge`

Outbox of storage objects to delete (R-7). It covers deleted photos and abandoned uploads.

| Column            | Type          | Null | Default             | Notes                                                              |
| ----------------- | ------------- | ---- | ------------------- | ------------------------------------------------------------------ |
| `id`              | `uuid`        | no   | `gen_random_uuid()` | PK; also the BullMQ job id (deduplicates jobs)                     |
| `space_id`        | `uuid`        | no   |                     | No FK: the purge outlives the photo row. Used to build the keys    |
| `photo_id`        | `uuid`        | no   |                     | No FK, same reason                                                 |
| `reason`          | `text`        | no   |                     | CHECK `IN ('deleted', 'abandoned_upload')`                         |
| `due_at`          | `timestamptz` | no   |                     | `now()` for deletes; `now() + 1 hour` for upload intents           |
| `attempts`        | `integer`     | no   | `0`                 | Incremented on each failed purge                                   |
| `last_attempt_at` | `timestamptz` | yes  |                     |                                                                    |
| `created_at`      | `timestamptz` | no   | `now()`             | `photo.purge_overdue` fires when `now() - due_at > 12 hours` (R-7) |

**Constraints and indexes**: `photo_object_purge_reason_valid` CHECK; UNIQUE `(photo_id)` (one pending purge per
photo; an upload's intent and a later delete never coexist, because the insert transaction removes the intent);
index `photo_object_purge_due_idx` on `(due_at)` for the sweep.

## Storage objects (not a table)

| Key                                       | Content                                                | Written by   | Removed by         |
| ----------------------------------------- | ------------------------------------------------------ | ------------ | ------------------ |
| `spaces/{spaceId}/{photoId}/card.webp`    | 640 × 480 cover-crop, WebP q75, no metadata            | upload, seed | purge worker (R-7) |
| `spaces/{spaceId}/{photoId}/display.webp` | fit inside 1600 × 1600, never enlarged, WebP q80, none | upload, seed | purge worker (R-7) |

Objects are written with `Content-Type: image/webp`. No original is stored (R-3). The bucket is private, and
access is only through presigned GET URLs (R-4).

## Derived values (computed on read, never stored)

- **Cover**: the row with `position = 1` (spec Key Entities).
- **`altText`**: `description` or `"<space.name> photo <position>"` (FR-008, R-8).
- **Photo count**: `count(*)` for the space, shown as "n of 10".
- **URLs**: presigned per response with the windowed signing date (R-4); `photoUrlsExpireAt` is the window's
  expiry.

## State and lifecycle

```text
(owner picks file) ─▶ upload request ─▶ validate + process ─▶ purge intent row ─▶ put objects
                                         │ reject (4xx)                            │
                                         ▼                                         ▼
                                     nothing stored                 tx: lock space FOR UPDATE, count < 10?
                                                                       │ yes: insert space_photo at n+1,
                                                                       │      delete the intent  ──▶ ADDED
                                                                       │ no:  409 limit-reached; intent stays,
                                                                       ▼      objects deleted now or when due
ADDED ──describe / reorder──▶ ADDED
ADDED ──delete──▶ tx: delete row, renumber, insert purge (due now) ─▶ job ─▶ objects gone ─▶ purge row gone
```

## Query paths

| Use                                      | Query                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Owner list                               | `space` by id and `owner_id` (404 otherwise), then `space_photo WHERE space_id ORDER BY position`         |
| Listing detail (renter)                  | existing published-only space read, then the same photo read                                              |
| Search page (renter)                     | existing search query `LEFT JOIN space_photo p ON p.space_id = s.id AND p.position = 1`                   |
| Writers (add, describe, reorder, delete) | `SET LOCAL lock_timeout = '5s'`; `SELECT … FROM space WHERE id AND owner_id FOR UPDATE`; photo rows (R-6) |
| Purge sweep                              | `SELECT … FROM photo_object_purge WHERE due_at <= now() ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED` |

## ADR-0009 section 9.3 table additions (architect, T001)

| Writer         | Code                          | Space row    | Seat locks | After the space row                              |
| -------------- | ----------------------------- | ------------ | ---------- | ------------------------------------------------ |
| Photo add      | `SpacePhotosService.add`      | `FOR UPDATE` | none       | count, insert photo, delete the upload intent    |
| Photo describe | `SpacePhotosService.describe` | `FOR UPDATE` | none       | update the photo                                 |
| Photo reorder  | `SpacePhotosService.reorder`  | `FOR UPDATE` | none       | `SET CONSTRAINTS … DEFERRED`, update positions   |
| Photo delete   | `SpacePhotosService.remove`   | `FOR UPDATE` | none       | delete the photo, renumber, insert the purge row |
