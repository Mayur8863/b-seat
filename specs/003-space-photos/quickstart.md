# Quickstart: validate space photos (003)

A run guide that proves the feature end to end once the tasks are merged into `dev/003-integration`. Details live in
[contracts/photos.md](./contracts/photos.md), [data-model.md](./data-model.md) and [research.md](./research.md).

## Prerequisites

- Docker only (AGENTS.md). A fresh stack: `docker compose down -v` (drops the Postgres, Redis and MinIO volumes),
  then `docker compose up`.
- The stack now includes `minio` (S3 API on :9000, console on :9001) and the one-shot `storage-init`, which
  creates the `bseat-photos` bucket. `migrate` waits for it, then migrates and seeds.
- Demo accounts and password as in the 002 quickstart (`SEED_DEMO_PASSWORD`).

## 1. Seeded photos, offline (US5, FR-023 to FR-025, SC-009)

1. Disconnect the host from the internet (or block outbound traffic), then `docker compose up`.
2. Sign in as the demo renter and search country United Kingdom. **Expect** the London HQ card to show its cover
   photo. Search India: Pune Hub shows its cover.
3. Open London HQ. **Expect** a gallery of 5 photos with captions, cover first. Pune Hub has 4.
4. `docker compose run --rm migrate` (seeds again). **Expect** still 5 and 4 photos.
5. Open `apps/api/src/db/seed-photos/CREDITS.md`. **Expect** 9 entries with file, photographer, source page,
   license and retrieval date.

## 2. Owner adds, describes, reorders and deletes (US1, US3, US4)

1. Sign in as the demo owner, open a draft space → **Photos** in the space navigation. **Expect** the empty state.
2. Add 3 seed JPEGs and one 12 MB file. **Expect** per-file progress, the 3 added with "1 of 10…3 of 10", the
   large one "failed" with the size rule, and the first marked "Cover".
3. Describe photo 2, move photo 3 to first using only the keyboard ("Make cover"). Delete photo 2 and confirm.
   **Expect** 2 photos, the new cover first, and the confirmation copy saying deletion is permanent.
4. Fill the space to 10 photos. **Expect** the add control unavailable with the limit message. With 8 photos,
   choose 4 files. **Expect** 2 added and 2 "not added".

## 3. Privacy and visibility (FR-013, FR-019, SC-005, SC-007)

1. Upload a phone photo with GPS data. Download its `display` URL from the browser and inspect it with
   `bin/tools bash -c "node -e \"import('sharp').then(async ({default: s}) => console.log(await s(process.argv[1]).metadata()))\" /tmp/photo.webp"`.
   **Expect** no `exif`, `xmp` or `iptc` fields.
2. As a renter, copy a cover URL from a published space. The owner unpublishes it. **Expect** the space gone from
   search at once, and the copied URL to return 403 within 1 hour (locally, set `PHOTO_URL_TTL_SECONDS=120` in
   `.env` to see it within 2 minutes).
3. The owner deletes a photo. **Expect** its objects gone from the MinIO console (http://localhost:9001,
   bucket `bseat-photos`) within a minute.

## 4. Automated checks

| What                                                       | Command                                                                               | Expect                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| Unit + integration (needs postgres, redis, mailpit, minio) | `docker compose up -d postgres redis mailpit minio storage-init` then `bin/pnpm test` | all green                        |
| Photo integration only                                     | `bin/pnpm --filter @bseat/api test:integration -- photos`                             | incl. SC-005, SC-006 races       |
| Contract current                                           | `bin/pnpm gen:api` then `git diff --exit-code apps/api/openapi.json`                  | no diff                          |
| e2e + axe (stack running)                                  | `docker compose --profile e2e run --rm e2e`                                           | photos specs green               |
| Dependency CVEs                                            | `bin/security`                                                                        | no multer or body-parser finding |
