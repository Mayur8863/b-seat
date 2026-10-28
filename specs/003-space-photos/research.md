# Research: Space photos (003)

Phase 0 of [plan.md](./plan.md). Each item ends in a **proposed** decision. The architect confirms, changes or
rejects each one in T001 and records the result in ADR-0011 and the plan verdict. Items marked **(ADR)** go into
ADR-0011.

> **Architect review (T001, 2026-10-28).** The proposals below were reviewed, and the decisions are recorded in
> [ADR-0011](../../docs/adr/0011-space-photo-storage.md). **Where this file and ADR-0011 disagree, ADR-0011 wins.**
> The items below are kept as written, for the record. The changes:
>
> - **R-1:** no MinIO by default (upstream archived on 2026-04-25, no new community binaries). A maintained
>   S3-compatible compose service named `storage` must pass a conformance list (SeaweedFS is the first
>   candidate). Purges use per-key `DeleteObject`. The S3 client has timeouts.
> - **R-2:** upload admission (16 in flight per process) runs before the body is read. `requestTimeout` is
>   120 s. `/api` must stay out of the `proxy.ts` matcher. The Origin check is a reusable `OriginGuard`.
> - **R-3:**
>   - No `allowBuilds` entry for sharp: 0.35.5 has no install script, so "its install script is already
>     skipped" was wrong.
>   - APNG is detected by the `acTL` chunk. A 15 s sharp timeout applies.
>   - The input is decoded once into a ≤ 1600 px intermediate, and both variants come from it. `card` is
>     always 640 × 480 and may upscale.
>   - Peak memory is measured, then the task is sized.
> - **R-4:** `PHOTO_URL_TTL_SECONDS` is 2–3600. The signed headers are `response-cache-control: private` plus a
>   `response-expires` equal to the URL's expiry, not `max-age=1800`. One `now` per response. Web: global
>   `images.unoptimized`, no `remotePatterns`.
> - **R-6:** no `SET CONSTRAINTS`; every reorder and renumber is one `UPDATE`. `23505` maps to 500, not 409.
> - **R-7:** one 5-minute sweep with a lease claim. No per-delete job and no inline deletes. The intent delete is
>   guarded by `last_attempt_at IS NULL`.
> - **R-12:** integration tests set `S3_PUBLIC_ENDPOINT` to the internal endpoint.
> - `byte_size` is dropped from `space_photo`.

Facts checked in the codebase on 2026-10-28 (`dev/002-integration` at `6d0c1b5`):

- The API is NestJS on Express (`@nestjs/platform-express` 12.2.0), which pulls `multer` 2.4.0 and, through
  `express` 5.3.0, `body-parser` 2.3.0. `bootstrap.ts` turns Nest's body parser off for Better Auth and adds a
  100 kB JSON parser. No route takes multipart today.
- `sharp` 0.35.5 is already in the lockfile as Next.js's optional dependency (web only), with prebuilt
  `@img/sharp-*` binaries. `pnpm-workspace.yaml` `allowBuilds` does not list it, so its install script is
  already skipped.
- Every image is `node:22-bookworm-slim` (glibc): tools, `api.Dockerfile` and `web.Dockerfile`. No Alpine Node
  image is used (only Postgres and Redis are Alpine).
- There is no object storage, no CSP on the web app, no `overrides` in the workspace, and no rate limiting.
- Listing reads filter `space.status = 'published'`. A draft or unpublished space is 404 for renters.
- BullMQ is used for mail only (`MailModule`, processor in the API process).
- `apps/web/src/proxy.ts` matches only page routes. `/api/*` reaches the API through a Next rewrite locally and
  through the ALB in AWS (ADR-0004, ADR-0007).
- The e2e container runs with `network_mode: service:web`, so its browser's `localhost` is the web container.

---

## R-1 Storage (ADR)

**Decision (proposed)**: S3-compatible object storage behind a small `StorageService` port. Locally MinIO (pinned
image) in docker-compose, with a one-shot `storage-init` container that creates the private bucket `bseat-photos`.
In AWS one private S3 bucket per environment (ADR-0007 gains an "Object storage" line): Block Public Access on,
bucket-owner-enforced ownership, SSE-S3 encryption, a TLS-only bucket policy, versioning **off** (so a delete is
final, FR-010), a lifecycle rule that aborts incomplete multipart uploads after 1 day, and an ECS task-role policy
limited to `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:…:bseat-photos-<env>/spaces/*`, and
nothing else (keys are derived, so no `ListBucket`). No bucket CORS is needed (R-2, R-5).

