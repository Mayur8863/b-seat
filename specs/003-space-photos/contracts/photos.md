# Contract: space photos

New module `apps/api/src/photos/` (`space-photos.controller.ts`, `space-photos.service.ts`,
`space-photos.schemas.ts`, `photo-processing.ts`, `photo-purge.processor.ts`) and `apps/api/src/storage/`
(`storage.module.ts`, `storage.service.ts`, `url-signing.ts`). Owner controller:
`@Controller('owner/spaces/:spaceId/photos')`, `@UseGuards(AuthGuard, RolesGuard)`, `@RequireRole('owner')`.
Path ids are `z.uuid()`.

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

- **Upload** (R-2, R-3, R-6, R-7): Origin check → multer limits → validate and process (semaphore) → insert the
  upload intent → put `card.webp` and `display.webp` → transaction (`lock_timeout`, space `FOR UPDATE` with
  `owner_id`, count; 409 if 10; insert at `n + 1`; delete the intent) → 201. On a 409 or 404 after the put, the
  objects are deleted at once (best effort) and the intent stays as the fallback. Log `photo.added`
  (`spaceId`, `photoId`, `format`, `width`, `height`, `bytesIn`, `bytesStored`, `ms`) or `photo.rejected`
  (`spaceId`, `reason` = problem type, `bytesIn`). Never the file name, never the bytes.
- **Describe**: same lock order; updates `description` and `updated_at`. Log `photo.described` (ids only).
- **Reorder**: same lock order; `photoIds` must equal the current set exactly (same ids, same count, no
  duplicates), otherwise 409 `photo:order-stale`. `SET CONSTRAINTS space_photo_position_unique DEFERRED`, then
  positions = index + 1. Returns the new list. Log `photo.reordered`.
- **Delete**: same lock order; deletes the row, decrements later positions, inserts a purge row
  (`reason = 'deleted'`, `due_at = now()`), commits, then enqueues the `photo-purge` job (job id = purge row id).
  A deleted id is 404 afterwards. Log `photo.deleted`.

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
`upload.onprogress` → `onProgress(loaded / total)`, and abort on `signal`. A network failure rejects with
`ApiError` status 0 and type `urn:bseat:problem:network` (client-only, for the "connection lost" copy). Exported
from `packages/api-client/src/index.ts`. Its MSW handler for component tests sits next to the generated mocks.

## Storage port (internal, not HTTP)

```ts
interface StorageService {
  putObject(key: string, body: Buffer, contentType: 'image/webp'): Promise<void>;
  deleteObjects(keys: readonly string[]): Promise<void>; // missing keys are not an error
  signedGetUrl(key: string, now?: Date): { url: string; expiresAt: Date }; // windowed (R-4)
}
```

## Environment (apps/api/src/config/env.ts and .env.example)

| Variable                | Default (dev)  | Notes                                                                       |
| ----------------------- | -------------- | --------------------------------------------------------------------------- |
| `S3_ENDPOINT`           | unset (AWS)    | `http://minio:9000` in compose; the API's own address for put and delete    |
| `S3_PUBLIC_ENDPOINT`    | unset (AWS)    | `http://localhost:9000` in compose; the host signed into GET URLs           |
| `S3_REGION`             | `us-east-1`    | MinIO ignores it; AWS uses the bucket's region                              |
| `S3_BUCKET_PHOTOS`      | `bseat-photos` | Integration tests use `S3_BUCKET_PHOTOS_TEST` (default `bseat-photos-test`) |
| `S3_FORCE_PATH_STYLE`   | `false`        | `true` for MinIO                                                            |
| `S3_ACCESS_KEY_ID`      | unset          | Dev only (MinIO root user). In AWS the task role is used; never set there   |
| `S3_SECRET_ACCESS_KEY`  | unset          | Dev only, a secret: never logged                                            |
| `PHOTO_URL_TTL_SECONDS` | `3600`         | 60–3600 (FR-019 caps it at 1 hour)                                          |

The env schema refuses `S3_ACCESS_KEY_ID` without `S3_SECRET_ACCESS_KEY` and the reverse.
