---
'@bseat/api': patch
---

Booking emails fail fast when Redis is not ready, so a booking returns without waiting out the enqueue bound. The two failure log lines are now `booking.confirmation_not_queued` and `booking.owner_notification_not_queued`.
