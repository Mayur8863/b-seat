# Runbook: booking confirmation emails

After a booking commits, the API queues a confirmation email in Redis (BullMQ). The mail worker
sends it over SMTP. The booking never depends on the email: if the email cannot be queued, the
API still returns 201 (FR-008, ADR-0008 section 5). See [ADR-0008](../adr/0008-booking-time-and-conflict-model.md).

## See confirmation emails locally

1. Start the stack with `docker compose up -d --wait`. Mailpit must be running.
2. Book a seat, from the Book a seat page at http://localhost:3000/book or through
   `POST /api/bookings` in Swagger at http://localhost:3001/docs.
3. Open http://localhost:8025. The email appears within a few seconds.
   - Recipient: the email address of the signed-in account.
   - Subject: `Seat <label> booked at <space> on <date>`.
   - Body: space, seat, local date and time range, and the space's time zone.

The local stack sends mail to Mailpit (`SMTP_HOST=mailpit` in `docker-compose.yml`), so nothing reaches
a real inbox. Check `SMTP_HOST` in `.env` before you assume that.

The email links to `/bookings`, which is built in T013. Until then, that link leads to a 404 page.

## Log events

The booking code logs these events with the pino logger. The fields are ids and one reason code.
None carries an email address, a name, a subject or a body.

| Event                             | Level | Fields                | Meaning                                                                                         |
| --------------------------------- | ----- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `booking.created`                 | info  | `bookingId`, `seatId` | The booking row committed. Logged before the email is queued.                                   |
| `booking.confirmation_queued`     | info  | `bookingId`, `jobId`  | The email job was added to the mail queue within 2 s.                                           |
| `booking.confirmation_not_queued` | error | `bookingId`, `reason` | Queueing failed or timed out. `reason` is `rejected` or `timeout`. The booking still succeeded. |

`jobId` is `booking-confirmed-<bookingId>`. While BullMQ still holds that id, a second enqueue for the
same booking is ignored, so there is one job, not two.

The mail worker logs `mail sent` (fields `jobId` and `subject`) after SMTP accepts a message. Subjects
contain the space name, seat label and date, but never the body. BullMQ makes up to 5 attempts at each
send, with exponential backoff. The API logs nothing for a failed attempt.

Find the events for a time window:

```bash
docker compose logs --since 1h api | grep 'booking\.'
```

## When `booking.confirmation_not_queued` appears

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
The `booking.confirmation_not_queued` line is the only trace, so keep those lines. Alerting on that
event is recommended; no alert is configured in this repository yet.

A transactional outbox (a table written in the booking transaction and relayed to the queue) removes
this risk. Write a new ADR before adding one. Its revisit triggers are listed in ADR-0008 section 5:
email becomes a guaranteed requirement, cancellation emails are added, or lost confirmations show up
in production.
