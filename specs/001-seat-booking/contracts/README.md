# Contracts: Seat booking

These markdown files describe the intended API. The **real contract** is the generated
`apps/api/openapi.json`. It is produced from the Zod schemas by `bin/pnpm gen:api` and reviewed
in each backend PR. If this document and `openapi.json` disagree after implementation, the PR
fixes one of them.

- [spaces.md](./spaces.md): `GET /api/spaces`, `GET /api/spaces/{spaceId}/availability`
- [bookings.md](./bookings.md): `POST /api/bookings`, `GET /api/bookings`, `POST /api/bookings/{bookingId}/cancel`
- [booking-email.md](./booking-email.md): the confirmation email (FR-008)

## Conventions (from AGENTS.md)

- Every route is under `/api`, uses `@UseGuards(AuthGuard)` + `@ApiCookieAuth()`, and every handler
  takes `@CurrentSession()`. Without a valid session, every route returns **401**
  `urn:bseat:problem:http-401` (FR-001, AC 1.4).
- Request schemas end in `Input`. Response schemas are nouns. No schema is shared between directions.
  Each named schema has `.meta({ id })`.
- Validation uses `@Body({ schema })`, `@Query({ schema })` and `@Param('x', { schema })`. Failures
  return **400** `urn:bseat:problem:validation` with `errors[]` (existing `validationPipe`).
- Every error response is `Problem` (existing `ProblemSchema`), with content type
  `application/problem+json`, documented with `@Api…Response({ standardSchema: ProblemSchema })`.
- Lists are wrapped as `{ items: [...] }`, so pagination can be added later without breaking clients.
- Times: requests use the space's local wall-clock time (`date`, `startTime`, `endTime`).
  Responses add UTC instants (`startsAt`, `endsAt`, ISO 8601 with `Z`) and `timeZone`. See research R-2.
- Generated operation ids follow `<Controller>_<method>` (existing `operationIdFactory`). The
  resulting orval hooks are listed per endpoint.

## Shared field formats

| Name        | Zod                                                       | Example                      |
| ----------- | --------------------------------------------------------- | ---------------------------- |
| `LocalDate` | `z.iso.date()`                                            | `"2026-10-23"`               |
| `LocalTime` | `z.string().regex(/^([01]\d\|2[0-3]):[0-5]\d$/)`          | `"09:00"`                    |
| `Instant`   | `z.iso.datetime()` (serialized from `Date.toISOString()`) | `"2026-10-23T08:00:00.000Z"` |
| `Uuid`      | `z.uuid()`                                                | `"0b6c…"`                    |
| `TimeZone`  | `z.string()` (IANA id)                                    | `"Europe/London"`            |

These are unnamed primitive helpers (no `.meta({ id })`), so they never become shared OpenAPI components.
Every **named** object schema belongs to one direction only. Requests: `CreateBookingInput` and
`AvailabilityQueryInput` (path ids are inline `z.uuid()`). Responses: `Space`, `SpaceList`,
`SeatAvailability`, `SpaceAvailability`, `Booking` and `BookingList`.

## Problem types introduced by this feature

All of them use the new `ProblemException` (research R-7, ADR-0008 section 3). The API exports the `type`
strings as constants, so services never use string literals. `detail` is a human-readable sentence
that names the broken rule (FR-007). The web app maps `type` to its own copy (ui.md) and falls
back to `detail`.

| Status | `type`                                                 | `title`                 | When                                                             | Spec                      |
| ------ | ------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------- | ------------------------- |
| 404    | `urn:bseat:problem:http-404` (existing mapping)        | not found               | space, seat or booking does not exist **or is not the caller's** | edge case, FR-011, AC 3.4 |
| 409    | `urn:bseat:problem:booking:seat-unavailable`           | Seat unavailable        | `booking_seat_no_overlap` violated                               | FR-005, AC 2.3, AC 2.4    |
| 409    | `urn:bseat:problem:booking:user-overlap`               | Overlapping booking     | `booking_user_no_overlap` violated                               | FR-006, AC 2.5            |
| 409    | `urn:bseat:problem:booking:already-started`            | Booking already started | cancel when `starts_at <= now`                                   | AC 3.5                    |
| 422    | `urn:bseat:problem:booking-rule:end-before-start`      | Invalid booking window  | `endTime < startTime` (equal times fail `too-short`)             | FR-007, AC 2.6            |
| 422    | `urn:bseat:problem:booking-rule:not-on-quarter-hour`   | Invalid booking window  | minutes not in {00,15,30,45}                                     | FR-007, AC 2.6            |
| 422    | `urn:bseat:problem:booking-rule:invalid-local-time`    | Invalid booking window  | local start or end does not exist or is ambiguous (DST)          | edge case DST             |
| 422    | `urn:bseat:problem:booking-rule:too-short`             | Invalid booking window  | duration < 15 min                                                | FR-007                    |
| 422    | `urn:bseat:problem:booking-rule:too-long`              | Invalid booking window  | duration > 10 h                                                  | FR-007, AC 2.6            |
| 422    | `urn:bseat:problem:booking-rule:outside-working-hours` | Invalid booking window  | start < 07:00 or end > 20:00 local                               | FR-007, AC 2.6            |
| 422    | `urn:bseat:problem:booking-rule:starts-in-past`        | Invalid booking window  | `startsAt <= now`                                                | FR-007, AC 2.6            |
| 422    | `urn:bseat:problem:booking-rule:too-far-ahead`         | Invalid booking window  | `startsAt > now + 30 × 24 h`                                     | FR-007, AC 2.6            |

The rules are evaluated in the order above (research R-3, ADR-0008 section 1), and the first failure
is returned. The duration rules use real instants, and the working-hours rule uses the local wall-clock.
`invalid-local-time` can also come from the availability endpoint, if the window's start or end falls
into a DST gap or overlap.

Suggested `detail` strings (backend). The UI copy in ui.md may differ:

- end-before-start: "The end time must be after the start time."
- not-on-quarter-hour: "Start and end times must be on a 15-minute boundary (:00, :15, :30 or :45)."
- too-short: "A booking must be at least 15 minutes long."
- too-long: "A booking can be at most 10 hours long."
- outside-working-hours: "Bookings must be between 07:00 and 20:00 local time ({timeZone})."
- invalid-local-time: "That local time does not exist or is ambiguous because of a daylight-saving change."
- starts-in-past: "The booking must start in the future."
- too-far-ahead: "Bookings can start at most 30 days ahead."
- seat-unavailable: "This seat is no longer available for that time."
- user-overlap: "You already have a booking at that time."
- already-started: "This booking has already started and can no longer be cancelled."