Object keys derive from ids, so no key column is stored: `spaces/{spaceId}/{photoId}/card.webp` and
`spaces/{spaceId}/{photoId}/display.webp`. Ids are random UUIDs, so keys are not guessable.

**Client library**: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (v3, modular). They talk to MinIO
with `forcePathStyle: true` and a custom endpoint, and to S3 with the default endpoint and the task role.

**Rationale**: ADR-0007 targets AWS, and S3 is the managed choice there. MinIO gives the same API locally with
no cloud account. Photos do not belong in Postgres (10 × 2 variants × up to ~400 kB per space would bloat
backups and the RDS instance, and every image read would hit the database).

**Alternatives considered**: photos as `bytea` in Postgres (simplest, but heavy on RDS, backups and API
bandwidth); local disk or EFS (not shared across Fargate tasks without EFS, and EFS costs more and is slower than
S3); the `minio` JS client (MinIO-specific, and the AWS SDK works with both).

**New runtime dependencies (constitution: justify)**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (no
S3 client exists in the repo; the SDK is the standard one and works with MinIO). `sharp` (R-3).

## R-2 Upload flow: through the API (ADR)

**Decision (proposed)**: the browser sends **one file per request** as `multipart/form-data` to
`POST /api/owner/spaces/{spaceId}/photos`. The route uses Nest's `FileInterceptor` with multer **memory storage**
and strict limits: `fileSize` 10 MiB (10,485,760 bytes), `files: 1`, `fields: 0`, `parts: 1`. Anything over the
limit is cut off by multer and mapped to 413 `photo:too-large`. The API validates the bytes, processes them
(R-3), writes the variants to storage, and only then inserts the row (R-6). The response is the added photo.

**Why not presigned PUT direct to storage**: FR-013 and the format rules (FR-003) mean the server must read and
re-encode the bytes anyway. A direct PUT would need a quarantine prefix, a "complete" call that downloads the
object back into the API, bucket CORS for PUT, cleanup of abandoned quarantine objects, and a second
storage-side size check (presigned POST policies can cap size; PUT cannot). With a 10 MiB cap, sending the bytes
through the API costs little and keeps one path. **Revisit** if the cap rises well above 10 MiB or upload volume
makes API bandwidth matter.

**Upload progress**: `fetch` has no upload progress, and the web app may not use `fetch` anyway (ESLint bans it in
`apps/web`). A small hand-written `uploadSpacePhoto(spaceId, file, { onProgress, signal })` in
`packages/api-client/src/upload.ts` uses `XMLHttpRequest` against the same-origin `/api` path, returns the
generated `OwnerSpacePhoto` type or throws the existing `ApiError` with `ProblemDetails`. It is exported next to
the generated client, so `apps/web` still talks to the API only through `@bseat/api-client`. The generated orval
function for this route stays unused by the web app (it is still generated, typed and mocked).

**CSRF**: `multipart/form-data` is a CORS "simple" request, so a cross-site form could post it. Better Auth's
session cookie is `SameSite=Lax`, which a cross-site POST does not carry, so the risk is low. As defence in depth
the upload route rejects a request whose `Origin` header is present and not in `TRUSTED_ORIGINS` (403). The
architect decides whether this check is route-local or a global guard for all unsafe methods (AQ-7).

**Local dev proxy**: uploads go through the Next rewrite (`/api/*` → API). T003 verifies a 10 MiB upload
through `http://localhost:3000/api/...` (the rewrite proxy must not cap or buffer the body; if it does, raise the
limit in `next.config.ts` for dev). In AWS the ALB routes `/api/*` straight to the API.

## R-3 Image processing with sharp (ADR)

**Decision (proposed)**: `sharp` 0.35.x as a direct dependency of `@bseat/api`, used only in a pure
`photo-processing.ts` module (no Nest, no I/O), tested first.

1. **Sniff and validate from the bytes** (FR-003). `sharp(buf, { limitInputPixels: 50_000_000, failOn: 'error',
animated: true }).metadata()` reads the header only. Accept `format` ∈ `jpeg | png | webp`; refuse everything
   else (GIF, HEIC/HEIF, AVIF, SVG, TIFF, RAW) as 415 `photo:unsupported-format`. Refuse `pages > 1` (animated
   WebP or APNG) the same way. Refuse a long edge below 800 or above 12,000 pixels, or more than 50 megapixels, as
   422 `photo:dimensions-out-of-range`. A header that cannot be parsed, or a decode failure, is 422
   `photo:unreadable`. The file name and the client's `Content-Type` are ignored. SVG is never accepted, so no
   script can ride in an image.
