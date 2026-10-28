---
'@bseat/api': minor
---

Renters can book a day, week or month pass for a seat with `POST /api/listings/{spaceId}/bookings`. The seat is held for every open day of the pass, two renters can never hold the same seat at once, and the booking carries the price at the time of booking.
