---
'@bseat/api': patch
---

Concurrent bookings for the same seat now queue on a per-seat lock, so racing requests get a clean 409 instead of an occasional 500 or timeout.
