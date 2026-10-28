---
description: 'Task tracker for 003 space photos'
---

# Tasks: Space photos

**Input**: `specs/003-space-photos/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Required. The constitution (II) makes business logic test-first, and every acceptance criterion maps to
an automated test.

**Organization**: a design-approval phase, a foundational phase (devops first, then storage, schema and image
processing), one phase per user story in priority order (US1 and US2 P1, US3 and US4 P2, US5 P3), then review and
release. Every task has an id, an owner agent, a branch, a size (S or M; there are no L tasks), dependencies, a
status, and Given/When/Then acceptance criteria that trace to spec ids (`AC x.y` = User Story x, scenario y;
`FR-…`, `SC-…`, and "edge" for the Edge Cases list).

**Status values**: `todo | in-progress | review | done | blocked (reason, unblock owner)`. Only the task-manager
changes owners. Developers set `review`. Only qa-engineer sets `done`.

**Gate**: no task except T001 is dispatched until plan.md reads "Approved by architect". **Passed on 2026-10-28**
(T001). The architect changed several proposals, and the affected tasks below are already updated (each change is
marked "(T001)"). See plan.md "Architect verdict" and ADR-0011.

**Base branch**: `dev/003-integration`, cut from `dev/002-integration` (plan OQ-2, confirmed by the human, research R-13).
Every task branch is cut from it and merged back after QA and review. 003 merges into `main` only after 002, and
only a human merges.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the other [P] tasks in the same phase (different files, no unmet dependency)
- **[Story]**: US1 … US5 (spec user stories)

## Summary table

| ID   | Title                                                            | Owner             | Depends on                   | Size | Status | Branch                                 |
| ---- | ---------------------------------------------------------------- | ----------------- | ---------------------------- | ---- | ------ | -------------------------------------- |
| T001 | Approve plan; write ADR-0011; amend ADR-0007 and ADR-0009 9.3    | architect         | none                         | M    | done   | `spec/003-space-photos`                |
| T002 | Bump multer ≥ 2.5.0 and body-parser ≥ 2.4.0 (CVEs)               | devops            | T001                         | S    | todo   | `chore/003-multer-body-parser-cves`    |
| T003 | Local S3 storage service, bucket init, e2e forwarder and S3 env  | devops            | T001                         | M    | todo   | `chore/003-local-storage`              |
| T004 | Storage module, S3 env and windowed URL signing (TDD)            | backend-dev       | T003                         | M    | todo   | `feat/003-object-storage`              |
| T005 | Photo schema and migration, constraint tests first               | backend-dev       | T001                         | S    | todo   | `feat/003-photo-schema`                |
| T006 | Image processing module with sharp (TDD)                         | backend-dev       | T001                         | M    | review | `feat/003-photo-processing`            |
| T007 | Production image loads sharp; AWS storage runbook                | devops            | T006                         | S    | todo   | `chore/003-photo-runtime`              |
| T008 | Upload API: validate, process, store, insert                     | backend-dev       | T002, T004, T005, T006       | M    | todo   | `feat/003-photo-upload-api`            |
| T009 | Owner photo list and describe API                                | backend-dev       | T008                         | S    | todo   | `feat/003-photo-list-api`              |
| T010 | `uploadSpacePhoto` XHR helper in the api-client                  | frontend-dev      | T008                         | S    | todo   | `feat/003-upload-helper`               |
| T011 | UI spec: owner Photos section                                    | ui-ux-designer    | T001                         | M    | todo   | `docs/003-ui-owner-photos`             |
| T012 | UI spec: cover, placeholder, gallery and large view              | ui-ux-designer    | T001                         | S    | todo   | `docs/003-ui-renter-photos`            |
| T013 | Upload-queue model (pure reducer, TDD)                           | frontend-dev      | T011                         | S    | todo   | `feat/003-upload-queue-model`          |
| T014 | Owner Photos page: nav, list, empty state, count, upload queue   | frontend-dev      | T009, T010, T011, T013       | M    | todo   | `feat/003-owner-photos-page`           |
| T015 | Describe photos and guard leaving with unfinished uploads        | frontend-dev      | T014                         | S    | todo   | `feat/003-photo-describe-leave-guard`  |
| T016 | QA US1: owner upload e2e, axe, SC-002, SC-005                    | qa-engineer       | T014, T015                   | M    | todo   | `test/003-us1-add-photos`              |
| T017 | Docs US1                                                         | docs-writer       | T016                         | S    | todo   | `docs/003-us1-add-photos`              |
| T018 | Listing API: cover on search results, photos on the detail       | backend-dev       | T009                         | M    | todo   | `feat/003-listing-photos-api`          |
| T019 | Space photo component, placeholder and cover on `/find` cards    | frontend-dev      | T012, T018                   | S    | todo   | `feat/003-find-card-cover`             |
| T020 | Listing gallery and large view (keyboard, pointer, touch)        | frontend-dev      | T012, T018, T019             | M    | todo   | `feat/003-listing-gallery`             |
| T021 | QA US2: renter e2e, axe incl. large view, SC-003, SC-004, FR-019 | qa-engineer       | T019, T020                   | M    | todo   | `test/003-us2-renter-photos`           |
| T022 | Docs US2                                                         | docs-writer       | T021                         | S    | todo   | `docs/003-us2-renter-photos`           |
| T023 | Reorder and delete API                                           | backend-dev       | T009                         | M    | todo   | `feat/003-photo-reorder-delete-api`    |
| T024 | Purge sweep (scheduler, lease claim) and overdue alert log       | backend-dev       | T023                         | M    | todo   | `feat/003-photo-purge`                 |
| T025 | Reorder controls and delete dialog                               | frontend-dev      | T011, T014, T023             | M    | todo   | `feat/003-photo-reorder-delete-ui`     |
| T026 | QA US3: keyboard reorder, permanent delete, purge                | qa-engineer       | T024, T025                   | M    | todo   | `test/003-us3-arrange-photos`          |
| T027 | Docs US3: photo-storage runbook (purge operations)               | docs-writer       | T026                         | S    | todo   | `docs/003-us3-arrange-photos`          |
| T028 | 10-photo limit under concurrency (race test first)               | backend-dev       | T008                         | S    | todo   | `feat/003-photo-limit-race`            |
| T029 | QA US4: limit e2e and the SC-006 race                            | qa-engineer       | T014, T028                   | S    | todo   | `test/003-us4-photo-limit`             |
| T030 | Docs US4                                                         | docs-writer       | T029                         | S    | todo   | `docs/003-us4-photo-limit`             |
| T031 | Seed photo assets: download, resize, credits                     | backend-dev       | T006                         | S    | todo   | `feat/003-seed-photo-assets`           |
| T032 | Seed wiring: attach photos to London HQ and Pune Hub             | backend-dev       | T003, T008, T031             | S    | todo   | `feat/003-seed-photos`                 |
| T033 | QA US5: offline seed, idempotency, credits                       | qa-engineer       | T032                         | S    | todo   | `test/003-us5-seed-photos`             |
| T034 | Docs US5                                                         | docs-writer       | T033                         | S    | todo   | `docs/003-us5-seed-photos`             |
| T035 | Security review of the photo feature                             | security-reviewer | T016, T021, T026, T029, T033 | S    | todo   | none (read-only; findings in tasks.md) |
| T036 | QA final regression, SC-001 timing, traceability                 | qa-engineer       | T035                         | S    | todo   | `test/003-final-regression`            |
| T037 | Docs release: README, ADR index, changesets, merge-order note    | docs-writer       | T036                         | S    | todo   | `docs/003-release`                     |

---

## Phase 1: Design approval

- [x] T001 Write `docs/adr/0011-space-photo-storage.md`, add an "Object storage" line to `docs/adr/0007-aws-deployment-target.md`, add the photo writers to the `docs/adr/0009-pass-bookings-seat-holds-and-slots.md` section 9.3 table, update `docs/adr/README.md`, and record the verdict at the top of `specs/003-space-photos/plan.md`
  - **Owner**: architect · **Branch**: `spec/003-space-photos` (the planning branch, as instructed) · **Size**: M · **Depends on**: none · **Status**: done (2026-10-28). Approved with 11 amendments (plan.md verdict). ADR-0011 is Accepted and indexed. ADR-0007 gained an object storage line, ADR-0009 section 9.3 gained the four photo writers, and data-model.md, contracts/ and this file are updated.
  - **Scope**: review plan.md, research.md (R-1 to R-14), data-model.md and contracts/. Decide AQ-1 to AQ-10. Amend this folder directly where a decision changes it, and list the amendments under the verdict (as 002 T001 did). The ADR covers storage, the upload flow, image processing (sharp, `allowBuilds`, glibc images), signed GET URLs (≤ 1 h, FR-019 option B), deletion and purge (≤ 24 h), and the limit under concurrency with the ADR-0009 lock order.
  - **Acceptance criteria**:
    - Given the plan, When the architect approves, Then plan.md reads "Approved by architect (date)" with every AQ answered and any amendments listed, and ADR-0011 is `Accepted` in the ADR index.
    - Given ADR-0009 section 9.3, When amended, Then the photo add, describe, reorder and delete writers are in the table with `lock_timeout` first and the space row `FOR UPDATE` (data-model.md).
    - Given the plan is sent back, Then the reasons are listed under the verdict and no other task is dispatched.

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: dependency CVEs, local object storage, the storage port, schema and image processing. devops goes
first (T002, T003). After T001: T002, T003, T005, T006, T011 and T012 can start in parallel; T004 follows T003.

- [ ] T002 [P] Fix CVE-2026-113872 (`multer` 2.4.0 → ≥ 2.5.0) and CVE-2026-111181 (`body-parser` 2.3.0 → ≥ 2.4.0): upgrade `@nestjs/platform-express` / `express` if a release pins the fixed versions, otherwise add `overrides` to `pnpm-workspace.yaml` with a comment naming both CVEs and when to remove it; update `pnpm-lock.yaml`
  - **Owner**: devops · **Branch**: `chore/003-multer-body-parser-cves` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Acceptance criteria**:
    - Given the lockfile, When `bin/pnpm why multer` and `bin/pnpm why body-parser` run, Then only versions ≥ 2.5.0 and ≥ 2.4.0 resolve (research R-14).
    - Given `bin/security`, When Trivy scans the lockfile, Then neither CVE is reported.
    - Given `bin/pnpm check`, Then it passes with no behaviour change (the JSON body limit of 100 kB still applies; the existing integration tests pass).

- [ ] T003 [P] Add `storage` (a maintained S3-compatible server chosen per ADR-0011 section 1, with a version-pinned image, a healthcheck, a `storagedata` volume and port 9000), a one-shot `storage-init` (pinned) that creates the private bucket `bseat-photos` idempotently, and a `storage-forward` TCP forwarder (pinned) in the `e2e` profile with `network_mode: service:web` to `docker-compose.yml`; add the S3 variables to the shared node environment; make `migrate` and `api` depend on `storage-init`; document every variable in `.env.example`; update `docs/runbooks/local-development.md` and the README test prerequisites
  - **Owner**: devops · **Branch**: `chore/003-local-storage` · **Size**: M · **Depends on**: T001 · **Status**: todo
  - **Scope**: ADR-0011 sections 1 and 10; research R-1, R-4 (e2e reachability), R-12; contracts/photos.md "Environment".
    - **(T001)** Do not use MinIO by default: upstream archived on 2026-04-25 and publishes no new community binaries. Try SeaweedFS (Apache-2.0) first. Use MinIO's last community image only if no maintained candidate passes the conformance list, and say so in the PR.
    - The compose service is named `storage`, and `S3_ENDPOINT` is `http://storage:9000`.
    - The dev-only access key and secret get defaults in compose, like `BETTER_AUTH_SECRET`, and are never used outside local dev. The bucket has no anonymous policy.
  - **Acceptance criteria**:
    - Given `docker compose up`, When the stack is healthy, Then `storage-init` has exited 0, the `bseat-photos` bucket exists, and an anonymous `GET http://localhost:9000/bseat-photos/x` returns 403.
    - **(T001)** Given the chosen server, When the ADR-0011 conformance list is run by hand and recorded in the PR (for example with a pinned `amazon/aws-cli` one-shot: `s3api put-object`, then `s3 presign --expires-in 2` and `curl`), Then all six points pass: a presigned GET works path-style; it returns 403 after expiry and with a tampered signature; `response-cache-control` and `response-expires` are honoured; `DeleteObject` on a missing key succeeds; an anonymous GET is refused; and it runs offline from a pinned image with no account.
    - Given `storage-init` runs a second time, Then it exits 0 (idempotent).
    - Given the e2e profile, When the e2e container requests the storage server's health or root URL at `http://localhost:9000`, Then it gets the server's answer (any non-connection-error response), so the forwarder works inside web's network namespace.
    - Given `.env.example`, Then every new variable has a comment, and the secret ones say "dev only".