2. **Normalise**: `.rotate()` with no argument applies the EXIF orientation (FR-014). Then convert to sRGB.
   sharp **drops all metadata by default** (EXIF including GPS, XMP, IPTC, ICC beyond sRGB) unless `withMetadata`
   or `keepMetadata` is called. The module never calls them, and a test asserts that the output has no EXIF, XMP
   or IPTC block (FR-013, SC-005).
3. **Variants** (FR-018), both WebP, never enlarged:
   - `card`: 640 × 480 (4:3), `fit: 'cover'`, `position: 'centre'`, quality 75. Expected 30–70 kB, so 20 cards
     stay well under the 2 MB of SC-003. Also used for gallery thumbnails and the owner's photo list.
   - `display`: fit inside 1600 × 1600, `withoutEnlargement`, quality 80. Expected 150–400 kB. Used for the
     gallery's main image and the large view.
   - The card ratio (4:3) is a proposal; the ui-ux spec (T011) uses it, and the architect may change it in T001.
4. **No original is kept**. Re-encoding destroys any polyglot payload, and nothing needs the original. A later
   feature that needs new sizes can regenerate from `display`.
5. **Resource limits**: `sharp.cache(false)`, `sharp.concurrency(1)`, and a process-wide semaphore of 2 concurrent
   processing jobs (waiters queue; a waiter that waits longer than 20 s gets 503 with `Retry-After`). Peak memory
   is about two 50 MP decodes. JPEG uses shrink-on-load and stays far lower. devops sizes the Fargate API task
   at ≥ 1 GB (T007).
6. **Synchronous**: processing runs in the request, and the response is the added photo. The UI's "processing"
   state is the time between the last uploaded byte and the response (spec AC 1.3). SC-002 (added within 10 s of
   upload end) holds with a 2-slot semaphore at the expected rate. A BullMQ processing queue would add polling, a
   "processing" row state and more failure modes (YAGNI, AQ-4).

**pnpm and images**: sharp ≥ 0.33 ships prebuilt `@img/sharp-linux-{x64,arm64}` (glibc) and
`@img/sharp-libvips-*` packages as optional dependencies. It needs no install script, and the script is already
skipped. T006 adds `sharp: false` to `allowBuilds` with a comment ("prebuilt @img binaries; no build"), so the
decision is explicit. Every Node image is Debian bookworm (glibc), so the prebuilt binaries load. If an Alpine
(musl) Node image is ever used, add `supportedArchitectures.libc: [musl]` so pnpm fetches the `linuxmusl` builds.
T007 checks that the production API image loads sharp (`node -e "import('sharp')"` in the built image) on the
architectures CI builds.

**Alternatives considered**: `jimp` (pure JS, slow, high memory, weak WebP support); ImageMagick via a child
process (a native binary in the image, a large CVE surface); a managed service such as Lambda with S3 triggers
(more infrastructure and asynchronous by nature).

## R-4 Photo addresses: short-lived signed GET URLs (ADR, FR-019)

**Decision (proposed)**: the API never serves image bytes. Every response that includes a photo carries
**presigned GET URLs** for the variants, signed for at most `PHOTO_URL_TTL_SECONDS` (default 3600, validated
≤ 3600). After unpublishing or deletion the API stops issuing URLs at once (listing reads are published-only, a
deleted row has none), and every URL issued earlier expires within 1 hour. That is the requester's option B. A
deleted photo's objects are removed sooner still (R-7).

- **Cache-friendly signing window**: signing with `signingDate = floor(now / (TTL/2)) × (TTL/2)` and
  `expiresIn = TTL` makes the URL **identical** for every request inside a 30-minute window, so browsers reuse the
  cached image instead of downloading it again for every new signature. Every URL still expires within TTL of being
  issued (it expires at `signingDate + TTL ≤ now + TTL`), and it is valid for at least TTL/2 after issue. The
  presigner supports `signingDate`. `ResponseCacheControl: private, max-age=1800` is signed into the URL so the
  browser cache never outlives the window.
