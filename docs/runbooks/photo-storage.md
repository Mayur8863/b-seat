# Photo storage on AWS

Applies to spec 003 (space photos), ADR-0011. **No cloud resource is created or changed without human approval**
(plan OQ-1). This runbook describes the target; nothing here has been provisioned.

## Runtime check: sharp in the production image

CI builds `docker/api.Dockerfile` for linux/amd64 only (ubuntu-latest) and runs a smoke step:

```sh
docker run --rm --entrypoint node bseat-api:ci -e "import('sharp').then(s => console.log(s.default.versions))"
```

It prints the libvips versions and exits 0. Checked locally on amd64 with no Dockerfile change needed
(`pnpm deploy --prod` keeps sharp's platform package). arm64 was not tested (no qemu/buildx arm64 builder).
If Fargate is ever run on Graviton, build and smoke-test arm64 first.

## Bucket (one per environment, `bseat-photos-<env>`)

- Private: Block Public Access on (all four settings).
- Object Ownership: bucket owner enforced (ACLs disabled).
- Default encryption SSE-S3.
- Bucket policy denying any request with `aws:SecureTransport = false` (TLS only).
- Versioning off, so a delete is final.
- Lifecycle rule: abort incomplete multipart uploads after 1 day.
- No bucket CORS (uploads go through the API; `<img>` loads need none).

## IAM (ECS task role)

Allow only `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::bseat-photos-<env>/spaces/*`.
No `s3:ListBucket` (keys are derived from ids). Credentials come from the task role: leave `S3_ENDPOINT`,
`S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` unset; set `S3_REGION` and `S3_BUCKET_PHOTOS`.

## Fargate API memory

T006 measured fresh-process peak RSS: about 285 MiB (7000x7000 progressive JPEG), about 223 MiB (16-bit RGBA PNG,
orientation 6); baseline about 50 MiB. Formula: baseline + 16 x 10 MiB (buffered uploads at the semaphore limit)

- 2 x peak + 30%.

```
50 + 16 x 10 + 2 x 285 = 50 + 160 + 570 = 780 MiB
780 x 1.3             = 1014 MiB
```

1014 MiB is right at the 1 GB floor with about 1% headroom, so set the task to **2 GB (2048 MiB)** with 0.5 vCPU
(a valid Fargate pair). Re-derive if T006's limits or the upload semaphore change.

## Staging checks before the first deploy (ADR-0011 section 5)

Run in staging with the real task role, not static keys.

1. From a running task, sign a GET URL with `signingDate` backdated by up to the window `W` (`floor(now/W) x W`,
   so up to `W` in the past) and `expiresIn = PHOTO_URL_TTL_SECONDS`.
2. Fetch it with `curl -I` immediately, and again near the end of its life (just before `signingDate + TTL`).
   Both must return 200. Repeat after the task role credentials have rotated (about 6 hours; or check
   across a rotation boundary).
3. Confirm the response carries `Cache-Control: private` and an `Expires` equal to the URL expiry, and that a
   URL fetched after expiry returns 403.
4. Fallback: if a backdated URL stops working when its signing credentials expire, switch to unwindowed signing
   (sign at `now`, `expiresIn = TTL`) in `apps/api/src/storage/`. Browser cache reuse drops; SC-003 still holds
   without cache hits.
5. Expect URLs to differ per task (each task has its own credentials); this is fine.

## Purge operations

_Placeholder: T027 fills this in (outbox purge sweep, stuck rows, manual purge of a space's objects)._