- [ ] T004 Add `S3_*` and `PHOTO_URL_TTL_SECONDS` to `apps/api/src/config/env.ts` (+ `env.spec.ts`); add `apps/api/src/storage/` (`storage.module.ts`, `storage.service.ts`, `url-signing.ts` + `url-signing.spec.ts`) with `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; point integration tests at `S3_BUCKET_PHOTOS_TEST` in `apps/api/test/setup-env.ts` and create and empty that bucket in `global-setup.ts`; add `apps/api/test/storage.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/003-object-storage` · **Size**: M · **Depends on**: T003 · **Status**: todo
  - **Scope**: ADR-0011 sections 1, 5 and 10; research R-1, R-4, R-12; contracts/photos.md "Storage port" and "Environment". The PR states why each new dependency is needed. The signing window is a pure function, tested first. Secrets are never logged.
    - **(T001)** The port is `putObject`, `deleteObject` (one key) and an async `signGetUrls(keys, now)`.
    - S3 client timeouts: 3 s connection, 15 s request, at most 3 attempts.
    - The signed `response-cache-control` is `private`, and `response-expires` is the URL's expiry (not `max-age`).
    - `PHOTO_URL_TTL_SECONDS` is an integer 2–3600.
    - `setup-env.ts` sets `S3_PUBLIC_ENDPOINT` to `S3_ENDPOINT`.
    - Set `WHEN_REQUIRED` checksums only if the local server rejects the SDK defaults.
  - **Acceptance criteria**:
    - Given `PHOTO_URL_TTL_SECONDS=3601` or `1`, or only one of `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, When the env loads, Then it fails with a readable error (FR-019 cap). Given `2`, Then it loads.
    - Given two calls to the signer within one window (`W = floor(TTL/2)`), Then both return the same URL; Given calls in adjacent windows, Then the URLs differ; and for any `now`, `expiresAt − now` is in `(TTL − W, TTL]` (ADR-0011 section 5).
    - Given the local `storage` service, When an object is put and its signed URL is fetched, Then 200 with `Content-Type: image/webp`, `Cache-Control: private` and an `Expires` equal to the URL's expiry; Given `PHOTO_URL_TTL_SECONDS=2` and a wait past expiry, Then the same URL returns 403; Given a tampered signature, Then 403 (FR-019, the ADR-0011 conformance list).
    - Given `deleteObject` on an existing key and then on a missing key, Then both resolve and the object is gone (idempotent purge, R-7).
    - Given `S3_PUBLIC_ENDPOINT` differs from `S3_ENDPOINT`, Then signed URLs use the public host and put and delete use the internal one.

