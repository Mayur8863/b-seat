# Implementation Plan: Space photos

**Branch**: `spec/003-space-photos` (planning branch; each task gets its own branch, see tasks.md) | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-space-photos/spec.md` (Approved by the requester, 2026-10-28;
FR-019 clarified as option B)

**Architect verdict**: **Approved by architect (2026-10-28)**, with the amendments below. They are recorded in
[ADR-0011](../../docs/adr/0011-space-photo-storage.md) (Accepted), in
[ADR-0007](../../docs/adr/0007-aws-deployment-target.md) (an object storage line) and in
[ADR-0009](../../docs/adr/0009-pass-bookings-seat-holds-and-slots.md) section 9.3 (the photo writers).
data-model.md, contracts/ and tasks.md are already updated to match. research.md keeps the original proposals,
with a note at the top.

No blocking question is open. OQ-2 is confirmed (`dev/003-integration` is cut from `dev/002-integration`). OQ-1
(the AWS bucket and IAM) stays with the human, and no 003 task needs it.

Amendments:

1. **Local storage (AQ-1, AQ-9):** MinIO is **not** the default.
   - Upstream archived its repository on 2026-04-25 and publishes no new community binaries, so a pinned image
     would never get a fix.
   - The compose service is a product-neutral `storage`. T003 picks a maintained, permissively licensed
     S3-compatible server, with SeaweedFS as the first candidate, and checks it against ADR-0011's conformance
     list (presigned GET with enforced expiry, path-style addressing, `response-*` overrides, idempotent
     `DeleteObject`, anonymous GET refused, offline, pinned).
   - MinIO's last community image is only a recorded fallback.
2. **Upload bounds (AQ-2):** the rule is "nothing reads the body before the guards". The order is `AuthGuard`,
   `RolesGuard`, `OriginGuard`, then admission (at most 16 uploads in flight per process, else an immediate 503
   `photo:busy`).
   - 16 lets SC-006's 15 racing uploads all reach the count check.
   - `server.requestTimeout` is 120 s.
   - `/api` must never be added to the `proxy.ts` matcher, because Next would silently truncate bodies over
     10 MB.
3. **CSRF (AQ-7):** the Origin check is a reusable `OriginGuard` in `apps/api/src/common/`, applied to the upload
   route only. Global use is a T035 decision.
4. **sharp (AQ-3, AQ-4):**
   - **No `allowBuilds` entry**: sharp 0.35.5 has no install script, so the proposed `sharp: false` would do
     nothing.
   - APNG (an `acTL` chunk) is refused, because libvips does not report it as animated.
   - `failOn: 'error'`, a 15 s sharp `timeout`, and `limitInputPixels` 50 MP as a backstop.
   - Decode once into a ≤ 1600 px intermediate and derive both variants from it.
   - `card` is **always exactly 640 × 480** and may upscale a small short edge; `display` is never enlarged.
   - The semaphore of 2 is confirmed (below libuv's 4 threads).
   - T006 measures peak RSS on worst-case fixtures, and T007 sizes the task from that (at least 1 GB, 2 GB
     expected).
   - No original is kept. The cost is accepted and recorded in ADR-0011's Consequences.
5. **Signed URLs (AQ-6):**
   - Presigned now, CloudFront as a follow-up ADR.
   - `PHOTO_URL_TTL_SECONDS` is an integer from 2 to 3600, so the tests' TTL of 2 is legal. The plan's 60–3600
     contradicted the tests.
   - Cache headers are `response-cache-control: private` plus a `response-expires` equal to the URL's expiry,
     **not** `max-age=1800`, which could outlive the URL by 30 minutes.
   - One `now` per response, and the port's `signGetUrls` is async.
6. **Web rendering:** `next/image` with **global** `images: { unoptimized: true }` and no `remotePatterns`.
   - The optimizer caches for 4 hours, which breaks FR-019.
   - A raw `<img>` fails lint at `--max-warnings=0`.
   - A future CSP needs the storage origin in `img-src`.
7. **Limit and order (AQ-5):**
   - The CHECK 1–10 and the deferrable-immediate unique are confirmed. Deferrable _is_ needed, so that a
     single-statement permutation does not trip row-by-row checking.
   - **No `SET CONSTRAINTS`**: every reorder and renumber is one `UPDATE`.
   - `23514` on the range maps to 409; `23505` on the unique maps to **500** with an `error` log (a bug, not a
     limit). The space row is locked `FOR UPDATE` with `owner_id` after `lock_timeout`.
8. **Purge (AQ-8): one mechanism.**
   - A BullMQ job scheduler runs a sweep every **5 minutes** with a lease claim (no transaction is held across
     storage calls).
   - The per-delete immediate job and the inline best-effort deletes are dropped: on failure the intent is only
     set due now.
   - The add transaction deletes its intent only `WHERE last_attempt_at IS NULL`, and it must delete exactly one
     row.
   - Purges use per-key `DeleteObject`.
9. **Data model:** `byte_size` is dropped (nothing reads it).
10. **Problem types (AQ-10):** accepted. 503 `photo:busy` also covers a full admission, a storage outage and a
    claimed intent.
11. **T002 (CVE bumps before T008):** confirmed as proposed.

**Base**: 003 stacks on spec 002 (`dev/002-integration`) and merges into `main` after 002 (research R-13).

## Summary

Owners add up to 10 photos to each space from a new **Photos** section in the owner space pages. They see each
upload's progress, retry failures, and describe each photo (the description is the caption and alt text,
defaulting to "<space name> photo N"). They reorder photos (the first is the cover) and delete them permanently.
Renters see the cover on "Find a space" cards and a gallery with a large view on the listing page, or a neutral
placeholder when a space has no photos. Photos of draft or unpublished spaces are never shown to renters, and
every photo address expires within 1 hour. The seeded London HQ and Pune Hub get 9 credited, free-licensed photos
that work offline.

The core design decisions, approved in T001 with the amendments above and recorded in ADR-0011:

1. **S3-compatible object storage** behind a small `StorageService` port: a maintained S3-compatible `storage`
   service in docker-compose (not MinIO, amendment 1), a private S3 bucket in AWS (ADR-0007 gains an object-storage line), and the AWS SDK v3 client ([R-1](./research.md#r-1-storage-adr)).
2. **Uploads go through the API**, one file per `multipart/form-data` request with strict multer limits, because
   the server has to sniff, re-encode and strip metadata anyway (FR-003, FR-013). A hand-written XHR helper in
   `@bseat/api-client` reports upload progress ([R-2](./research.md#r-2-upload-flow-through-the-api-adr)).
3. **sharp** validates by content (still JPEG, PNG or WebP; 800–12,000 px long edge; ≤ 50 MP), auto-orients,
   drops all metadata, and writes two WebP variants: `card` exactly 640 × 480 and `display` ≤ 1600 px. No
   original is kept. Processing is synchronous, behind upload admission (16) and a 2-slot semaphore ([R-3](./research.md#r-3-image-processing-with-sharp-adr)).
4. **Presigned GET URLs expire within 1 hour** (FR-019, option B). They are signed in 30-minute windows so browsers
   can cache them, with the browser cache ending exactly at URL expiry, and embedded additively in the 002 listing responses and the new owner routes
   ([R-4](./research.md#r-4-photo-addresses-short-lived-signed-get-urls-adr-fr-019), [R-5](./research.md#r-5-where-urls-and-photos-appear-in-the-contract)).
5. **The 10-photo limit lives in the database**: `CHECK (position BETWEEN 1 AND 10)` plus a deferrable
   `UNIQUE (space_id, position)`, with every reorder and renumber written as one statement. Every photo writer
   follows the ADR-0009 section 9.3 lock order: `lock_timeout` first, then the space row `FOR UPDATE` ([R-6](./research.md#r-6-the-10-photo-limit-and-order-invariants-under-concurrency-adr)).
6. **Deletion is permanent, and an outbox purges the objects**: the delete transaction writes a
   `photo_object_purge` row, and a BullMQ sweep every 5 minutes removes the objects (amendment 8). The same
   outbox removes objects left by failed or abandoned uploads ([R-7](./research.md#r-7-deletion-purge-within-24-hours-and-abandoned-uploads-adr-fr-010)).
7. **Security hygiene first**: `multer` ≥ 2.5.0 and `body-parser` ≥ 2.4.0 (CVE-2026-113872, CVE-2026-111181)
   land before the upload route ships ([R-14](./research.md#r-14-dependency-cves-before-the-upload-route-ships)).

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 22 LTS (`node:22-bookworm-slim`, glibc)

**Primary Dependencies**: NestJS 12 on Express (multer via `FileInterceptor`), Zod 4, Drizzle ORM 0.45, BullMQ 6,
Next.js 16 / React 19, orval-generated `@bseat/api-client`, `@bseat/ui` (Radix Dialog). **New runtime
dependencies** (justified in R-1 and R-3): `sharp` 0.35.x (already in the lockfile through Next.js),
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. **New dev services** (T003, all pinned): `storage` (a
maintained S3-compatible server; SeaweedFS is the first candidate, ADR-0011 section 1), a one-shot `storage-init`
for the bucket, and a TCP forwarder for e2e.

**Storage**: PostgreSQL 18 (two new tables, data-model.md), S3-compatible object storage (new, ADR-0011), and Redis 8
for the `photo-purge` sweep scheduler.

**Testing**: Vitest unit tests (pure processing, the URL signing window, the upload-queue reducer). Vitest
integration tests on real Postgres, Redis and the local `storage` service (`apps/api/test/photos*.int-spec.ts`). Testing Library + MSW
(components and the XHR helper). Playwright + axe (owner photos, results, gallery and large view). Test images are
generated with sharp, and e2e uploads the committed seed photos. No test touches the internet.

**Target Platform**: Linux containers; ECS Fargate + S3 per ADR-0007 (this feature creates no cloud resources).

**Project Type**: Web application (pnpm/Turborepo monorepo: `apps/api`, `apps/web`, `packages/*`)

**Performance Goals**: a photo is added within 10 s of upload end for 95% of uploads ≤ 10 MB (SC-002); 20 covers
appear in ≤ 2 s on 10 Mbit/s with ≤ 2 MB of photo bytes per results page (SC-003); the first gallery photo appears
in ≤ 2 s (SC-004).

**Constraints**: exactly 10 of 15 concurrent uploads succeed (SC-006). No location or personal metadata in any
stored or served variant (SC-005). URLs stop working within 1 hour of unpublish or delete (FR-019). Objects are
purged within 24 hours (FR-010). WCAG 2.1 AA with zero axe violations (SC-008). PRs stay under about 400
hand-written changed lines (002 AQ-4 rule: generated files and binary seed photos excluded).

**Scale/Scope**: 5 user stories, 26 FRs, 9 SCs. At most 10 photos per space × 2 variants (≈ 0.5 MB stored per
photo). 9 seed photos (≈ 3–4 MB in git). Per API process: at most 16 upload bodies (≈ 160 MiB) and 2 decodes
in flight.

No `NEEDS CLARIFICATION` remains. The spec was approved with every default under Assumptions, and FR-019 was
answered (option B).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (result below)._

| Principle                                 | Status                    | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Spec before code                       | PASS                      | Spec approved 2026-10-28. This plan and tasks.md go to the architect (T001) before any code. Storage is proposed, not decided.                                                                                                                                                                                                                                                                                |
| II. Test-first for business logic         | PASS                      | Processing rules, the signing window and the upload-queue reducer are pure modules whose failing tests come first (T004, T006, T013). DB constraint tests come before service code (T005). Races (SC-006) and metadata stripping (SC-005) are integration tests on real Postgres and the local `storage` service. Every AC maps to a task (tasks.md traceability).                                            |
| III. Contract-first API                   | PASS                      | New owner routes and the listing additions are Zod schemas with `.meta({ id })`, emitted by `gen:api`. Listing changes are additive. Frontend tasks depend on the backend task that regenerates the client. The only hand-written client code is the XHR upload helper, typed with generated types (R-2).                                                                                                     |
| IV. Invariants live in the database       | PASS (one documented gap) | The database enforces at most 10 photos (range CHECK + deferrable-immediate UNIQUE), the description length, the FK to space, the purge reason CHECK and one pending purge per photo. Gap-free positions are a service rule under the space-row lock, covered by integration tests (AQ-5).                                                                                                                    |
| V. Secure and accessible by default       | PASS                      | Owner routes sit behind `AuthGuard` + `RolesGuard` and are scoped by `owner_id` in SQL (404 parity). Bytes are judged by content and re-encoded, metadata is dropped, decompression bombs are capped, multipart gets an Origin check (AQ-7). The bucket is private, URLs live ≤ 1 h, IAM is least-privilege. CVE bumps come first (T002). ui-ux specs come before UI tasks, and axe runs on every new screen. |
| VI. Small, reversible, observable changes | PASS                      | 37 tasks, each S or M. The migration and the contract change are additive. New log events (`photo.added`, `photo.rejected`, `photo.deleted`, `photo.purged`, `photo.purge_overdue`, `photo.lock_timeout`) carry ids and sizes only.                                                                                                                                                                           |

**Technology constraints**: a new datastore (object storage) needs an ADR. ADR-0011 is Accepted (T001). New runtime
dependencies are justified in R-1 and R-3 and listed under Complexity Tracking.

**Post-design re-check (after Phase 1)**: PASS. data-model.md and contracts/ add nothing beyond the items in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-space-photos/
├── spec.md              # Approved spec
├── plan.md              # This file
├── research.md          # Phase 0: R-1 … R-14
├── data-model.md        # Phase 1: space_photo, photo_object_purge, objects, lock-table rows
├── quickstart.md        # Phase 1: validation guide
├── contracts/           # Phase 1: README.md (routes, problems), photos.md (schemas, helper, env)
├── checklists/requirements.md
├── ui.md + ui/          # T011, T012 (ui-ux-designer)
└── tasks.md             # Phase 2
```

### Source code (repository root)

```text
apps/api/
├── src/storage/                 # StorageModule, StorageService (two S3 clients), url-signing.ts (+ spec)
├── src/photos/                  # controller, service, schemas, photo-processing.ts (+ spec),
│                                #   upload-limits.ts (admission + semaphore), photo-purge.processor.ts, photos.module.ts
├── src/common/origin.guard.ts   # OriginGuard (reusable; applied to the upload route only, ADR-0011 section 3)
├── src/db/schema/photo.ts       # space_photo, photo_object_purge
├── src/db/seed-photos/          # 9 JPEGs, CREDITS.md, photos.ts (T030); seed wiring in seed.ts (T031)
├── src/listings/                # cover + photos in ListingSummary / Listing (T018)
├── src/config/env.ts            # S3_*, PHOTO_URL_TTL_SECONDS
├── src/bootstrap.ts             # server.requestTimeout = 120 s (T008)
├── drizzle/00NN_space_photos.sql
└── test/photos.int-spec.ts, photos-race.int-spec.ts, photo-purge.int-spec.ts, storage.int-spec.ts
packages/api-client/src/upload.ts  # uploadSpacePhoto (XHR, progress, abort) + test
apps/web/
├── src/app/(app)/owner/spaces/[spaceId]/photos/page.tsx
├── src/lib/photo-upload/queue.ts (+ test)         # pure upload-queue reducer
├── src/components/space-photo-manager.tsx, photo-upload-queue.tsx, photo-reorder-controls.tsx,
│   delete-photo-dialog.tsx, space-photo.tsx (image + placeholder), listing-gallery.tsx, photo-lightbox.tsx
├── src/components/space-manage-nav.tsx            # + "Photos"
├── src/components/listing-results.tsx, listing-details.tsx   # cover, gallery
└── e2e/photos-owner.spec.ts, photos-renter.spec.ts, photos-seed.spec.ts
docker-compose.yml               # storage, storage-init, storage-forward (e2e profile)
pnpm-workspace.yaml              # overrides (T002); no allowBuilds entry for sharp (no install script)
apps/web/next.config.ts          # images: { unoptimized: true }, no remotePatterns (T019)
.env.example                     # S3_*, PHOTO_URL_TTL_SECONDS
docs/adr/0011-space-photo-storage.md, docs/adr/0007 (object storage line), docs/adr/0009 (9.3 rows)
docs/runbooks/local-development.md, docs/runbooks/photo-storage.md
```

**Structure Decision**: the existing monorepo layout. Photos get their own API module (`photos`) and a storage
module, so the S3 dependency stays in one place. Web code follows 002's patterns: a pure reducer for the stateful
editor (like the layout editor model) and components in `src/components`.

## Architect questions (for T001 and ADR-0011)

| #     | Question                                                                                                                                                                                              | Proposal (research)                                     | Decision (T001, ADR-0011)                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AQ-1  | Storage: S3-compatible, with MinIO locally and S3 in AWS? Bucket settings and IAM as in R-1?                                                                                                          | Yes (R-1)                                               | S3 + bucket and IAM as in R-1: **yes**. MinIO locally: **no**, a maintained server that passes the conformance list (amendment 1). Per-key `DeleteObject` |
| AQ-2  | Upload through the API (multipart, one file, memory storage) or presigned PUT direct to storage?                                                                                                      | Through the API (R-2)                                   | **Yes**, plus admission 16, guards before the body, `requestTimeout` 120 s, `/api` kept out of `proxy.ts` (amendment 2)                                   |
| AQ-3  | Variants: `card` 640 × 480 cover-crop and `display` ≤ 1600, WebP, no original kept? Card ratio 4:3?                                                                                                   | Yes (R-3)                                               | **Yes**. 4:3 confirmed. `card` is always exactly 640 × 480 (may upscale); decode once; no original (cost accepted, ADR-0011 Consequences)                 |
| AQ-4  | Synchronous processing in the request with a 2-slot semaphore, or a BullMQ processing queue?                                                                                                          | Synchronous (R-3)                                       | **Synchronous**, semaphore 2, 20 s wait, 15 s sharp timeout, APNG check, memory measured (amendment 4)                                                    |
| AQ-5  | Limit and order invariants: range CHECK + deferrable UNIQUE in the DB, with gap-free positions as a service rule? Space row `FOR UPDATE` for every photo writer (ADR-0009 9.3 rows in data-model.md)? | Yes (R-6)                                               | **Yes**, deferrable-immediate with no `SET CONSTRAINTS` (single-statement updates); `23505` → 500. ADR-0009 9.3 rows added (amendment 7)                  |
| AQ-6  | URL delivery: presigned GET with a 30-minute signing window and TTL ≤ 3600 s, an API streaming proxy, or CloudFront later?                                                                            | Presigned now, CloudFront as a follow-up (R-4)          | **Presigned now**, TTL 2–3600, `private` + `Expires` = URL expiry, global `images.unoptimized` on the web (amendments 5, 6). CloudFront: a follow-up ADR  |
| AQ-7  | CSRF on multipart: a route-local `Origin` check, or a global guard for unsafe methods?                                                                                                                | Route-local now, global guard as a later decision (R-2) | **Route-local**, as a reusable `OriginGuard`; global use decided in T035 (amendment 3)                                                                    |
| AQ-8  | Purge: outbox table + immediate job + 15-minute sweep, also for abandoned uploads?                                                                                                                    | Yes (R-7)                                               | Outbox **yes**. **Sweep only**, every 5 minutes, lease claim; no immediate job, no inline deletes (amendment 8)                                           |
| AQ-9  | Local dev and e2e: `S3_PUBLIC_ENDPOINT` = `http://localhost:9000` with a TCP forwarder in the e2e profile? A test bucket per clone?                                                                   | Yes (R-4, R-12)                                         | **Yes**. Integration tests set `S3_PUBLIC_ENDPOINT` to the internal endpoint (the tools container cannot reach the host's `localhost:9000`)               |
| AQ-10 | Problem types and extensions as in contracts/README.md (409, 413, 415, 422, 503)?                                                                                                                     | Yes                                                     | **Yes**, with 503 `photo:busy` widened and `23505` not mapped to 409 (amendment 10)                                                                       |

## Open questions

None for the requester: the spec was approved with every default. Two items needed a human outside this feature's
code:

- **OQ-1 (human, before any AWS deploy)**: creating the S3 bucket and IAM policy is cloud work. ADR-0007 reserves
  that for explicit human approval and the still-open IaC decision. 003 ships everything needed locally and
  documents the AWS settings (T007). It creates no cloud resources.
- **OQ-2 (human, merge order)**: **confirmed by the human (2026-10-28)**. `dev/003-integration` is cut from
  `dev/002-integration`, and 003 merges into `main` only after 002 (R-13).

## Risks

| Risk                                                                                | Mitigation                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload DoS (many large uploads) exhausts API memory or CPU                          | Guards before the body, admission 16 + 503, multer limits, `requestTimeout` 120 s, a 2-slot semaphore, `limitInputPixels`, a sharp timeout, measured task memory. Rate limiting is a T035 decision (no limiter exists yet) |
| Local S3 server diverges from S3 (signature, expiry, `response-*` headers)          | ADR-0011 conformance list, checked in T003 and automated in T004's `storage.int-spec.ts`; the T007 staging check on real S3                                                                                                |
| Someone adds `/api` to the `proxy.ts` matcher, and Next truncates uploads silently  | ADR-0011 section 2; T016's 10 MiB upload through the web origin catches it                                                                                                                                                 |
| Presigned URLs signed with temporary task-role credentials die early in AWS         | Verify in staging (T007, R-4); fall back to unwindowed signing; CloudFront later                                                                                                                                           |
| 002 adds a migration after T005 generates 003's                                     | Regenerate T005's migration before it merges (R-13); never edit a merged one                                                                                                                                               |
| Storage and Postgres volumes drift (one reset, not the other), breaking seed images | Runbook: reset both (T034); the seed is idempotent per space                                                                                                                                                               |
| sharp native binaries missing on a new platform (musl, another arch)                | All images are glibc; T007 checks the production image; R-3 notes the musl setting                                                                                                                                         |
| A tab left open shows images whose URLs have expired                                | `photoUrlsExpireAt` drives the refetch, and an `<img>` error refetches once (R-4)                                                                                                                                          |

## Complexity Tracking

| Item                                                                             | Why needed                                                                                                       | Simpler alternative rejected because                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| New datastore: object storage (local S3-compatible server / S3)                  | Photos are large binary files read on every search page                                                          | `bytea` in Postgres bloats RDS and backups and routes every image byte through the API (R-1)                |
| New dependencies: `sharp`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Content validation, re-encoding and metadata stripping (FR-003, FR-013); S3 access and SigV4 presigning (FR-019) | Pure-JS image libraries are slow and weak on WebP; hand-written SigV4 is security-sensitive code (R-1, R-3) |
| Outbox table for purges                                                          | FR-010 (purge within 24 h) must survive storage and Redis outages                                                | Inline deletes leak objects or fail the request when storage is down (R-7)                                  |
| Hand-written XHR upload helper in the api-client                                 | Upload progress (AC 1.3) is impossible with `fetch`                                                              | The generated `fetch` mutator has no upload progress (R-2)                                                  |
