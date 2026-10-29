# Runbook: booking confirmation emails

After a booking commits, the API queues two emails in Redis (BullMQ): a confirmation to the renter and a
notification to the space owner. The mail worker sends them over SMTP. The booking never depends on the
email: if an email cannot be queued, the API still returns 201 (FR-021, ADR-0008 section 5). See
[ADR-0008](../adr/0008-booking-time-and-conflict-model.md) and [ADR-0009](../adr/0009-pass-bookings-seat-holds-and-slots.md).

## See confirmation emails locally

1. Start the stack with `docker compose up -d --wait`. Mailpit must be running.
2. Book a pass: open a space at http://localhost:3000/find, pick a seat and confirm, or use
   `POST /api/listings/{spaceId}/bookings` in Swagger at http://localhost:3001/docs.
3. Open http://localhost:8025. Both emails appear within a few seconds.
   - Renter: to the signed-in account. Subject `Booking confirmed: seat <label> at <space> from <start date>`.
   - Owner: to the space's owner. Subject `New booking at <space>: seat <label> from <start date>`.
   - Body: price, the period with the space's time zone, and that payment is made directly to the owner.

The local stack sends mail to Mailpit (`SMTP_HOST=mailpit` in `docker-compose.yml`), so nothing reaches
a real inbox. Check `SMTP_HOST` in `.env` before you assume that.

## Log events

The booking code logs these events with the pino logger. The fields are ids only. None carries an
email address, a name, a subject or a body.

| Event                                   | Level | Fields                           | Meaning                                                                                                        |
| --------------------------------------- | ----- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `booking.created`                       | info  | `bookingId`, `seatId`, `spaceId` | The booking row committed. Logged before the emails are queued.                                                |
| `booking.confirmation_not_queued`       | error | `bookingId`, `recipient`         | The renter's email could not be queued, or the enqueue did not settle within 2 s. The booking still succeeded. |
| `booking.owner_notification_not_queued` | error | `bookingId`, `recipient`         | The owner's email could not be queued, or the enqueue did not settle within 2 s. The booking still succeeded.  |

The API does not log a successful enqueue, and it does not log why an enqueue failed. Both failures
log the same way. Logs from before T069 use the old name `booking.email_enqueue_failed`.

Each email has its own job id, so a retried enqueue for the same booking is ignored while BullMQ still
holds the job:

- renter: `booking-confirmed-<bookingId>`
- owner: `booking-owner-notified-<bookingId>`

When Redis is not ready, the enqueue fails at once and both `*_not_queued` lines appear without waiting
for the 2 s bound. The booking still returns 201.

The mail worker logs `mail sent` (fields `jobId` and `subject`) after SMTP accepts a message. Subjects
contain the space name, seat label and date, but never the body. BullMQ makes up to 5 attempts at each
send, with exponential backoff. The API logs nothing for a failed attempt.

Find the events for a time window:

```bash
docker compose logs --since 1h api | grep 'booking\.'
```

Mail worker lines are in the same log: `docker compose logs --since 1h api | grep 'mail sent'`.

## When a `*_not_queued` line appears

The booking stands. Do **not** ask the user to book again. A second request for the same seat and
window returns 409 `seat-unavailable`, not a second email.

Most causes are Redis being down or slow:

```bash
docker compose ps redis                       # State should be healthy
docker compose exec redis redis-cli ping      # Should print PONG
```

Then check the email:

1. Check for the email first. Locally, search Mailpit (http://localhost:8025) for the user's
   address. Outside local development, check the mailbox or SMTP logs for that address. A timed-out
   enqueue can still succeed after Redis returns, so the email may arrive without any further action.
2. If the email is missing and Redis is healthy, raise it with the product owner. **There is no
   resend command in this slice.** The booking is valid, so only the email is missing.

### Accepted risk: lost confirmations

If Redis is down **and** the API process restarts before Redis returns, the pending job is lost.
Nothing else stores it, so the email is never sent. ADR-0008 section 5 accepts this for this slice.
The `*_not_queued` lines are the only trace, so keep those lines. Alerting on that
event is recommended; no alert is configured in this repository yet.

A transactional outbox (a table written in the booking transaction and relayed to the queue) removes
this risk. Write a new ADR before adding one. Its revisit triggers are listed in ADR-0008 section 5:
email becomes a guaranteed requirement, cancellation emails are added, or lost confirmations show up
in production.