- [ ] T005 [P] Add `apps/api/src/db/schema/photo.ts` (`space_photo`, `photo_object_purge`), export it from `schema/index.ts`, generate the migration (plus a `--custom` one for the deferrable unique constraint if drizzle-kit cannot express it), and write `apps/api/test/photo-constraints.int-spec.ts` first
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-schema` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Scope**: data-model.md verbatim (**(T001)**: there is no `byte_size` column; `last_attempt_at` is the sweep lease). Generate on the latest `dev/003-integration`. If 002 lands a migration before this merges, regenerate (R-13).
  - **Acceptance criteria**:
    - Given a space with photos at positions 1–10, When an 11th row is inserted at position 11, Then `23514` on `space_photo_position_range`; at an existing position, Then `23505` on `space_photo_position_unique` (FR-002, SC-006 in the database).
    - **(T001)** Given photos at positions 1, 2 and 3, When one `UPDATE … FROM (VALUES …)` sets them to 3, 1 and 2, and When `UPDATE … SET position = position - 1 WHERE position > 1` runs after deleting position 1, Then both commit with no `SET CONSTRAINTS` (deferrable-immediate, ADR-0011 section 7). Given two separate `UPDATE` statements that create a transient duplicate, Then the first fails with `23505` (the constraint is still checked immediately per statement).
    - Given a description of 151 characters or `''`, Then `23514` on `space_photo_description_length`.
    - Given a purge row with reason `'other'`, Then `23514`; Given a second purge row for the same `photo_id`, Then `23505`.
    - Given `bin/pnpm --filter @bseat/api db:generate` on the merged schema, Then no new migration is produced (schema and SQL agree).

- [ ] T006 [P] Add `apps/api/src/photos/photo-processing.ts` (+ `photo-processing.spec.ts` written first) with `sharp` as a direct `@bseat/api` dependency. **(T001)** Do **not** add sharp to `allowBuilds`: 0.35.5 has no install script.
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-processing` · **Size**: M · **Depends on**: T001 · **Status**: review
  - **Scope**: ADR-0011 section 4; research R-3; contracts/README.md problem types. Pure module: bytes in, either `{ card, display, width, height, format }` or a typed rejection out. No Nest, no I/O. Test images are generated in the test with sharp (`withExif` for GPS, orientation 6 and a body serial number), so nothing downloads.
    - **(T001)** Use `failOn: 'error'`, `limitInputPixels: 50_000_000` and `timeout({ seconds: 15 })`.
    - Detect APNG by walking the PNG chunks for `acTL` before `IDAT`.
    - Decode once into a ≤ 1600 px, auto-oriented sRGB intermediate, and derive both variants from it.
    - `card` is always exactly 640 × 480 (it may upscale).
    - Set `sharp.cache(false)` and `sharp.concurrency(1)`.
  - **Acceptance criteria**:
    - Given a JPEG, a PNG and a WebP of 2000 × 1500, When processed, Then `card` is 640 × 480 WebP and `display` is 1600 × 1200 WebP (FR-003, FR-018).
    - Given a 1000 × 800 JPEG, Then `display` is 1000 × 800 (never enlarged). **(T001)** Given an 800 × 300 PNG, Then `card` is still exactly 640 × 480.
    - Given a JPEG with EXIF GPS, a camera owner name and a serial number, When processed, Then neither variant has `exif`, `xmp` or `iptc` metadata (FR-013, SC-005).
    - Given a JPEG with EXIF orientation 6 (stored 1500 × 2000 sideways), Then `display` is portrait, 1200 × 1600 (FR-014, AC 1.8).
    - Given a PDF renamed `.jpg`, a GIF, an animated WebP, an SVG and a HEIC sample header, Then each is rejected `unsupported-format`; given truncated JPEG bytes, Then `unreadable`; given a long edge of 799 or 12,001 px, or 8,000 × 7,000 px (56 MP), Then `dimensions-out-of-range` (FR-003, edge).
    - Given the format is judged, Then the file name and the client content type are never read (edge "a file named .jpg").
    - **(T001)** Given an APNG (a sharp-generated PNG with an inserted `acTL` chunk and a valid CRC), Then `unsupported-format` (edge "animated PNG").
    - **(T001)** Given the worst-case fixtures (a 50 MP 16-bit RGBA PNG with EXIF orientation 6, and a 50 MP progressive JPEG), When each is processed, Then it succeeds or is refused within the timeout, and the PR records each fixture's peak RSS (measured with `process.memoryUsage().rss` sampling or `/usr/bin/time -v` in the tools container) for T007's task sizing. Generate the fixtures at test time, and do not commit them.

- [ ] T007 Check that the production API image (`docker/api.Dockerfile`) loads sharp on each architecture CI builds; write `docs/runbooks/photo-storage.md`: the AWS bucket settings and IAM from ADR-0011 section 1; the Fargate API memory, sized as baseline + 16 × 10 MiB + 2 × T006's measured peak + 30% (at least 1 GB); the staging checks from ADR-0011 section 5 (backdated windowed URLs with task-role credentials, and the fallback); and a purge operations placeholder for T027
  - **Owner**: devops · **Branch**: `chore/003-photo-runtime` · **Size**: S · **Depends on**: T006 · **Status**: todo
  - **Acceptance criteria**:
    - Given the built API image, When `node -e "import('sharp').then(s => console.log(s.default.versions))"` runs in it, Then it prints the libvips version and exits 0 (R-3).
    - Given the runbook, Then it lists every bucket setting and IAM action from ADR-0011 section 1, states the memory figure and how it was derived, and states that no cloud resource is created without human approval (plan OQ-1).

---

## Phase 3: User Story 1 - Add photos to my space (P1)

**Goal**: an owner adds photos with progress, failure and retry, and describes them.

**Independent test**: spec US1 (3 valid files and 1 too large on a draft space).