- **Two clients**: the API uses `S3_ENDPOINT` (inside compose: `http://minio:9000`) for put and delete, and signs
  GETs against `S3_PUBLIC_ENDPOINT` (the address the browser can reach: `http://localhost:9000` locally, unset in
  AWS, so the regional S3 endpoint is used). SigV4 signs the host, so signing must use the browser-facing host.
- **Responses** carry `photoUrlsExpireAt` (the earliest expiry among the URLs). The web refetches the query before
  that time, and an `<img>` load error triggers one refetch (T019, T020).
- **e2e**: the Playwright browser shares the web container's network namespace, where `localhost:9000` is not
  MinIO. T003 adds a pinned TCP forwarder (e.g. `alpine/socat`) in the `e2e` profile with
  `network_mode: service:web`, forwarding `localhost:9000` to `minio:9000`. It is TCP-level, so the `Host` header
  and the signature stay valid.
- **Risk to verify in AWS staging (T007)**: the ECS task role uses temporary credentials, and a presigned URL dies
  when its session token expires. The SDK refreshes credentials well before expiry. Windowed signing uses a
  signing date up to 30 minutes in the past with the current token. Verify that S3 accepts such a URL for its full
  window. If it does not, sign at `now` without the window (correct, but fewer browser cache hits) until a CDN
  lands.

**Alternatives considered**: an API streaming proxy (`GET /api/photos/{id}/{variant}` checking access on every
request: immediate revocation, no public storage endpoint, but every image byte passes through Fargate and the
API, and image loads compete with API traffic); CloudFront with signed URLs or cookies (the best production
option for latency and cost, but new infrastructure before any exists; a natural follow-up once IaC is decided,
and the port in R-1 makes the switch local); public-read objects with unguessable keys (FR-019 fails: links never
expire).

## R-5 Where URLs and photos appear in the contract

**Decision (proposed)**: additive response fields, no new renter route.

- `ListingSummary.cover: ListingCover | null` (card variant only) and `ListingSearchResults.photoUrlsExpireAt`.
- `Listing.photos: ListingPhoto[]` (in position order) and `Listing.photoUrlsExpireAt`.
- Owner routes under `/api/owner/spaces/{spaceId}/photos` (contracts/photos.md).

Renter visibility then follows the existing published-only listing reads (FR-019, AC 2.5) with no new
authorization code. Adding required response fields is non-breaking for the generated client (constitution III).
The search card query takes the cover with one `LEFT JOIN space_photo ON position = 1` per result page.

## R-6 The 10-photo limit and order invariants under concurrency (ADR)

**Decision (proposed)**, in the database (constitution IV) and in the service:

- `space_photo.position smallint NOT NULL CHECK (position BETWEEN 1 AND 10)`.
- `UNIQUE (space_id, position) DEFERRABLE INITIALLY IMMEDIATE`. With the range check, a space can never hold more
  than 10 rows, whatever the service does (SC-006). Reorder runs `SET CONSTRAINTS space_photo_position_unique
DEFERRED` and rewrites positions in one transaction.
- **No gaps** (positions are exactly 1..n): enforced by the service, which only appends at `n + 1`, renumbers in
  the same transaction on delete, and rewrites the full order on reorder. A deferred constraint trigger could
  enforce it too; the plan proposes the service rule plus integration tests (AQ-5).
