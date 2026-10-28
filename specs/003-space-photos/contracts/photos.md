# Contract: space photos

New module `apps/api/src/photos/` (`space-photos.controller.ts`, `space-photos.service.ts`,
`space-photos.schemas.ts`, `photo-processing.ts`, `photo-purge.processor.ts`) and `apps/api/src/storage/`
(`storage.module.ts`, `storage.service.ts`, `url-signing.ts`). Owner controller:
`@Controller('owner/spaces/:spaceId/photos')`, `@UseGuards(AuthGuard, RolesGuard)`, `@RequireRole('owner')`.
Path ids are `z.uuid()`. The upload route also has `OriginGuard` and upload admission (README, ADR-0011 sections
2 and 3). This file includes the architect's T001 amendments.

## Shared response schemas

```ts
const PhotoImage = z
  .object({ url: z.url(), width: z.number().int().positive(), height: z.number().int().positive() })
  .meta({ id: 'PhotoImage' });

const OwnerSpacePhoto = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(1).max(10), // 1 = cover
    description: z.string().nullable(),
    altText: z.string(), // description ?? "<space name> photo <position>" (R-8)
    card: PhotoImage, // 640 × 480
    display: PhotoImage, // ≤ 1600 on the long edge
    createdAt: Instant,
  })
  .meta({ id: 'OwnerSpacePhoto' });

const OwnerSpacePhotos = z
  .object({
    items: z.array(OwnerSpacePhoto), // by position
    limit: z.literal(10),
    photoUrlsExpireAt: Instant.nullable(), // null when items is empty
  })
  .meta({ id: 'OwnerSpacePhotos' });
```

## Owner routes

| Route                                                 | Handler / hook                                  | Body                      | Responses                                                             |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `GET /api/owner/spaces/{spaceId}/photos`              | `SpacePhotos_list` / `useSpacePhotosList`       |                           | 200 `OwnerSpacePhotos` (any status, FR-020) · 403 · 404               |
| `POST /api/owner/spaces/{spaceId}/photos`             | `SpacePhotos_upload` / `uploadSpacePhoto` (R-2) | `UploadSpacePhotoInput`   | 201 `OwnerSpacePhoto` · 400 · 403 · 404 · 409 · 413 · 415 · 422 · 503 |
| `PATCH /api/owner/spaces/{spaceId}/photos/{photoId}`  | `SpacePhotos_describe`                          | `DescribeSpacePhotoInput` | 200 `OwnerSpacePhoto` · 400 · 403 · 404                               |
| `PUT /api/owner/spaces/{spaceId}/photos/order`        | `SpacePhotos_reorder`                           | `ReorderSpacePhotosInput` | 200 `OwnerSpacePhotos` · 400 · 403 · 404 · 409 `photo:order-stale`    |
| `DELETE /api/owner/spaces/{spaceId}/photos/{photoId}` | `SpacePhotos_remove`                            |                           | 204 · 403 · 404                                                       |

```ts
// multipart/form-data, exactly one part named "file". Documented for OpenAPI; the bytes are checked by
// photo-processing.ts (format by content, size, dimensions, animation), never by the part's Content-Type.
const UploadSpacePhotoInput = z
  .strictObject({ file: z.file() /* binary */ })
  .meta({ id: 'UploadSpacePhotoInput' });

const DescribeSpacePhotoInput = z
  .strictObject({
    // Trimmed; "" becomes null (no description). PlainText rejects control and bidi characters.
    description: PlainText.max(150).nullable(),
  })
  .meta({ id: 'DescribeSpacePhotoInput' });

const ReorderSpacePhotosInput = z
  .strictObject({
    photoIds: z.array(z.uuid()).min(1).max(10), // unique; the new order, cover first
  })
  .meta({ id: 'ReorderSpacePhotosInput' });
```

### Behaviour

- **Upload** (R-2, R-3, R-6, R-7, ADR-0011 sections 2, 4 and 9), in this order:
  1. guards, Origin check and admission;
  2. multer limits;
  3. validate and process (semaphore of 2, waiters for at most 20 s);
  4. generate the photo id and insert the upload intent (`due_at = now() + 1 hour`);
  5. put `card.webp` and `display.webp`;
  6. the transaction: `lock_timeout`, space `FOR UPDATE` with `owner_id` (404 when no row), count (409 at 10),
     delete its own unclaimed intent (exactly one row, otherwise roll back with 503), insert at `n + 1`;
  7. 201.

  On any failure after step 4 (404, 409, 503, a storage error, a failed insert), the API sets the intent's
  `due_at = now()`, and the next purge sweep removes whatever was written. There is no inline storage delete. Log
  `photo.added`
  (`spaceId`, `photoId`, `format`, `width`, `height`, `bytesIn`, `bytesStored`, `ms`) or `photo.rejected`
  (`spaceId`, `reason` = problem type, `bytesIn`). Never the file name, never the bytes.