- [ ] T008 [US1] Add `apps/api/src/photos/` (`photos.module.ts`, `space-photos.controller.ts`, `space-photos.service.ts` `add`, `space-photos.schemas.ts`, `upload-semaphore.ts`) for `POST /api/owner/spaces/{spaceId}/photos`; add the problem types and registry copy; regenerate `apps/api/openapi.json`; write `apps/api/test/photos.int-spec.ts` first
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-upload-api` · **Size**: M · **Depends on**: T002, T004, T005, T006 · **Status**: todo
  - **Scope**: contracts/photos.md "Upload" and contracts/README.md; ADR-0011 sections 2, 3, 7, 8 and 9; research R-2, R-3, R-6, R-7. Multer memory storage with `fileSize` 10 MiB, `files: 1`, `fields: 0`, `parts: 1`. Lock order: `lock_timeout`, then the space row `FOR UPDATE` scoped by `owner_id`. The basic count check (409 at 10) is here; the concurrency proof is T028. Logs per contract, never the file name.
    - **(T001)** `OriginGuard` is a reusable guard in `apps/api/src/common/` (with its own spec).
    - `upload-limits.ts` holds admission (16 in flight, immediate 503 `photo:busy`) and the processing semaphore (2, 20 s wait). Guards and admission run before multer reads the body.
    - `bootstrap.ts` sets `server.requestTimeout = 120_000`.
    - The photo id is generated before the intent insert.
    - The intent delete is `WHERE photo_id AND reason = 'abandoned_upload' AND last_attempt_at IS NULL` and must delete exactly one row, otherwise roll back with 503.
    - On any failure after the intent insert, set its `due_at = now()`. There is no inline storage delete.
    - A storage error maps to 503 `photo:busy`.
  - **Acceptance criteria**:
    - Given an owner and a valid JPEG, PNG or WebP, When uploaded, Then 201 `OwnerSpacePhoto` at position `n + 1`, both objects exist in storage, and no purge row is left (AC 1.6, FR-006).
    - Given the first photo of a space, Then its position is 1 (cover, AC 1.6).
    - Given a GPS-tagged JPEG with orientation 6, When uploaded, Then the stored `display` object has no EXIF, XMP or IPTC and is portrait (AC 1.8, FR-013, FR-014, SC-005).
    - Given an 11 MiB file, Then 413 `photo:too-large`; a GIF, Then 415 `photo:unsupported-format`; a 700 px image, Then 422 `photo:dimensions-out-of-range`; corrupt bytes, Then 422 `photo:unreadable`; no `file` part or an extra field, Then 400; and in every case no row and no object remain (AC 1.4, FR-003, FR-006, edge).
    - Given another owner's space or a random UUID, Then 404 with the same body; a renter, Then 403; an `Origin` not in `TRUSTED_ORIGINS`, Then 403 (FR-011, AC 3.6, R-2).
    - Given a space with 10 photos, When one more is uploaded, Then 409 `photo:limit-reached` with `limit: 10`, no row is added, and its intent row is due now (the sweep in T024 removes its objects) (FR-002).
    - Given storage is unreachable after processing, Then 503 `photo:busy` with `Retry-After`, no row exists, and the intent row is due now (R-7).
    - **(T001)** Given an unauthenticated request, a renter, or a foreign `Origin`, When a 10 MiB body is sent, Then the error is returned without multer reading the body (assert that multer's storage handler is never called).
    - **(T001)** Given 16 uploads in flight in the process, When a 17th arrives, Then it gets 503 `photo:busy` with `Retry-After` at once.
    - **(T001)** Given an intent already claimed by the sweep (`last_attempt_at` set), When the insert transaction runs, Then it rolls back with 503 and no photo row exists.
    - Given a draft space, Then upload succeeds (photos are allowed in any status, FR-001); Given a space with no photos, When it is published, Then publish still succeeds (FR-012).

- [ ] T009 [US1] Add `GET /api/owner/spaces/{spaceId}/photos` and `PATCH /api/owner/spaces/{spaceId}/photos/{photoId}` (`space-photos.service.ts` `list`, `describe`); regenerate `openapi.json`; extend `photos.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-list-api` · **Size**: S · **Depends on**: T008 · **Status**: todo
  - **Scope**: contracts/photos.md; research R-4, R-8. `altText` computed on read. `photoUrlsExpireAt` from the signing window.
  - **Acceptance criteria**:
    - Given a space with 3 photos, When the owner lists them, Then `items` are in position order with signed `card` and `display` URLs, `limit: 10` and `photoUrlsExpireAt` (FR-004 count, FR-020, AC 4.1).
    - Given a draft or unpublished space, When the owner lists, Then all its photos are returned (FR-020).
    - Given a photo without a description in "London HQ" at position 2, Then `altText` is "London HQ photo 2"; When the space is renamed "City HQ", Then it is "City HQ photo 2" (FR-008, edge).
    - Given `PATCH` with `"  Quiet zone  "`, Then the description is "Quiet zone" and `altText` equals it; with `""` or `null`, Then the description is `null`; with 151 characters or a bidi-override character, Then 400 (AC 1.7, FR-008).
    - Given a description containing `<script>`, Then it is stored and returned as plain text, unchanged (edge).
    - Given another owner's space or photo, Then 404 (FR-011); Given any response, Then no original file name appears (FR-015).

- [ ] T010 [P] [US1] Add `packages/api-client/src/upload.ts` (`uploadSpacePhoto`) with `upload.test.ts` and an MSW handler; export it from `src/index.ts`
  - **Owner**: frontend-dev · **Branch**: `feat/003-upload-helper` · **Size**: S · **Depends on**: T008 · **Status**: todo
  - **Scope**: contracts/photos.md "Upload helper"; research R-2. `XMLHttpRequest`, `withCredentials`, progress, abort. Errors parse into the existing `ApiError` / `ProblemDetails`.
  - **Acceptance criteria**:
    - Given a successful upload, When progress events fire, Then `onProgress` receives increasing fractions ending at 1, and the promise resolves with the typed `OwnerSpacePhoto` (AC 1.3).
    - Given a 413 problem response, Then the promise rejects with `ApiError` whose `problem.type` is `urn:bseat:problem:photo:too-large` (AC 1.4).
    - Given a network error, Then it rejects with status 0 and type `urn:bseat:problem:network` (AC 1.4 "connection lost", edge). **(T001)** Given an error response without a problem body (for example a bare 408), Then it rejects with that status and type `urn:bseat:problem:network`.
    - Given the signal aborts mid-upload, Then the request is aborted and the promise rejects with an `AbortError` (AC 1.5).

- [ ] T011 [P] [US1] Write `specs/003-space-photos/ui/01-owner-photos.md` and `specs/003-space-photos/ui.md` (index): the Photos section (navigation position, empty state, list with cover badge, "n of 10", add control, upload queue rows and their states, limit states, description editing, reorder controls, delete dialog copy, leave warning, live-region copy, problem-type copy)
  - **Owner**: ui-ux-designer · **Branch**: `docs/003-ui-owner-photos` · **Size**: M · **Depends on**: T001 · **Status**: todo
  - **Scope**: follows 002 ui/01 conventions (copy, sub-nav pattern section 3.2) and semantic tokens. Every state: default, hover, focus, disabled, loading, empty, error, success (FR-026). Card thumbnails use the 4:3 `card` variant (AQ-3 as decided).
  - **Acceptance criteria**:
    - Given the spec, Then every scenario of US1, US3 and US4 and FR-001 to FR-010 has a described state with exact copy, including each problem type in contracts/README.md and "connection lost".
    - Given reorder, Then a non-drag path (buttons) and its keyboard order and announcements are specified (FR-009, WCAG 2.1.1).
    - Given the delete dialog, Then its copy says deletion is permanent and cannot be undone (AC 3.3).

- [ ] T012 [P] [US2] Write `specs/003-space-photos/ui/02-renter-photos.md` and add it to `ui.md`: cover on result cards, the placeholder, the listing gallery, the large view (controls, "3 of 7", captions, swipe, focus return), loading and image-error states
  - **Owner**: ui-ux-designer · **Branch**: `docs/003-ui-renter-photos` · **Size**: S · **Depends on**: T001 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec, Then AC 2.1 to 2.4 and FR-016, FR-017 have described states, with the placeholder text "No photos yet", and card layouts identical with and without a photo.
    - Given the large view, Then keyboard (arrows, Escape, Tab order), pointer and touch behaviour and focus return are specified, and contrast for captions and controls over photos meets 4.5:1 (FR-026).

- [ ] T013 [US1] Add `apps/web/src/lib/photo-upload/queue.ts` (pure reducer) with `queue.test.ts` written first
  - **Owner**: frontend-dev · **Branch**: `feat/003-upload-queue-model` · **Size**: S · **Depends on**: T011 · **Status**: todo
  - **Scope**: research R-9. No React, no new dependency. States `waiting`, `uploading(percent)`, `processing`, `added`, `failed(reason)`, `not-added(limit)`, `cancelled`; at most 2 concurrent uploads; client pre-check for type and size.
  - **Acceptance criteria**:
    - Given 8 photos and 4 selected files, When queued, Then the first 2 in selection order are `waiting` and the last 2 are `not-added(limit)` (AC 4.3, FR-004).
    - Given a `failed` item, When retried, Then it is `waiting` again with the same file; When dismissed, Then it is removed (AC 1.4).
    - Given an `uploading` item, When cancelled, Then it is `cancelled` and its slot is freed for the next waiting file (AC 1.5).
    - Given upload progress reaches 100% before the response, Then the item is `processing` (AC 1.3).
    - Given a `.heic` file or a 12 MB file, Then it is `failed` at once with the matching reason, without an upload (AC 1.4).
    - Given the PR, Then tests were committed first and changed-line coverage is ≥ 80% (constitution II).

- [ ] T014 [US1] Add `apps/web/src/app/(app)/owner/spaces/[spaceId]/photos/page.tsx`, the "Photos" item in `space-manage-nav.tsx` (+ test), and `space-photo-manager.tsx` and `photo-upload-queue.tsx` (+ tests): list, empty state, "n of 10", add control, upload queue UI, limit states
  - **Owner**: frontend-dev · **Branch**: `feat/003-owner-photos-page` · **Size**: M · **Depends on**: T009, T010, T011, T013 · **Status**: todo
  - **Scope**: ui/01-owner-photos.md. Data through `useSpacePhotosList` and `uploadSpacePhoto`. A polite live region for queue summaries; `progressbar` per uploading file. Refetch the list before `photoUrlsExpireAt`.
  - **Acceptance criteria**:
    - Given any owner space page, Then "Photos" is in the space navigation and reachable by keyboard, with `aria-current` on the Photos page (AC 1.1, FR-001).
    - Given no photos, Then the empty state shows the cover rule, formats and size limit (AC 1.2).
    - Given 3 files chosen, Then each row shows its state and percentage, the live region announces "Photo n of 3 added" and failures, and added photos appear in order with "Cover" on the first (AC 1.3, AC 1.6).
    - Given a failed file, Then the row shows the ui spec copy for its problem type, with Retry and Dismiss (AC 1.4).
    - Given 7 photos, Then the section shows "7 of 10 photos"; Given 10, Then the add control is disabled with the limit message (AC 4.1, AC 4.2).
    - Given loading, error and success states of the list, Then each renders as specified (FR-026).

- [ ] T015 [US1] Add description editing (`photo-description-form.tsx`, React Hook Form + Zod, labelled, `aria-describedby` errors) and the unfinished-upload leave guard (`use-leave-guard.ts`) with tests
  - **Owner**: frontend-dev · **Branch**: `feat/003-photo-describe-leave-guard` · **Size**: S · **Depends on**: T014 · **Status**: todo
  - **Scope**: research R-8, R-9 (check the Next 16 docs with context7 for a supported navigation-block API first).
  - **Acceptance criteria**:
    - Given a photo, When the owner saves a description of up to 150 characters, Then it shows as saved and is used as the image's `alt`; When cleared, Then `alt` falls back to "<space name> photo N" (AC 1.7, FR-008).
    - Given 151 characters, Then the field shows the error tied to it with `aria-describedby`, and nothing is sent.
    - Given an upload in progress, When the owner clicks another space-navigation link or reloads, Then a confirmation appears; confirming cancels unfinished uploads and keeps added photos; cancelling stays on the page (AC 1.9, FR-007).
    - Given no unfinished uploads, Then navigation is not interrupted.

- [ ] T016 [US1] Write `apps/web/e2e/photos-owner.spec.ts` and extend `specs/003-space-photos/test-plan.md`: add, progress, failure and retry, cancel, describe, leave warning, axe; verify a 10 MiB upload through `http://localhost:3000/api`; measure SC-002; confirm SC-005 on stored objects
  - **Owner**: qa-engineer · **Branch**: `test/003-us1-add-photos` · **Size**: M · **Depends on**: T014, T015 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec US1 independent test, When run in e2e with the seed photos and a generated 11 MB file, Then 3 are added, the large one fails with its reason, and the first is the cover (AC 1.1 to 1.6).
    - Given a 10 MiB valid image uploaded through the web origin, Then it is added (the dev rewrite does not cap the body, R-2).
    - Given 20 uploads of 5–10 MB, Then ≥ 95% show "added" within 10 s of upload end (SC-002).
    - Given axe on the Photos section in its empty, uploading, failed, full and described states, Then zero WCAG 2.1 AA violations (SC-008, FR-026).
    - Given every US1 AC, Then the test plan maps it to at least one passing test.

