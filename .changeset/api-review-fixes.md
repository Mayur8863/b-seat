---
'@bseat/api': patch
---

Review fixes for the marketplace API: a listing search scans at most 200 candidates per request and returns a continuation cursor, booking reads price, slot and calendar under the space lock, free text rejects control characters, pricing errors name the field, my bookings keep the times that were booked, booking emails sanitise the renter name, every space writer sets a lock timeout, and unsafe `/api` requests from another site are refused.
