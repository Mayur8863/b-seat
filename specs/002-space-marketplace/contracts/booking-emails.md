# Contract: booking emails (FR-021, AC 4.5, AC 4.10, SC-006)

Built by pure functions in `apps/api/src/bookings/booking-emails.ts` (T037), queued through `MailService` after the
booking transaction commits, each awaited for at most 2 s (ADR-0008 section 5). Logs carry ids only, never
addresses or bodies. Plain text, like 001's confirmation.

Shared lines (both emails):

```text
Space:   {space.name}, {space.area}, {space.city}
Seat:    {seat.label}{ (cubicle {cubicleName})}
Pass:    {Day pass | Weekly pass | Monthly pass}, {Day | Night | 24 hours | Working hours} slot ({startTime}–{endTime}{ next day})
Period:  {startDate} to {endDate} ({timeZone}); {n} days included{; closed: {skippedDates}}
Price:   {amount} {currency}
Payment is made directly to the owner. BSeat does not take payment.
```

Dates use `YYYY-MM-DD` plus the weekday, in the space's zone (FR-033).

## Renter confirmation

- **To**: the renter. **Job id**: `booking-confirmed-<bookingId>`.
- **Subject**: `Booking confirmed: seat {label} at {space.name} from {startDate}`
- **Body**: greeting, the shared lines, a link to `{APP_URL}/bookings`, and how to cancel (before the first slot starts).

## Owner notification

- **To**: the space owner. **Job id**: `booking-owner-notified-<bookingId>`.
- **Subject**: `New booking at {space.name}: seat {label} from {startDate}`
- **Body**: the renter's name (AC 4.10), the shared lines, and a link to `{APP_URL}/owner/spaces/{spaceId}/bookings`.
  The renter's email address is not included in the email (the spec asks for the name; the owner sees the email
  in the bookings list, FR-027).

No email is sent on cancellation in this feature (the spec does not ask for one).