- **Lock order (ADR-0009 section 9.3)**: every photo writer (add, describe, reorder, delete) is a new writer in
  the 9.3 table: `SET LOCAL lock_timeout = '5s'` first, then the **space row `FOR UPDATE`** (photos change the
  listing's content, and the rule reserves `FOR SHARE` for hold writers), then the photo rows. It takes no seat
  locks. The space row also resolves ownership (`WHERE id = $1 AND owner_id = $2`, 404 otherwise), so authorization
  and serialisation are one statement. On `55P03` the writer logs `warn` `photo.lock_timeout` with ids only and
  rethrows (500), as section 9.4 says. 15 racing uploads queue on the space row: each sees the current count and
  either inserts at `n + 1` or gets 409 `photo:limit-reached`. If anything slips past the service, the CHECK and
  UNIQUE turn it into a constraint error, which is mapped to the same 409.
- **No storage I/O while the lock is held** (only DB statements, as 9.3 requires). The upload processes and writes
  the objects **before** the transaction (R-7 covers the cleanup if the insert then fails).

## R-7 Deletion, purge within 24 hours, and abandoned uploads (ADR, FR-010)

**Decision (proposed)**: a `photo_object_purge` outbox table plus a BullMQ `photo-purge` queue.

- **Upload**: before writing any object, insert a purge row (`reason = 'abandoned_upload'`, `due_at = now() + 1
hour`) in its own short transaction. Write the objects. In the photo-insert transaction, delete that purge row.
  If the insert fails (limit, 404, crash), the row stays, and the objects are purged when it is due. The API also
  tries to delete them at once on a known failure and logs the outcome.
- **Delete**: in one transaction (R-6 order), delete the `space_photo` row, renumber the later positions, and insert
  a purge row (`reason = 'deleted'`, `due_at = now()`). After commit, enqueue an immediate `photo-purge` job for
  that row.
- **Worker**: a job deletes the row's objects (`DeleteObjects` on the two derived keys; deleting a missing key succeeds, so it is idempotent), then deletes the
  row. On failure it increments `attempts` and BullMQ retries with exponential backoff. A **repeatable sweep**
  (BullMQ job scheduler, every 15 minutes) picks up due rows that no job handled, for example after a lost enqueue
  or a Redis restart. A row overdue by more than 12 hours logs `error` `photo.purge_overdue`, which is an alert
  hook for observability. Deleted objects are therefore normally gone within seconds and always within 24 hours,
  even through a day of Redis trouble.
- After a delete, the row is gone, so no new URL is issued (FR-010, "disappears from every page at once").

**Alternatives considered**: delete the objects inline in the request (simple, but a storage outage then fails
the delete or leaks objects); bucket lifecycle rules (they work on age or tags, not on DB state); a soft-delete
`deleted_at` column (more query filters, and nothing needs the history).

## R-8 Alt text and description

**Decision (proposed)**: `description` is nullable text, 1–150 characters after trimming, validated with the
existing `PlainText` helper (it rejects control and bidi-override characters, 002 security follow-up). An empty
string after trimming is stored as `NULL`. The API returns `altText` = the description, or
`"<space name> photo <position>"` when there is none. It is computed on read, so it follows renames and reorders
(spec edge cases) and the web never builds it. The caption is shown only when `description` is not null.

## R-9 Owner upload UX building blocks (web)

**Decision (proposed)**:

- A pure **upload-queue model** (`apps/web/src/lib/photo-upload/queue.ts`, reducer, tested first, as the layout
  editor model in 002 T064). States: `waiting → uploading(percent) → processing → added`, `failed(reason)`,
  `not-added(limit)`, `cancelled`. It applies the selection-order rule (only the first `10 − n` files are queued,
  FR-004), retry, dismiss, cancel, and at most 2 concurrent uploads per tab.
- A client-side **pre-check** gives instant feedback for obvious cases (a type outside JPEG, PNG and WebP, size over
  10 MiB). The server stays the authority and the source of every final message.
- **Announcements**: one polite live region summarises queue changes ("Photo 2 of 3 added", "1 photo failed"), not
  every percentage, to avoid a stream of announcements (WCAG 4.1.3). The visible progress is a `progressbar`
  with a value.
- **Leaving with unfinished uploads (FR-007)**: `beforeunload` covers reload, close and external navigation. The
  App Router has no route-change blocking API, so in-app navigation is guarded by a capture-phase click handler on
  same-origin links inside the app shell, which asks for confirmation through a dialog. T015 checks the Next 16
  docs (context7) for a supported API first and uses it if one exists.
- **Reorder**: drag-and-drop with pointer events plus "Move earlier", "Move later" and "Make cover" buttons, which
  satisfy keyboard and single-pointer use without dragging (FR-009). Every change sends the full order
  (`PUT …/photos/order`). A 409 `photo:order-stale` refetches and tells the owner the list changed.

## R-10 Renter display building blocks (web)

**Decision (proposed)**: images rendered with `next/image` and `unoptimized` (the variants are already sized; the
Next optimizer would fetch from storage and cache bytes beyond the URL expiry), with explicit `width` and `height`
from the API to avoid layout shift, `loading="lazy"` on cards below the fold, and the card's first row eager. The
lightbox uses the `@bseat/ui` Dialog (Radix: focus trap, Escape, focus return), arrow keys, buttons, and a
pointer-events swipe (no new dependency). The placeholder is a token-coloured box with an icon and the text "No
photos yet" (spec AC 2.2). It is never an image file, so it cannot be mistaken for a photo.

## R-11 Seed photos (US5)

**Decision (proposed)**:

- **Sourcing (T030, done once with internet access)**: 9 photos (5 for London HQ, 4 for Pune Hub) from Unsplash
  (Unsplash License) or Pexels (Pexels License). Both allow free use, including commercial use and use in software,
  and require no attribution. Unsplash's license forbids compiling photos into a competing photo service, which a
  seed set is not. Downloaded with `curl` from the photo's page download link, resized to 1600 px on the long edge
  and re-encoded as JPEG quality 82 with metadata stripped, by a one-off script run in the tools container with
  sharp. Expect 250–450 kB each, about 3–4 MB in git, which is acceptable for 9 files.
- **Location**: `apps/api/src/db/seed-photos/` holds `london-hq-1.jpg` … `pune-hub-4.jpg`, `CREDITS.md` (file,
  photographer, photographer profile URL, source page URL, license with link, retrieval date) and `photos.ts`
  (file → space, position, description). The seed resolves the folder from `import.meta.url`
  (`dist/db/seed.js` → `../../src/db/seed-photos/`). The production image never runs the seed (the
  `SEED_DEMO_PASSWORD` rule), so `nest-cli` asset copying is not needed.
- **Seeding** goes through the same processing and storage code as uploads (R-3, R-1), so seed photos follow every
  rule (FR-023). It is idempotent: a demo space with **zero** photos gets its set, and a space with any photos is
  left alone (FR-024, AC 5.2). If the MinIO volume was wiped but Postgres was not, the runbook says to reset both
  (T033).
- **Offline (FR-025, AC 5.3)**: nothing downloads at seed or test time. Integration tests generate their images
  with sharp (including EXIF GPS, orientation 6 and a camera serial, via `withExif`), and e2e uses the committed
  seed photos as upload fixtures.

## R-12 Tests and parallel clones

- Integration tests need MinIO: `bin/pnpm test` needs `docker compose up -d postgres redis mailpit minio` (README
  and runbook, T003). `test/setup-env.ts` points `S3_BUCKET_PHOTOS` at `S3_BUCKET_PHOTOS_TEST` (default
  `bseat-photos-test`), and `global-setup.ts` creates that bucket if it is missing and empties it. A clone that
  runs tests in parallel overrides it (for example `bseat-photos-test-b`), as it already overrides
  `DATABASE_URL_TEST`.
- The SC-006 race (15 concurrent uploads → exactly 10 × 201 and 5 × 409, no 5xx) and the SC-005 metadata check
  are integration tests. The FR-019 expiry is an integration test with `PHOTO_URL_TTL_SECONDS=2`: the URL works,
  then returns 403 after expiry.
- SC-003 and SC-004 are measured by QA in e2e (bytes of `card` images on a 20-result page; time to first image under
  Playwright network throttling), as 002 did for its timing SCs.

## R-13 Delivery and merge order

003 stacks on 002. Proposed: cut `dev/003-integration` from `dev/002-integration` after T001 is approved. Each 003
task branch (`<type>/003-<slug>`) is cut from `dev/003-integration` and merged back into it after QA and review. When
002 merges into `main`, merge `main` into `dev/003-integration` and resolve there. 003 merges into `main` only after
002 (a human merges). Migration numbering: 002 may still add migrations. The 003 schema task (T005) generates its
migration on the latest `dev/003-integration`. If 002 lands another migration afterwards, T005's migration is
regenerated before T005 merges, and never after, because a merged migration is never edited.

## R-14 Dependency CVEs before the upload route ships

`multer` 2.4.0 (CVE-2026-113872, DoS during file filtering, fixed in 2.5.0) becomes reachable once a route uses
`FileInterceptor`. `body-parser` 2.3.0 (CVE-2026-111181, fixed in 2.4.0) is reachable today through the JSON parser.
**Decision (proposed)**: T002 (devops) first checks whether a `@nestjs/platform-express` or `express` release pins
the fixed versions and upgrades if it does. Otherwise it adds `overrides` in `pnpm-workspace.yaml`
(`multer: ^2.5.0`, `body-parser: ^2.4.0`) with a comment naming the CVEs and a "remove when upstream pins ≥ fixed"
note. Verified by `pnpm why`, the API test suite and `bin/security` (Trivy). T008 (the upload route) depends on T002.
