# ADR-0011: Space photo storage, processing and delivery

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** architect agent (003 T001); the requester for the product rules (spec 003, FR-019 option B)
- **Amends:** [ADR-0007](0007-aws-deployment-target.md) (adds object storage) and
  [ADR-0009](0009-pass-bookings-seat-holds-and-slots.md) section 9.3 (adds the photo writers)

## Context

Feature 003 (`specs/003-space-photos/`) lets owners add up to 10 photos to each space. Renters see the cover on
search cards and a gallery on the listing page. Several of its choices shape stored data, or they are expensive to
undo:

- **FR-003 and the edge cases:** accept only still JPEG, PNG and WebP, judged by content, at most 10 MB, 800 to
  12,000 px on the long edge, at most 50 MP. Animated images are refused.
- **FR-013 and SC-005:** no stored or served version may carry GPS or other personal metadata. **FR-014:** photos
  display upright.
- **FR-002 and SC-006:** never more than 10 photos per space, including when 15 uploads race.
- **FR-019 (clarified, option B):** a photo address obtained earlier must stop working within 1 hour after the
  space is unpublished or the photo is deleted. **FR-010:** deleted files are gone from storage within 24 hours.
- **FR-018 and SC-003:** cards get a small version, and a results page loads at most 2 MB of photo data.
- The API is a stateless NestJS service on ECS Fargate with RDS and ElastiCache (ADR-0007). No object storage
  exists yet, and no cloud resources may be created without human approval.
- Facts checked on 2026-10-28: `sharp` 0.35.5 is in the lockfile (through Next.js) and has **no install script**.
  Its binaries come from the optional `@img/sharp-*` packages. Every Node image is `node:22-bookworm-slim`
  (glibc). The web lint runs `core-web-vitals` with `--max-warnings=0`, so `@next/next/no-img-element` fails a raw
  `<img>`. The web has no CSP. `proxy.ts` does not match `/api/*`. The MinIO GitHub repository was archived on
  2026-04-25, and its community edition is now distributed as source only, with no new binary releases. Next.js
  16's image optimizer caches fetched images for `minimumCacheTTL` (default 4 hours). When `proxy.ts` runs for a
  request, Next buffers the request body, and anything over `proxyClientMaxBodySize` (default 10 MB) is cut off
  without an error.

## Decision

### 1. Object storage behind a port (AQ-1)

