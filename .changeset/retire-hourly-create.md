---
'@bseat/api': minor
---

Remove `POST /api/bookings` (the hourly booking create; it now returns 404). `GET /api/spaces` lists only published spaces, and `GET /api/spaces/{id}/availability` returns 404 for a draft or unpublished space.
