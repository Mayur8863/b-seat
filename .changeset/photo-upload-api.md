---
'@bseat/api': minor
---

Owners can upload space photos: `POST /api/owner/spaces/{spaceId}/photos` accepts one JPEG, PNG or WebP (up to 10 MB), re-encodes it without metadata into a card and a display size, stores both, and adds it to the space at the next position (at most 10 per space). Failures return typed `photo:*` problems, and a busy server answers 503 with `Retry-After`.
