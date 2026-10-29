---
'@bseat/api': minor
---

Listing search results now carry each space's cover photo (small version only) and the listing detail carries its photos, as short-lived signed URLs with `photoUrlsExpireAt`. Spaces without photos return `cover: null` or an empty list.
