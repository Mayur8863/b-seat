---
'@bseat/api': minor
---

Owners can save a floor plan for a space (`GET` and `PUT /api/owner/spaces/{spaceId}/layout`, with versioned saves), renters can read it (`GET /api/listings/{spaceId}/layout`), and `hasLayout` is now real on owner spaces and listings. Removing a seat or cubicle removes its place on the plan.
