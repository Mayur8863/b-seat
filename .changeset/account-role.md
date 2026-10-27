---
'@bseat/api': minor
---

Accounts now have a type (owner or renter) chosen at sign-up and fixed afterwards. Sign-up requires `accountType` on the API (the web choice ships later), `GET /api/me` returns it, and existing accounts are renters.