- **Describe**: same lock order; updates `description` and `updated_at`. Log `photo.described` (ids only).
- **Reorder**: the same lock order. `photoIds` must equal the current set exactly (the same ids and count, no
  duplicates), otherwise 409 `photo:order-stale`. Then **one** `UPDATE … FROM (VALUES …)` sets
  position = index + 1. The deferrable-immediate unique is checked at the end of that statement, and no
  `SET CONSTRAINTS` is used. Returns the new list. Log `photo.reordered`.
- **Delete**: the same lock order. Deletes the row, decrements the later positions in **one** `UPDATE`, and
  inserts a purge row (`reason = 'deleted'`, `due_at = now()`). The objects go at the next purge sweep (every
  5 minutes); no job is enqueued per delete. A deleted id is 404 afterwards. Log `photo.deleted`.

## Renter additions (002 listing responses)

```ts
const ListingCover = z
  .object({ altText: z.string(), card: PhotoImage })
  .meta({ id: 'ListingCover' });

const ListingPhoto = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(1).max(10),
    description: z.string().nullable(), // caption when not null
    altText: z.string(),
    card: PhotoImage, // gallery thumbnails
    display: PhotoImage, // main image and large view
  })
  .meta({ id: 'ListingPhoto' });

// ListingSummary  += cover: ListingCover.nullable()          (null → placeholder, FR-016)
// ListingSearchResults += photoUrlsExpireAt: Instant.nullable()
// Listing         += photos: z.array(ListingPhoto)           (by position; [] → placeholder, FR-017)
//                 += photoUrlsExpireAt: Instant.nullable()
```

Only published spaces reach these responses (existing filters), so FR-019's "not on any page" holds with no new
check. A search card never carries the `display` URL (FR-018).

## Upload helper (packages/api-client, hand-written, R-2)

```ts
export function uploadSpacePhoto(
  spaceId: string,
  file: File,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<OwnerSpacePhoto>; // rejects with ApiError (ProblemDetails) or an AbortError
```

`XMLHttpRequest` `POST /api/owner/spaces/{spaceId}/photos` with `FormData` (`file`), `withCredentials`,
`upload.onprogress` → `onProgress(loaded / total)`, and abort on `signal`. A network failure, or an error response
without a problem body (for example Node's 408 after `requestTimeout`), rejects with `ApiError`. A network failure
has status 0; a bare error response keeps its HTTP status. Both carry type `urn:bseat:problem:network`, which is
client-only and drives the "connection lost" copy. Exported
from `packages/api-client/src/index.ts`. Its MSW handler for component tests sits next to the generated mocks.

## Storage port (internal, not HTTP)

```ts
interface StorageService {
  putObject(key: string, body: Buffer, contentType: 'image/webp'): Promise<void>;
  // One DeleteObject per key (not DeleteObjects, which reports per-key failures inside a 200). A missing key is
  // success, so the purge is idempotent.
  deleteObject(key: string): Promise<void>;
  // Async: presigning may refresh credentials. The caller passes one `now` per response, so every URL in a
  // response shares one window. Signed with response-cache-control "private" and response-expires = expiresAt.
  signGetUrls(keys: readonly string[], now: Date): Promise<{ urls: string[]; expiresAt: Date }>;
}
```

The S3 client uses a 3 s connection timeout, a 15 s request timeout and at most 3 attempts. The checksum settings
are `WHEN_REQUIRED` if the local server needs them (T004). The signing window is a pure function in
`url-signing.ts`: `W = floor(TTL / 2)`, `signingDate = floor(now / W) × W`, `expiresAt = signingDate + TTL`.

## Environment (apps/api/src/config/env.ts and .env.example)

| Variable                | Default (dev)  | Notes                                                                                                        |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `S3_ENDPOINT`           | unset (AWS)    | `http://storage:9000` in compose; the API's own address for put and delete                                   |
| `S3_PUBLIC_ENDPOINT`    | unset (AWS)    | `http://localhost:9000` in compose; the host signed into GET URLs. Integration tests set it to `S3_ENDPOINT` |
| `S3_REGION`             | `us-east-1`    | The local server ignores it; AWS uses the bucket's region                                                    |
| `S3_BUCKET_PHOTOS`      | `bseat-photos` | Integration tests use `S3_BUCKET_PHOTOS_TEST` (default `bseat-photos-test`; override per clone)              |
| `S3_FORCE_PATH_STYLE`   | `false`        | `true` for the local server                                                                                  |
| `S3_ACCESS_KEY_ID`      | unset          | Dev only (local server credentials). In AWS the task role is used, so never set it there                     |
| `S3_SECRET_ACCESS_KEY`  | unset          | Dev only, a secret: never logged                                                                             |
| `PHOTO_URL_TTL_SECONDS` | `3600`         | Integer 2–3600 (FR-019 caps it at 1 hour; the low end exists for expiry tests)                               |

The env schema refuses `S3_ACCESS_KEY_ID` without `S3_SECRET_ACCESS_KEY`, and the reverse.

Fixed constants, not env (ADR-0011): upload admission 16 per process, processing semaphore 2, processing wait
20 s, sharp timeout 15 s, Node `requestTimeout` 120 s, purge sweep every 5 minutes with a 10-minute lease, and
`photo.purge_overdue` after 12 hours.