- [ ] T017 [US1] Docs: README feature list, user-facing help for adding photos (formats, size, descriptions), and a changeset
  - **Owner**: docs-writer · **Branch**: `docs/003-us1-add-photos` · **Size**: S · **Depends on**: T016 · **Status**: todo
  - **Acceptance criteria**:
    - Given the README, Then it states the accepted formats, size and pixel limits, and that descriptions are the text alternative (Assumptions).
    - Given `bin/pnpm changeset status`, Then a changeset for `@bseat/api` and `@bseat/web` exists.

---

## Phase 4: User Story 2 - See what a space looks like (P1)

**Goal**: renters see covers on cards and a gallery on the listing page; photos of unpublished spaces never show.

**Independent test**: spec US2 (one published space with 4 photos, one with none).

- [ ] T018 [US2] Add `cover` and `photoUrlsExpireAt` to `ListingSummary` / `ListingSearchResults`, and `photos` and `photoUrlsExpireAt` to `Listing`, in `apps/api/src/listings/` (schemas, service: the cover `LEFT JOIN`, the photo read); regenerate `openapi.json`; write `apps/api/test/listings-photos.int-spec.ts` first
  - **Owner**: backend-dev · **Branch**: `feat/003-listing-photos-api` · **Size**: M · **Depends on**: T009 · **Status**: todo
  - **Scope**: contracts/photos.md "Renter additions"; research R-4, R-5. Additive fields only. Search stays one query per page.
  - **Acceptance criteria**:
    - Given a published space with 4 photos and one with none, When a renter searches, Then the first item's `cover` has the position-1 `altText` and a `card` URL only (no `display` URL anywhere in the search response), and the second's `cover` is `null` (AC 2.1, AC 2.2, AC 2.7, FR-016, FR-018).
    - Given the listing detail, Then `photos` has 4 items in position order with descriptions, `altText`, `card` and `display` (AC 2.3, FR-017).
    - Given a draft or unpublished space with photos, Then search does not return it and the detail is 404, as in 002 (AC 2.5, FR-019).
    - Given `PHOTO_URL_TTL_SECONDS=2`, When a cover URL from a search is fetched after the space is unpublished and the TTL has passed, Then 403 (FR-019, SC-007).
    - Given the owner reorders or deletes a photo, When the renter reads again, Then the response reflects it (FR-021).
    - Given an unauthenticated request, Then 401 (FR-022).

- [ ] T019 [US2] Add `apps/web/src/components/space-photo.tsx` (an image via `next/image` with width and height, the "No photos yet" placeholder, one refetch on load error) with tests; show the cover on cards in `listing-results.tsx`; **(T001)** set `images: { unoptimized: true }` globally in `apps/web/next.config.ts`, with no `remotePatterns` (ADR-0011 section 6)
  - **Owner**: frontend-dev · **Branch**: `feat/003-find-card-cover` · **Size**: S · **Depends on**: T012, T018 · **Status**: todo
  - **Scope**: ui/02-renter-photos.md; research R-10. Refetch search results before `photoUrlsExpireAt`.
  - **Acceptance criteria**:
    - Given a result with a cover, Then the card shows the image with `alt` = `altText` and the `card` URL (AC 2.1, AC 2.7).
    - Given a result without one, Then the placeholder is shown, is announced as "No photos yet", and the card has the same size and layout (AC 2.2, FR-016).
    - Given an image fails to load, Then the results query is refetched once, and on a second failure the placeholder is shown (R-4).
    - **(T001)** Given the rendered card, Then the `<img>` `src` is the signed storage URL itself (never `/_next/image`), and `next.config.ts` has `images.unoptimized: true` and no `remotePatterns`.
    - Given loading, empty, error and success states of the results, Then each still renders as in 002 with the cover added (FR-026).

- [ ] T020 [US2] Add `listing-gallery.tsx` and `photo-lightbox.tsx` (`@bseat/ui` Dialog, arrow keys, buttons, pointer swipe, "n of m", captions, focus return) with tests, and show the gallery or placeholder in `listing-details.tsx`
  - **Owner**: frontend-dev · **Branch**: `feat/003-listing-gallery` · **Size**: M · **Depends on**: T012, T018, T019 · **Status**: todo
  - **Scope**: ui/02-renter-photos.md; research R-10. No new dependency.
  - **Acceptance criteria**:
    - Given a listing with 7 photos, Then the gallery starts with the cover, shows "7 photos", and shows captions for described photos only (AC 2.3, FR-017).
    - Given the third photo is opened, Then the large view shows it uncropped with "3 of 7"; ArrowRight and ArrowLeft, the Next and Previous buttons, and a horizontal swipe move between photos; Escape and Close return focus to the third thumbnail (AC 2.4).
    - Given a listing without photos, Then the placeholder shows in the gallery's place, and the rest of the page is unchanged (AC 2.2, FR-017).
    - Given the gallery's thumbnails, Then they use the `card` URL, and only the main image and the large view use `display` (FR-018).

