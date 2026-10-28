# Contracts: Space photos (003)

These files describe the intended API. The **real contract** is the generated `apps/api/openapi.json`, produced
from the Zod schemas by `bin/pnpm gen:api` and reviewed in each backend PR. If this folder and `openapi.json`
disagree after implementation, the PR fixes one of them.

- [photos.md](./photos.md): owner photo routes under `/api/owner/spaces/{spaceId}/photos`, the upload helper,
  and the additions to the 002 listing responses.

## Conventions

Unchanged from [002 contracts/README.md](../../002-space-marketplace/contracts/README.md) (ADR-0008 section 3):
every route under `/api` behind `AuthGuard`; owner routes add `RolesGuard` + `@RequireRole('owner')` (a renter
gets 403) and are scoped by `space.owner_id` in SQL (another owner's space is the same 404 as a missing one,
FR-011); request schemas end in `Input` and are `z.strictObject`; response schemas are nouns with
`.meta({ id })`; free text uses `PlainText`; lists are `{ items }`; operation ids are `<Controller>_<method>`.

**Approved by the architect (2026-10-28, T001)** with the changes in
[ADR-0011](../../../docs/adr/0011-space-photo-storage.md) sections 2, 3, 7 and 11. They are folded into this file
and into photos.md.

**New for 003**: the upload route is `multipart/form-data`. Its body is documented with `@ApiConsumes` and an
`UploadSpacePhotoInput` schema (one binary `file` part), and the file is validated by the photo processing module,
not by Zod (R-2, R-3). Photo URLs are presigned and expire (R-4). Every response with URLs carries
`photoUrlsExpireAt`.

On the upload route, nothing reads the body before these steps, in this order: `AuthGuard`, then `RolesGuard`
(owner), then `OriginGuard` (a reusable guard in `apps/api/src/common/`; ADR-0011 section 3), then upload
admission (at most 16 upload requests in flight per API process).

## Route map

| Method | Path                                                           | Role  | Spec                           | Task |
| ------ | -------------------------------------------------------------- | ----- | ------------------------------ | ---- |
| GET    | `/api/owner/spaces/{spaceId}/photos`                           | owner | FR-001, FR-004, FR-020, AC 1.2 | T009 |
| POST   | `/api/owner/spaces/{spaceId}/photos` (multipart)               | owner | FR-002, FR-003, FR-006, FR-013 | T008 |
| PATCH  | `/api/owner/spaces/{spaceId}/photos/{photoId}`                 | owner | FR-008, AC 1.7                 | T009 |
| PUT    | `/api/owner/spaces/{spaceId}/photos/order`                     | owner | FR-009, AC 3.1, AC 3.2         | T023 |
| DELETE | `/api/owner/spaces/{spaceId}/photos/{photoId}`                 | owner | FR-010, AC 3.3–3.5             | T023 |
| GET    | `/api/listings` (adds `cover`, `photoUrlsExpireAt`)            | any   | FR-016, FR-018, FR-019         | T018 |
| GET    | `/api/listings/{spaceId}` (adds `photos`, `photoUrlsExpireAt`) | any   | FR-017, FR-018, FR-019         | T018 |

## Problem types (new)

| Status | Type                                              | When                                                                                                                                                                                               | Spec                   |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 400    | `urn:bseat:problem:validation`                    | no `file` part, extra parts or fields, bad description or order body                                                                                                                               | FR-003, FR-008         |
| 403    | `urn:bseat:problem:http-403`                      | renter on an owner route; upload with a foreign `Origin` (AQ-7)                                                                                                                                    | FR-011, R-2            |
| 404    | `urn:bseat:problem:http-404`                      | space missing or not the caller's; photo not in that space                                                                                                                                         | FR-011                 |
| 409    | `urn:bseat:problem:photo:limit-reached`           | the space already has 10 photos, or the insert hit `space_photo_position_range` (extension `limit: 10`)                                                                                            | FR-002, FR-004, SC-006 |
| 409    | `urn:bseat:problem:photo:order-stale`             | reorder body is not exactly the space's current photo ids                                                                                                                                          | FR-009, edge           |
| 413    | `urn:bseat:problem:photo:too-large`               | file over 10 MiB (extension `maxBytes: 10485760`)                                                                                                                                                  | FR-003                 |
| 415    | `urn:bseat:problem:photo:unsupported-format`      | not a still JPEG, PNG or WebP by content (incl. animated, GIF, HEIC, SVG); extension `accepted: ['jpeg','png','webp']`                                                                             | FR-003, edge           |
| 422    | `urn:bseat:problem:photo:dimensions-out-of-range` | long edge < 800 or > 12,000 px, or > 50 MP (extensions `minLongEdge`, `maxLongEdge`, `maxPixels`)                                                                                                  | FR-003, edge           |
| 422    | `urn:bseat:problem:photo:unreadable`              | header or decode fails                                                                                                                                                                             | edge                   |
| 503    | `urn:bseat:problem:photo:busy`                    | upload admission full (16 in flight), processing wait over 20 s, storage unreachable, or the upload intent was already claimed by the purge sweep; always with `Retry-After` (ADR-0011 section 11) | SC-002                 |

**Not a problem type** (T001): a `23505` on `space_photo_position_unique` is a 500 `urn:bseat:problem:internal`,
logged at `error`. Under the space lock it can only be a service bug, so it is not mapped to 409. A `55P03` lock
timeout is also a 500, logged as `photo.lock_timeout`. A body that does not arrive within Node's
`requestTimeout` (120 s) gets Node's own 408 and a closed connection. The upload helper reports that as
`urn:bseat:problem:network`.

Titles and details go into the 002 "Problem copy registry" in the T008 PR. The web shows the ui spec's copy
for each type (T011). The extension schemas are `PhotoLimitProblem`, `PhotoTooLargeProblem`,
`PhotoFormatProblem` and `PhotoDimensionsProblem` (`ProblemSchema.extend`, ADR-0009 section 8).
