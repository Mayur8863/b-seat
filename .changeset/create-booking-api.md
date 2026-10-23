---
'@bseat/api': minor
---

Add `POST /api/bookings` to book a seat for a local time window. A window that breaks a booking rule returns 422 naming the rule, and a clash with an existing booking returns 409, even under concurrent requests.