- [ ] T021 [US2] Write `apps/web/e2e/photos-renter.spec.ts`: covers, placeholder, gallery by keyboard, pointer and touch emulation, focus return, axe on results, listing and the open large view; measure SC-003 and SC-004 under throttling; unpublish hides photos
  - **Owner**: qa-engineer · **Branch**: `test/003-us2-renter-photos` · **Size**: M · **Depends on**: T019, T020 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec US2 independent test, When run, Then every AC 2.1 to 2.7 passes.
    - Given a results page of 20 spaces with covers on a 10 Mbit/s profile, Then all covers appear within 2 s in ≥ 95% of 20 loads, and card image bytes total ≤ 2 MB (SC-003).
    - Given a listing with 10 photos on 10 Mbit/s, Then the first gallery image appears within 2 s in ≥ 95% of 20 loads (SC-004).
    - Given the owner unpublishes, When the renter reloads, Then the space and its photos are gone (AC 2.5, edge).
    - Given axe, Then zero WCAG 2.1 AA violations on the results, the listing and the open large view (SC-008).

- [ ] T022 [US2] Docs: README renter section (covers, gallery), the URL expiry behaviour in the API docs, changeset
  - **Owner**: docs-writer · **Branch**: `docs/003-us2-renter-photos` · **Size**: S · **Depends on**: T021 · **Status**: todo
  - **Acceptance criteria**:
    - Given the docs, Then they state that photos show only for published spaces and that photo addresses expire within 1 hour (FR-019).

---

## Phase 5: User Story 3 - Arrange and remove photos (P2)

**Goal**: owners reorder (cover first) and delete permanently; deleted objects are purged within 24 hours.

**Independent test**: spec US3 (5 photos; keyboard move 4th to first; delete the 2nd).

- [ ] T023 [US3] Add `PUT /api/owner/spaces/{spaceId}/photos/order` and `DELETE /api/owner/spaces/{spaceId}/photos/{photoId}` (`reorder`, `remove`: renumber, purge row; no enqueue, see T024); regenerate `openapi.json`; write `apps/api/test/photos-arrange.int-spec.ts` first
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-reorder-delete-api` · **Size**: M · **Depends on**: T009 · **Status**: todo
  - **Scope**: contracts/photos.md; ADR-0011 sections 7 to 9; research R-6, R-7. Lock order per ADR-0009 9.3 rows (data-model.md). **(T001)** Reorder and the renumber are each one `UPDATE` statement, with no `SET CONSTRAINTS`. Delete inserts the purge row and enqueues nothing; the sweep is T024.
  - **Acceptance criteria**:
    - Given 5 photos, When the order puts the 4th first, Then positions are 1..5 in the new order, and the new first is the cover in the owner list and the listing (AC 3.1, AC 3.2, FR-009).
    - Given an order that misses an id, repeats one or contains a foreign id, Then 409 `photo:order-stale` and nothing changes (FR-009, edge).
    - Given photo 2 of 5 is deleted, Then 204, the rest are 1..4 in the same order, a `deleted` purge row is due now, and the id is 404 afterwards (AC 3.4, FR-010).
    - Given the cover is deleted, Then the old position 2 becomes the cover; Given the last photo is deleted, Then the list is empty (AC 3.4, AC 3.5).
    - Given a reorder and a delete race on the same space (20 runs), Then each run ends with gap-free positions, every remaining photo once, and no 5xx (edge, R-6).
    - Given another owner's space or photo, Then 404; a renter, Then 403 (AC 3.6, FR-011).

- [ ] T024 [US3] Register the `photo-purge` queue and add `apps/api/src/photos/photo-purge.processor.ts`: **(T001)** a single sweep, run by a BullMQ job scheduler every 5 minutes (`upsertJobScheduler` at boot). It claims up to 100 due, unleased rows with a lease (`attempts + 1`, `last_attempt_at = now()`, `FOR UPDATE SKIP LOCKED`, its own short transaction), commits, deletes both keys with `deleteObject`, then deletes each finished row, and repeats while full batches remain. It logs `photo.purge_overdue` at `error` for rows more than 12 hours past `due_at`. Write `apps/api/test/photo-purge.int-spec.ts` first
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-purge` · **Size**: M · **Depends on**: T023 · **Status**: todo
  - **Scope**: ADR-0011 section 9; data-model.md "Sweep claim". The sweep also purges T008's abandoned-upload intents once due. No transaction is held open across storage calls, and there is no per-row job.
  - **Acceptance criteria**:
    - Given a deleted photo, When the sweep runs, Then both objects are gone from storage and the purge row is deleted (FR-010).
    - Given an upload intent whose `due_at` has passed (the API "crashed" after the put), When the sweep runs, Then its objects are gone and the row is deleted (R-7).
    - Given storage fails once, Then the row stays with `attempts` 1 and is skipped until its 10-minute lease ends, and the next sweep after that succeeds.
    - Given a sweep crashes after the claim, before the deletes, Then the row is picked up again once the lease ends (FR-010 holds within 24 h).
    - Given the sweep processes an intent, Then a racing insert transaction for that photo rolls back (T008 rule), and no photo row points to deleted objects.
    - Given a row overdue by more than 12 hours, Then `photo.purge_overdue` is logged at `error` with ids only.
    - Given two sweeps run at once, Then each row is claimed by one of them only (`SKIP LOCKED` and the lease).
    - Given the API boots twice (two tasks), Then exactly one job scheduler exists for the sweep.

- [ ] T025 [US3] Add `photo-reorder-controls.tsx` (drag with pointer events plus "Move earlier", "Move later", "Make cover"; live announcements) and `delete-photo-dialog.tsx` to the Photos section, with tests; handle 409 `photo:order-stale` by refetching with the ui spec message
  - **Owner**: frontend-dev · **Branch**: `feat/003-photo-reorder-delete-ui` · **Size**: M · **Depends on**: T011, T014, T023 · **Status**: todo
  - **Acceptance criteria**:
    - Given 5 photos, When the owner uses only the keyboard to press "Make cover" on the 4th, Then it moves first, focus stays on the moved photo's control, and the live region announces the new position (AC 3.1, AC 3.2, FR-009).
    - Given a drag from position 3 to 1, Then the same order is saved; Given a single photo, Then no reorder controls are offered (edge).
    - Given Delete, Then a dialog with the permanent-deletion copy appears; confirming removes the photo and returns focus to a sensible neighbour; cancelling changes nothing (AC 3.3, AC 3.4).
    - Given a 409 `photo:order-stale`, Then the list refetches and the message from the ui spec is shown.

- [ ] T026 [US3] Write `apps/web/e2e/photos-arrange.spec.ts` (keyboard reorder, drag, delete with confirm, renter sees the new cover, last delete shows the placeholder, axe on the dialog) and confirm purge in the local `storage` service via an integration check that triggers the sweep directly
  - **Owner**: qa-engineer · **Branch**: `test/003-us3-arrange-photos` · **Size**: M · **Depends on**: T024, T025 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec US3 independent test, When run, Then AC 3.1 to 3.6 pass, and the deleted photo's objects are absent from storage after one sweep run (FR-010; normally within 5 minutes, always within 24 hours).
    - Given axe on the Photos section with the reorder controls and the open delete dialog, Then zero WCAG 2.1 AA violations (SC-008).

