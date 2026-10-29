---
'@bseat/api': minor
---

Owners can reorder a space's photos (`PUT /api/owner/spaces/{spaceId}/photos/order`, the first becomes the cover) and delete one (`DELETE .../photos/{photoId}`, the rest move up). A stale order returns 409 `photo:order-stale`. Deleted files are removed by a background sweep.
