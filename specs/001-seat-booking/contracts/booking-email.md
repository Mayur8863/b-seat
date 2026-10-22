# Contract: booking confirmation email (FR-008, AC 2.2, SC-004)

The email is built by `apps/api/src/bookings/booking-confirmation.mail.ts` as a pure function,
`buildBookingConfirmation(booking, user): MailJob`, and sent through `MailService.send(job, { jobId })`.

| Field        | Value                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| Queue job id | `booking-confirmed:<bookingId>` (BullMQ dedupes, so a retry cannot send twice) |
| To           | the caller's account email (`session.user.email`)                              |
| Subject      | `Seat {seatLabel} booked at {spaceName} on {date}`                             |
| Text body    | see below (plain text required; HTML optional, same content)                   |

Text body template:

```text
Hi {userName},

Your seat is booked.

Space:  {spaceName} ({location})
Seat:   {seatLabel}
When:   {weekday} {date}, {startTime}–{endTime} ({timeZone})

You can see or cancel your bookings at {appUrl}/bookings.

BSeat
```

- `{date}`, `{startTime}`, `{endTime}` and `{weekday}` are in the **space's** local time
  (from `toLocal(startsAt, timeZone)`). `{timeZone}` is the IANA id, for example `Europe/London`.
- `{appUrl}` comes from the existing env `NEXT_PUBLIC_APP_URL`.
- User-supplied text (`userName`) must be escaped if an HTML part is added.
- Never log the address or the body (AGENTS.md security rules). Log only `{ bookingId, jobId }`.

The test (T010) asserts that the message reaching Mailpit for a unique recipient has the subject
above and a body containing the space name, seat label, local date, local start and end times,
and the time zone.
