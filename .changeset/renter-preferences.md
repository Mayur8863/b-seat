---
'@bseat/api': minor
---

Renters can save optional search defaults (country, city, area) with `PUT /api/me/preferences`, and `GET /api/me` returns them as `preferences` (or `null`). Owner accounts get 403.