- [ ] T027 [US3] Docs: purge operations in `docs/runbooks/photo-storage.md` (what `photo.purge_overdue` means, how to inspect `photo_object_purge`, how to trigger a sweep), changeset
  - **Owner**: docs-writer · **Branch**: `docs/003-us3-arrange-photos` · **Size**: S · **Depends on**: T026 · **Status**: todo
  - **Acceptance criteria**:
    - Given the runbook, Then an operator can find overdue purges with a read-only query and knows deletes cannot be undone (FR-010).

---

## Phase 6: User Story 4 - Respect the 10-photo limit (P2)

**Goal**: the limit holds under concurrency and is clear in the UI (UI parts ship in T013 and T014).

**Independent test**: spec US4 (8 photos, choose 4 → 2 added, 2 not added).

- [ ] T028 [US4] Write `apps/api/test/photos-race.int-spec.ts` first (15 concurrent uploads to an empty space), then harden `space-photos.service.ts`: **(T001)** map `23514` on `space_photo_position_range` to 409 `photo:limit-reached`, treat `23505` on `space_photo_position_unique` as a 500 logged at `error` (a service bug, ADR-0011 section 7), log `photo.lock_timeout` on `55P03`, and confirm the semaphore's 503 path
  - **Owner**: backend-dev · **Branch**: `feat/003-photo-limit-race` · **Size**: S · **Depends on**: T008 · **Status**: todo
  - **Acceptance criteria**:
    - Given 15 concurrent valid uploads to a space with 0 photos, When all finish, Then exactly 10 × 201 and 5 × 409 `photo:limit-reached`, positions are 1..10, no 5xx (admission 16 admits all 15), and the 5 losers left no objects after one sweep run (SC-006, AC 4.4, FR-002). Repeat 10 times.
    - Given the processing semaphore is saturated beyond 20 s, Then the request gets 503 `photo:busy` with `Retry-After` (R-3).
    - Given a lock wait beyond `lock_timeout`, Then `photo.lock_timeout` is logged at `warn` with ids only, and the request fails with 500 (ADR-0009 9.4).

- [ ] T029 [US4] Write `apps/web/e2e/photos-limit.spec.ts` (8 photos + 4 chosen → 2 added and 2 "not added"; at 10 the add control is disabled with the limit message; axe on the full state) and re-run the SC-006 race
  - **Owner**: qa-engineer · **Branch**: `test/003-us4-photo-limit` · **Size**: S · **Depends on**: T014, T028 · **Status**: todo
  - **Acceptance criteria**:
    - Given the spec US4 independent test, When run, Then AC 4.1 to 4.3 pass, and AC 4.4 is covered by the passing race test (SC-006).
    - Given axe on the full state, Then zero WCAG 2.1 AA violations (SC-008).

- [ ] T030 [US4] Docs: the 10-photo limit and the "not added" behaviour in the owner help, changeset
  - **Owner**: docs-writer · **Branch**: `docs/003-us4-photo-limit` · **Size**: S · **Depends on**: T029 · **Status**: todo
  - **Acceptance criteria**:
    - Given the owner help, Then it explains the limit and that deleting a photo makes room (AC 4.2).

---

## Phase 7: User Story 5 - Demo spaces come with photos (P3)

**Goal**: credited, free-licensed seed photos attached to the demo spaces, fully offline after commit.

**Independent test**: spec US5 (fresh environment, no internet, seed twice).

- [ ] T031 [P] [US5] Download 9 office and coworking photos (5 for London HQ, 4 for Pune Hub) from Unsplash or Pexels, resize to 1600 px on the long edge, re-encode as JPEG q82 with metadata stripped, and commit them with `CREDITS.md` and `photos.ts` (file → space, position, description) under `apps/api/src/db/seed-photos/`
  - **Owner**: backend-dev · **Branch**: `feat/003-seed-photo-assets` · **Size**: S · **Depends on**: T006 · **Status**: todo
  - **Scope**: research R-11. The machine has internet access (`images.unsplash.com`, `images.pexels.com`). Choose photos without identifiable faces or readable private information. The one-off resize runs in the tools container with sharp; the commands are recorded in `CREDITS.md`, and no download script runs at seed time. Binary files do not count toward the line budget.
  - **Acceptance criteria**:
    - Given the folder, Then it has 9 JPEGs, each 1600 px on the long edge (± 0), without EXIF, XMP or IPTC metadata, and ≤ 500 kB (FR-023).
    - Given `CREDITS.md`, Then every file lists the photographer, profile URL, source page URL, license (Unsplash License or Pexels License, with a link) and retrieval date 2026-10-28 or later (AC 5.4, FR-023).
    - Given `photos.ts`, Then every photo has a description of at most 150 characters, and each space's position 1 is a suitable cover (AC 5.1).

- [ ] T032 [US5] Seed the photos in `apps/api/src/db/seed.ts` / `demo-spaces.ts` through the processing and storage code (a space with zero photos gets its set, others are left alone), and extend `apps/api/test/seed.int-spec.ts`
  - **Owner**: backend-dev · **Branch**: `feat/003-seed-photos` · **Size**: S · **Depends on**: T003, T008, T031 · **Status**: todo
  - **Acceptance criteria**:
    - Given a fresh database and bucket, When the seed runs, Then London HQ has 5 and Pune Hub 4 photos in `photos.ts` order with descriptions, and their objects exist (AC 5.1, FR-024).
    - Given the seed runs twice, Then the counts stay 5 and 4 and no extra objects are written (AC 5.2).
    - Given the seed's code, Then it reads only local files and makes no outbound network call other than to storage and Postgres (AC 5.3, FR-025).

- [ ] T033 [US5] Verify the seed offline (stack started with outbound internet blocked), idempotency, the search covers for both demo spaces, and the credits; record it in the test plan
  - **Owner**: qa-engineer · **Branch**: `test/003-us5-seed-photos` · **Size**: S · **Depends on**: T032 · **Status**: todo
  - **Acceptance criteria**:
    - Given no outbound internet, When `docker compose up` runs from empty volumes, Then the seed completes and a renter's search shows covers for London HQ and Pune Hub (SC-009, AC 5.3).
    - Given the unit and integration suites run with no outbound internet, Then they pass (FR-025).

- [ ] T034 [US5] Docs: README demo-data note with a link to `CREDITS.md`; `docs/runbooks/local-development.md` "reset the Postgres and storage volumes together"
  - **Owner**: docs-writer · **Branch**: `docs/003-us5-seed-photos` · **Size**: S · **Depends on**: T033 · **Status**: todo
  - **Acceptance criteria**:
    - Given the runbook, Then it explains that resetting only one of the two volumes breaks demo images, and how to reset both.

---

## Phase 8: Review and release

- [ ] T035 Security review of the whole photo feature on `dev/003-integration`: multipart handling and limits, Origin check, content sniffing, decompression-bomb limits, metadata stripping, signed URL TTL and windowing, bucket policy and IAM (runbook), purge, dependency additions (`sharp`, AWS SDK) and the CVE bump; report findings as blocker / major / minor / nit to the task-manager, who records them in this file
  - **Owner**: security-reviewer · **Branch**: none (read-only) · **Size**: S · **Depends on**: T016, T021, T026, T029, T033 · **Status**: todo
  - **Acceptance criteria**:
    - Given the review, Then every finding has a severity and an owner, blockers and majors become fix tasks, and the rate-limiting gap (plan Risks) has a recorded decision.

- [ ] T036 Final QA regression on `dev/003-integration` (full `bin/pnpm check`, all e2e and axe, 002 suites unchanged), SC-001 timing (10 photos added, cover changed and described in < 5 minutes on 20 Mbit/s), and the traceability check below
  - **Owner**: qa-engineer · **Branch**: `test/003-final-regression` · **Size**: S · **Depends on**: T035 · **Status**: todo
  - **Acceptance criteria**:
    - Given the full suite, Then everything passes, including every 002 test (no regression).
    - Given SC-001, Then a scripted owner run completes in under 5 minutes.
    - Given the traceability table, Then every AC, FR and SC maps to at least one passing test.