- Photos live in **S3-compatible object storage**. `apps/api/src/storage/` holds a `StorageService` port and is
  the only code that imports the AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`). The port has
  `putObject`, `deleteObject` (one key; a missing key is success) and an **async** `signGetUrls` (presigning may
  refresh credentials).
- **Keys** are derived from ids and never stored: `spaces/{spaceId}/{photoId}/card.webp` and
  `.../display.webp`. A key's bytes never change. New bytes always get a new photo id, so a URL can never show
  stale content.
- **Purges use one `DeleteObject` per key**, not `DeleteObjects`. `DeleteObjects` returns 200 even when single
  keys fail, and it needs a body checksum. A purge has exactly two keys.
- **Client settings:** connection timeout 3 s, request timeout 15 s, at most 3 attempts. These bound how long an
  upload holds its buffer when storage hangs. If the local server rejects the SDK's default request checksums,
  `requestChecksumCalculation` and `responseChecksumValidation` are set to `WHEN_REQUIRED`. T004 decides this by
  test.
- **AWS** (documented in T007, created only with human approval, plan OQ-1): one private bucket per environment
  with Block Public Access on, bucket-owner-enforced ownership, SSE-S3, a TLS-only bucket policy, versioning
  **off** (so a delete is final), and a lifecycle rule that aborts incomplete multipart uploads after 1 day. The
  ECS task role may only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on
  `arn:aws:s3:::bseat-photos-<env>/spaces/*`. Keys are derived, so no `ListBucket`. No bucket CORS is needed:
  uploads go through the API, and `<img>` loads need no CORS.
- **Locally**, a compose service named `storage`. It is not tied to one product, and every variable is `S3_*`.
  **MinIO is not the default**, because upstream is archived and publishes no new community binaries, so a
  pinned image would never get a security fix. T003 picks a **maintained, permissively licensed**
  S3-compatible server, with SeaweedFS (Apache-2.0, a single `weed server -s3` container) as the first
  candidate. The choice must pass this conformance list, which T003 checks by hand and T004's
  `storage.int-spec.ts` automates:
  1. a SigV4 presigned GET works with path-style addressing;
  2. it returns 403 after expiry and 403 with a tampered signature;
  3. it honours `response-cache-control` and `response-expires`;
  4. `DeleteObject` on a missing key succeeds;
  5. an anonymous GET is refused;
  6. it runs offline with no account or licence key, from a version-pinned image.

  MinIO's last community image is a recorded fallback, used only if no maintained candidate passes. The PR must
  then say so, and a follow-up is opened.

### 2. Uploads go through the API (AQ-2)

- One file per `multipart/form-data` request to `POST /api/owner/spaces/{spaceId}/photos`. The server must read
  and re-encode the bytes anyway (FR-003, FR-013), so a presigned PUT would only add a quarantine prefix, a
  completion call that downloads the object back, bucket CORS and a second cleanup path. Revisit this if the cap
  rises well above 10 MiB.
- **Nothing reads the body before these checks pass**, in this order: `AuthGuard` → `RolesGuard` (owner) →
  `OriginGuard` (section 3) → **upload admission**. Admission allows at most **16 upload requests in flight per
  API process**. Above that, the request gets an immediate 503 `photo:busy` with `Retry-After`. 16 covers
  SC-006's 15 concurrent uploads, and it caps the buffered bodies at about 160 MiB per task.
- Then multer memory storage with `fileSize` 10 MiB, `files: 1`, `fields: 0` and `parts: 1`.
- **Time bound:** `bootstrap.ts` sets `server.requestTimeout = 120_000` for all routes. Every route except
  this one takes JSON of at most 100 kB. This stops slow uploads from holding memory and admission slots for
  Node's default of 300 s.
- **Local dev:** `/api/*` reaches the API through the Next rewrite. `/api` must **never** be added to the
  `proxy.ts` matcher, because Next would then silently cut off bodies above `proxyClientMaxBodySize`. T016
  verifies a 10 MiB upload through `http://localhost:3000`. In AWS the ALB routes `/api/*` to the API directly.
- Progress needs `XMLHttpRequest`, so `@bseat/api-client` exports a hand-written `uploadSpacePhoto` helper
  typed with the generated types. The web app still talks to the API only through `@bseat/api-client`.

### 3. CSRF on the multipart route (AQ-7)

`multipart/form-data` is the only CORS-simple unsafe request the API accepts. JSON routes require
`application/json`, and `PUT`, `PATCH` and `DELETE` are preflighted. The session cookie is `SameSite=Lax`. As
defence in depth, a **reusable** `OriginGuard` in `apps/api/src/common/` returns 403 when an `Origin` header is
present and not in `TRUSTED_ORIGINS`. 003 applies it to the upload route only. Whether to apply it globally to
unsafe methods is a security-review decision (T035), not part of 003.

### 4. Image processing with sharp (AQ-3, AQ-4)

- `sharp` 0.35.x is a direct dependency of `@bseat/api`. It is used only in the pure
  `photos/photo-processing.ts`: bytes in, variants or a typed rejection out. The file name and the client's
  `Content-Type` are never read.
- **Validation** runs on the header first (`metadata()`), and the decoder enforces it again:
  - The format must be `jpeg`, `png` or `webp`; anything else is 415.
  - `pages > 1` (animated WebP) is 415.
  - A **PNG with an `acTL` chunk before `IDAT`** (APNG) is 415. libvips does not report APNG animation, so the
    module walks the PNG chunk headers itself.
  - A long edge outside 800 to 12,000 px, or more than 50 MP, is 422 `dimensions-out-of-range`.
  - The decoder runs with `failOn: 'error'` (truncated data fails too), `limitInputPixels: 50_000_000` as a
    backstop, and `timeout({ seconds: 15 })`. A decode failure or timeout is 422 `unreadable`.
- **Normalisation and variants:** decode **once**, apply the EXIF orientation (`autoOrient`), convert to sRGB,
  and produce one intermediate fitted inside 1600 × 1600 (never enlarged). Both variants come from that
  intermediate, so the input is never decoded twice:
  - `display`: the intermediate as WebP q80.
  - `card`: **always exactly 640 × 480** (4:3, `fit: 'cover'`, centre), WebP q75. It may upscale when the
    input's short edge is small, for example a 800 × 300 panorama. Its size is therefore a constant, not a
    column.
- **Metadata:** the module never calls `withMetadata`, `keepMetadata`, `keepExif` or `keepIccProfile`. A test
  asserts that neither variant has an EXIF, XMP or IPTC block (FR-013, SC-005).
- **No original is kept** (see Consequences for the cost).
- **Synchronous, bounded:** processing runs inside the request. `sharp.cache(false)` and `sharp.concurrency(1)`
  are set, and a process-wide **semaphore of 2** guards processing. A waiter that waits more than 20 s gets 503
  `photo:busy`. Two slots stay below libuv's default thread pool of 4, so password hashing and DNS keep threads
  free. A BullMQ processing queue would add a "processing" row state, polling and more failure modes, and SC-002
  does not need one.
- **Memory budget:** T006 measures peak RSS for each worst-case fixture: a 50 MP 16-bit RGBA PNG with EXIF
  orientation 6, and a 50 MP progressive JPEG. T007 sizes the Fargate API task as baseline + 16 × 10 MiB bodies +
  2 × the measured peak, plus 30% headroom (at least 1 GB; 2 GB is expected).
- **pnpm and images:** sharp needs **no `allowBuilds` entry**, because it has no install script. An entry for a
  package without one would only mislead. If a future sharp adds a script, pnpm blocks it by default, and that
  is the review point. The production image runs `pnpm deploy --prod` in a build stage of the same platform as
  the runtime, so it installs the matching `@img/sharp-linux-*` (glibc) package. T007 smoke-tests
  `import('sharp')` in the built image on every architecture CI builds. An Alpine (musl) image would need
  `supportedArchitectures.libc: [musl]`.

### 5. Photo addresses: short-lived presigned GET URLs (AQ-6, FR-019)

- The API never serves image bytes. Every response that carries photos carries presigned GET URLs for the
  variants it needs. Cards get `card` only (FR-018).
- `PHOTO_URL_TTL_SECONDS` is an integer from 2 to 3600, default 3600. The low end exists for expiry tests.
- **Signing window** `W = floor(TTL / 2)`. The API computes `now` **once per response**, then uses
  `signingDate = floor(now / W) × W` and `expiresIn = TTL`. Every URL for one key in one window is
  byte-identical, so browsers reuse cached images. A URL issued at `t` expires in `(t + TTL − W, t + TTL]`:
  never more than TTL after issue, and at least 30 minutes with the default.
- **Cache headers are signed into the URL:** `response-cache-control: private` and `response-expires` set to the
  URL's own expiry. The plan proposed `max-age=1800`, but a copy fetched late in the window could then be served
  from the browser cache up to 30 minutes after its URL died. With `Expires`, the freshness ends exactly when the
  URL does. It is computed against the response's `Date`, so client clock skew does not matter.
- Responses carry `photoUrlsExpireAt` (the window's expiry, `null` with no photos). The web refetches before it,
  and an image load error refetches once.
- **Revocation:** after an unpublish, listing reads (published only) issue no new URLs, and every earlier URL
  dies within TTL. After a delete, the row is gone at once, the objects go at the next purge sweep, and URLs die
  within TTL either way.
- **Two endpoints:** put and delete use `S3_ENDPOINT` (internal). Signing uses `S3_PUBLIC_ENDPOINT` (the host
  the browser reaches; unset in AWS), because SigV4 signs the host.
- **AWS caveats**, verified in staging before the first deploy (T007):
  - A presigned URL works only while the credentials that signed it are valid. With task-role credentials,
    check that a URL backdated by up to `W` keeps working for its whole life, and fall back to unwindowed
    signing if it does not.
  - Each Fargate task has its own credentials, so URLs differ by task, and the browser cache hit rate falls as
    the task count grows. SC-003 still holds without cache hits (20 cards × about 70 kB).
  - CloudFront with signed URLs is the follow-up for production delivery. It gets its own ADR once IaC is
    decided. The port keeps that switch local to `storage/`.

### 6. Rendering on the web

- Photos render through `next/image`, with `images: { unoptimized: true }` set **globally** in
  `apps/web/next.config.ts` and **no `remotePatterns`**:
  - The variants are already sized.
  - The optimizer would fetch the signed URL server-side and keep the bytes for up to 4 hours, outliving the
    URL and breaking FR-019.
  - Global `unoptimized` means no component can route a photo through the optimizer by accident.
  - `remotePatterns` is only consulted by the optimizing loader, so it stays empty.
  - A raw `<img>` would fail the `no-img-element` lint rule.
- The API returns each image's `width` and `height` (layout without shift). Cards below the fold use
  `loading="lazy"`.
- **CSP:** the web sets none today. Whoever adds one must allow the storage origin in `img-src`, derived from
  config (`S3_PUBLIC_ENDPOINT` locally, the bucket's regional virtual-hosted origin in AWS). No `connect-src`
  entry is needed, because the upload goes to the same-origin `/api`. If the web ever sends
  `Cross-Origin-Embedder-Policy: require-corp`, storage responses would need `Cross-Origin-Resource-Policy`, or
  the policy must be `credentialless`.

### 7. The 10-photo limit and order invariants (AQ-5)

- `space_photo.position smallint CHECK (position BETWEEN 1 AND 10)` and
  `UNIQUE (space_id, position) DEFERRABLE INITIALLY IMMEDIATE`. Together they make an 11th photo impossible,
  whatever the service does.
- **Why deferrable:** PostgreSQL checks a non-deferrable unique constraint row by row, so one `UPDATE` that
  permutes positions (reorder) or shifts them down (renumber after delete) can fail on a transient duplicate.
  The usual workaround, moving rows out of range first, is impossible under the 1 to 10 CHECK.
  `DEFERRABLE INITIALLY IMMEDIATE` checks at the end of each statement. So **every reorder and every renumber is
  one `UPDATE` statement**, and no code uses `SET CONSTRAINTS`. The cost is that a deferrable unique cannot
  arbitrate `ON CONFLICT`, which no photo writer uses.
- **Gap-free positions** (exactly 1..n) are a service rule under the space-row lock, covered by integration
  races. A constraint trigger would read other rows, which this project avoids (ADR-0009, Alternatives).
- **Error mapping:**

  | Error                                    | Response                                                                   |
  | ---------------------------------------- | -------------------------------------------------------------------------- |
  | `23514` on `space_photo_position_range`  | 409 `photo:limit-reached`. It means the insert went to position 11         |
  | `23505` on `space_photo_position_unique` | 500, logged at `error`. A duplicate under the space lock is a service bug  |
  | `55P03`                                  | `warn` `photo.lock_timeout` with ids only, then 500 (ADR-0009 section 9.4) |

### 8. Photo writers and the lock order (ADR-0009 section 9.3)

- **Writers:** photo add, describe, reorder and delete.
- **Lock order:** each writer sets `SET LOCAL lock_timeout = '5s'` first. Then it locks **exactly one space
  row** with `FOR UPDATE`, in the statement that also checks `owner_id`, so authorization and serialisation
  happen in one statement and a foreign space is a 404. Only then does it touch the photo and purge rows.
  Photo writers take no seat locks.
- **No storage I/O while a lock is held.** Objects are written before the transaction and deleted by the sweep
  after it.
- **Not space writers:** the upload-intent insert and the purge sweep lock only `photo_object_purge` rows. They
  never lock a space or photo row, so they cannot form a cycle with the writers above.

### 9. Deletion and purge: an outbox and one sweep (AQ-8)

- **`photo_object_purge`** is an outbox of object pairs to delete. It holds deleted photos (`due_at = now()`)
  and **upload intents** (`due_at = now() + 1 hour`). An upload inserts its intent before it writes any object.
- **One mechanism.** A BullMQ job scheduler runs a sweep **every 5 minutes**. `upsertJobScheduler` at boot is
  idempotent across tasks. The plan's extra per-row job, enqueued after commit, is dropped: it was a second code
  path for the same work, and FR-010 allows 24 hours. FR-019's 1-hour bound comes from the URL TTL, not the
  purge.
- **Lease claim.** In a short transaction, the sweep runs `UPDATE … SET attempts = attempts + 1,
last_attempt_at = now()` on up to 100 rows that are due, are not leased (`last_attempt_at` null or older than
  10 minutes), and are picked `FOR UPDATE SKIP LOCKED`. It commits, deletes both keys, then deletes the row. It
  never holds a transaction open across storage calls. A crash only delays the row by one lease.
- **Intent safety.** The upload's photo-insert transaction deletes its intent with
  `WHERE photo_id = $1 AND reason = 'abandoned_upload' AND last_attempt_at IS NULL`, and it must delete exactly
  one row, or it rolls back (503 `photo:busy`). A sweep that already claimed the intent therefore can never
  delete the objects of a photo that was inserted after all.
- **On a known failure after the put** (409, 404, a failed insert), the API sets the intent's `due_at = now()`.
  There is no inline storage delete, so the sweep stays the only path that deletes objects.
- A row overdue by more than 12 hours logs `error` `photo.purge_overdue`, which is the alert hook. That leaves
  about 23 hours of Redis or storage outage before FR-010 is at risk.

### 10. Local development and tests (AQ-9)

- `S3_PUBLIC_ENDPOINT=http://localhost:9000` in compose. The e2e browser shares the web container's network
  namespace, so the `e2e` profile adds a pinned TCP forwarder (`network_mode: service:web`) from
  `localhost:9000` to `storage:9000`. TCP forwarding keeps the `Host` header and the signature valid.
- **Integration tests** run in the tools container, where `localhost:9000` is not storage. So
  `test/setup-env.ts` sets `S3_PUBLIC_ENDPOINT` to the internal `S3_ENDPOINT`, and `S3_BUCKET_PHOTOS` to
  `S3_BUCKET_PHOTOS_TEST` (default `bseat-photos-test`). Global setup creates and empties that bucket. A
  parallel clone overrides the bucket name, as it overrides `DATABASE_URL_TEST`.

### 11. Problem types (AQ-10)

The types in `specs/003-space-photos/contracts/README.md` are accepted, with two changes:

- **503 `photo:busy`** (with `Retry-After`) covers three cases: admission is full, the processing wait passed
  20 s, or storage is unreachable or the intent check failed. All three mean "temporary, retry". Logs carry the
  actual cause.
- **A `23505` on the position unique** is a 500, not a 409 (section 7).

Extension members use `ProblemSchema.extend` (ADR-0009 section 8).

## Alternatives considered

- **Storage:**
  - **`bytea` in Postgres:** bloats RDS and its backups, and every image byte passes through the API.
  - **EFS or local disk:** local disk is not shared across Fargate tasks, and EFS costs more than S3 and is
    slower.
  - **The `minio` JS client:** specific to one vendor. The AWS SDK works with every S3-compatible server.
- **MinIO as the local default:** upstream is archived and publishes no new binaries, so the image would never
  get a fix. It stays only as a recorded fallback (section 1).
- **Presigned PUT straight to storage:** needs a quarantine prefix, a completion download, CORS and a second
  cleanup path, and FR-013 forces a server-side re-encode anyway.
- **A BullMQ processing queue:** adds a processing state, polling and more failure modes, for no requirement.
- **Image delivery:**
  - **An API streaming proxy:** revocation is instant, but every image byte passes through Fargate.
  - **CloudFront now:** new infrastructure before IaC exists. It is the follow-up instead.
  - **Public-read objects:** links never expire, so FR-019 fails.
  - **`max-age=1800` on signed URLs:** the browser cache could outlive the URL (section 5).
- **Keeping the original, or a metadata-stripped master at up to about 4096 px:**
  - Keeping the original as uploaded is out, because FR-013 forbids storing its metadata.
  - A stripped master is possible, but it is a re-encode anyway, costs a third encode and about 1 to 3 MB per
    photo, and widens what must be purged. No requirement needs it (see Consequences).
- **Immediate purge job plus sweep:** two code paths for one job (section 9). **Inline deletes:** a storage
  outage would fail the request or leak objects.
- **Non-deferrable unique with a two-step renumber:** impossible under the range CHECK. **A gap-free
  constraint trigger:** cross-row logic in a trigger.
- **Web rendering:** the `next/image` optimizer outlives URL expiry, and a raw `<img>` fails lint (section 6).
- **`sharp: false` in `allowBuilds`:** sharp has no build script, so the entry would do nothing.

## Consequences

- **Good:**
  - Photos never touch Postgres, and the API never streams image bytes.
  - The limit holds under any concurrency, because the database refuses an 11th row.
  - Revocation needs no new authorization code: it follows the published-only listing reads and the URL TTL.
  - Purges survive Redis and storage outages.
  - Every stored variant has been re-encoded without metadata, so no stored copy ever held GPS data.
- **The cost of keeping no original (accepted):**
  - New sizes can only be derived from `display`, which is at most 1600 px and already lossy. A larger
    variant (for example 2× retina in the large view), a sharper re-crop or a different quality needs the
    owner to upload again.
  - A processing bug fixed later, or the sRGB gamut conversion, cannot be re-run on photos already stored.
  - At 10 photos per space and a few hundred spaces, re-upload is the cheaper remedy. The 9 seed photos stay in
    git and can always be processed again.
  - Re-open this decision, with a stripped master variant, before any feature needs images above 1600 px.
- **Bad and neutral:**
  - A new datastore and two SDK packages.
  - A new compose service plus an e2e forwarder.
  - Upload memory must be sized (section 4).
  - The browser cache hit rate falls as the number of API tasks grows (section 5).
  - The upload route is the only multipart route, and it is the first one with an `Origin` check.
- **Follow-ups:**
  - A CloudFront delivery ADR, once IaC is decided.
  - Rate limiting on uploads, as a T035 decision (with no limiter, admission is only a per-process bound).
  - The global `OriginGuard` decision (T035).
  - `img-src` when a web CSP lands.
  - The staging check of URLs signed with task-role credentials (T007).
  - Bucket and IAM creation (OQ-1, human).
