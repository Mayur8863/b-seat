---
'@bseat/api': minor
---

Owners can list a space's photos (`GET /api/owner/spaces/{spaceId}/photos`) and set or clear a photo's description (`PATCH .../photos/{photoId}`). The 503 "busy" response to a full upload queue is now logged at warn instead of error.