- [ ] T037 Docs release: README overview, `docs/adr/README.md` index check, changesets, and a merge-order note (003 after 002) in the PR description template for `dev/003-integration`
  - **Owner**: docs-writer · **Branch**: `docs/003-release` · **Size**: S · **Depends on**: T036 · **Status**: todo
  - **Acceptance criteria**:
    - Given the release docs, Then they list the new env variables, the `storage` service, ADR-0011, and that 003 merges into `main` only after 002.

---

## Traceability (spec → tasks)

| Spec item                             | Tasks                  | Spec item | Tasks                  |
| ------------------------------------- | ---------------------- | --------- | ---------------------- |
| AC 1.1                                | T014, T016             | FR-001    | T008, T014             |
| AC 1.2                                | T011, T014, T016       | FR-002    | T005, T008, T028       |
| AC 1.3                                | T010, T013, T014, T016 | FR-003    | T006, T008             |
| AC 1.4                                | T008, T010, T013, T014 | FR-004    | T009, T013, T014       |
| AC 1.5                                | T010, T013, T016       | FR-005    | T010, T013, T014       |
| AC 1.6                                | T008, T014             | FR-006    | T008, T024             |
| AC 1.7                                | T009, T015             | FR-007    | T015                   |
| AC 1.8                                | T006, T008             | FR-008    | T009, T015             |
| AC 1.9                                | T015, T016             | FR-009    | T023, T025             |
| AC 2.1                                | T018, T019, T021       | FR-010    | T023, T024, T025, T026 |
| AC 2.2                                | T018, T019, T020       | FR-011    | T008, T009, T023       |
| AC 2.3                                | T018, T020             | FR-012    | T008                   |
| AC 2.4                                | T020, T021             | FR-013    | T006, T008, T016       |
| AC 2.5                                | T018, T021             | FR-014    | T006, T008             |
| AC 2.6                                | T018                   | FR-015    | T009                   |
| AC 2.7                                | T018, T019             | FR-016    | T018, T019             |
| AC 3.1, AC 3.2                        | T023, T025, T026       | FR-017    | T018, T020             |
| AC 3.3                                | T011, T025             | FR-018    | T006, T018, T019, T020 |
| AC 3.4                                | T023, T024, T025       | FR-019    | T004, T018, T021       |
| AC 3.5                                | T023, T026             | FR-020    | T009                   |
| AC 3.6                                | T008, T009, T023       | FR-021    | T018, T019             |
| AC 4.1, AC 4.2                        | T009, T014, T029       | FR-022    | T018                   |
| AC 4.3                                | T013, T014, T029       | FR-023    | T031                   |
| AC 4.4                                | T028, T029             | FR-024    | T032                   |
| AC 5.1, AC 5.2                        | T031, T032             | FR-025    | T032, T033             |
| AC 5.3                                | T032, T033             | FR-026    | T016, T021, T026, T029 |
| AC 5.4                                | T031                   | SC-001    | T036                   |
| Edge: format by content               | T006, T008             | SC-002    | T016                   |
| Edge: corrupt, huge, tiny, animated   | T006, T008             | SC-003    | T021                   |
| Edge: connection lost, session ends   | T010, T013, T014       | SC-004    | T021                   |
| Edge: reorder vs delete               | T023                   | SC-005    | T006, T008, T016       |
| Edge: duplicate upload                | T008 (allowed, counts) | SC-006    | T028, T029             |
| Edge: portrait on card                | T006, T019             | SC-007    | T008, T018, T023       |
| Edge: rename, markup                  | T009                   | SC-008    | T016, T021, T026, T029 |
| Edge: one photo, unpublish, republish | T018, T021, T025       | SC-009    | T033                   |

## Dependencies & execution order

Waves (a task starts when everything it depends on is merged; tasks in one wave can run in parallel):

| Wave | Tasks                                             |
| ---- | ------------------------------------------------- |
| 0    | T001                                              |
| 1    | T002, T003 (devops first), T005, T006, T011, T012 |
| 2    | T004, T007, T013, T031                            |
| 3    | T008                                              |
| 4    | T009, T010, T028, T032                            |
| 5    | T014, T018, T023, T033                            |
| 6    | T015, T019, T024, T025, T029, T034                |
| 7    | T016, T020, T026, T030                            |
| 8    | T017, T021, T027                                  |
| 9    | T022, T035                                        |
| 10   | T036                                              |
| 11   | T037                                              |

- **devops first**: T002 and T003 are the first tasks dispatched after T001. T008 (the upload route) cannot start
  before T002, so the CVE fix ships before multer becomes reachable.
- **Contract before consumers**: T010, T014 and T025 consume the clients regenerated by T008, T009 and T023;
  T019 and T020 consume T018's.
- **UI specs before UI tasks**: T013, T014, T015 and T025 depend on T011 (T015 via T014); T019 and T020 on T012.
- **Parallel after T001**: T002, T003, T005, T006, T011, T012. After T008: T009, T010, T028 (and T032 once T031 is
  in). After T009: T018 and T023 in parallel.

## Implementation strategy

1. **MVP (US1 + US2, P1)**: T001 to T022. Owners can add and describe photos, renters see covers and galleries, and
   the privacy and visibility rules hold. This is demoable with 002.
2. **P2**: US3 (T023 to T027) and US4 (T028 to T030) can run side by side once T009 is in.
3. **P3**: US5 seed (T031 to T034). T031 can start right after T006, so demo data is ready early.
4. **Release**: T035 to T037 on `dev/003-integration`, then a human merges 003 into `main` after 002.

## Notes

- One task = one branch = one PR, under about 400 hand-written changed lines. Conventional Commits with an `api`,
  `web`, `db`, `ui`, `infra` or `docs` scope. A changeset in each user-visible PR.
- **PR line budget**: the 002 AQ-4 rule applies: `apps/api/openapi.json`, `apps/api/drizzle/meta/**`,
  `pnpm-lock.yaml` and generated client files are excluded; migration SQL counts. Binary seed photos (T031) are
  excluded too. The PR states both numbers.
- **Reviews**: every PR also gets code-reviewer and security-reviewer per the workflow (one round, then re-check
  only blocker and major fixes). T035 is the feature-level security pass on the integrated branch.
- **Lock order**: every photo writer follows ADR-0009 section 9.3 as amended by T001: `SET LOCAL lock_timeout`,
  then the space row `FOR UPDATE`, then photo rows. No storage I/O while locks are held.
- **Tests first** for business logic: T004 (signing window), T005 (constraints), T006 (processing), T008, T013,
  T018, T023, T024, T028. The PR shows the failing-test commit.
- **New dependencies** (justified in research R-1 and R-3): `sharp` (T006), `@aws-sdk/client-s3` and
  `@aws-sdk/s3-request-presigner` (T004). Any other new dependency must be raised with the task-manager first.
- **Parallel clones**: a backend task in a clone overrides `DATABASE_URL_TEST` and `S3_BUCKET_PHOTOS_TEST`
  (R-12). e2e runs only in the main checkout.
- **Architect decisions (T001)**: ADR-0011 is the reference for every photo task. Where research.md and ADR-0011
  disagree, ADR-0011 wins.
- **Migrations**: T005 generates on the latest `dev/003-integration`; if 002 lands a migration first, regenerate
  before merging. Never edit a merged migration.
- **No cloud resources** are created by any task (plan OQ-1).

## Open questions (human decision needed)

- **OQ-1** (plan): AWS bucket and IAM creation waits for human approval and the IaC decision (ADR-0007). No 003
  task needs it.
- **OQ-2** (plan): confirmed by the human. `dev/003-integration` is cut from `dev/002-integration`.
- Architect questions AQ-1 to AQ-10 were answered in T001 (plan.md "Architect verdict").
