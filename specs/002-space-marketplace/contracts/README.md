# Contracts: Space marketplace

These files describe the intended API. The **real contract** is the generated `apps/api/openapi.json`, produced
from the Zod schemas by `bin/pnpm gen:api` and reviewed in each backend PR. If this folder and `openapi.json`
disagree after implementation, the PR fixes one of them.

- [accounts.md](./accounts.md): sign-up role (Better Auth), `GET /api/me`, `PUT /api/me/preferences`, `GET /api/reference`
- [owner-spaces.md](./owner-spaces.md): `/api/owner/spaces` listing CRUD, publish, seats, cubicles, pricing
- [owner-operations.md](./owner-operations.md): calendars, occupancy, owner bookings, layout
- [listings.md](./listings.md): `/api/listings` search, suggestions, detail, seat availability, layout view
- [bookings.md](./bookings.md): create a pass booking, my bookings, cancel
- [booking-emails.md](./booking-emails.md): renter confirmation and owner notification

## Conventions (unchanged from 001, see AGENTS.md and ADR-0008 section 3)

- Every route is under `/api`, behind `AuthGuard` + `@ApiCookieAuth()` (FR-005). No session → 401.
- Request schemas end in `Input`; response schemas are nouns; no schema is shared between directions; named
  schemas have `.meta({ id })`. Request objects are `z.strictObject` (unknown keys → 400; carried over from 001
  review follow-up (b)).
- Validation failures → 400 `urn:bseat:problem:validation` with `errors[]`.
- Lists are `{ items: [...] }`. Paged lists add `nextCursor: string | null`.
- Times: requests carry local **dates** (`LocalDate`) and owner-set local **times** (`LocalTime`). Responses add
  UTC instants (`Instant`) and `timeZone`, so the web never does time-zone arithmetic (FR-033).
- Money is `{ amount: DecimalString, currency: CurrencyCode }` (research R-8).
- Operation ids are `<Controller>_<method>`; orval hooks follow (`useOwnerSpacesCreate`, …).

## New shared field formats (unnamed helpers, no `.meta({ id })`)

| Name                     | Zod                                                                  | Example              |
| ------------------------ | -------------------------------------------------------------------- | -------------------- |
| `CountryCode`            | `z.string().regex(/^[A-Z]{2}$/)` + refine against the reference list | `"IN"`               |
| `CurrencyCode`           | `z.string().regex(/^[A-Z]{3}$/)` + refine against `Intl`             | `"INR"`              |
| `DecimalString` (input)  | `z.string().regex(/^(0\|[1-9]\d{0,9})(\.\d{1,2})?$/)` + refine `> 0` | `"1500"`, `"1500.5"` |
| `DecimalString` (output) | always two decimals                                                  | `"1500.50"`          |
| `SlotKind`               | `z.enum(['day','night','full_day','working_hours'])`                 |                      |
| `PassType`               | `z.enum(['day','week','month'])`                                     |                      |
| `StandardUtility`        | `z.enum([...11 codes, OQ-8])`                                        | `"wifi"`             |
| `Weekday`                | `z.enum(['mon','tue','wed','thu','fri','sat','sun'])`                |                      |

Standard utility codes (OQ-8): `wifi`, `air_conditioning`, `power_backup`, `parking`, `meeting_room`,
`tea_coffee`, `printer`, `lockers`, `security_24h`, `cafeteria`, `accessible_entrance`.

## Route map

| Method        | Path                                                             | Role                                | Spec                   | Task                      |
| ------------- | ---------------------------------------------------------------- | ----------------------------------- | ---------------------- | ------------------------- |
| POST          | `/api/auth/sign-up/email` (Better Auth, body adds `accountType`) | public                              | FR-001                 | T002                      |
| GET           | `/api/me` (adds `accountType`, `preferences`)                    | any                                 | FR-001, FR-002         | T002, T013                |
| PUT           | `/api/me/preferences`                                            | renter                              | FR-002                 | T013                      |
| GET           | `/api/reference`                                                 | any                                 | FR-006                 | T019                      |
| GET, POST     | `/api/owner/spaces`                                              | owner                               | FR-006, AC 1.4         | T020                      |
| GET, PATCH    | `/api/owner/spaces/{spaceId}`                                    | owner                               | FR-006, FR-009         | T020                      |
| POST          | `/api/owner/spaces/{spaceId}/publish`, `/unpublish`              | owner                               | FR-008, AC 2.4, AC 2.5 | T020                      |
| GET, POST     | `/api/owner/spaces/{spaceId}/seats`                              | owner                               | FR-007, AC 2.3         | T021 (+ today state T047) |
| PATCH, DELETE | `/api/owner/spaces/{spaceId}/seats/{seatId}`                     | owner                               | FR-007                 | T021                      |
| GET, POST     | `/api/owner/spaces/{spaceId}/cubicles`                           | owner                               | AC 2.3, edge           | T021                      |
| PATCH, DELETE | `/api/owner/spaces/{spaceId}/cubicles/{cubicleId}`               | owner                               | edge                   | T021                      |
| GET, PUT      | `/api/owner/spaces/{spaceId}/pricing`                            | owner                               | FR-010–FR-012          | T027                      |
| GET           | `/api/owner/spaces/{spaceId}/calendars`                          | owner                               | FR-024                 | T051                      |
| PUT           | `/api/owner/spaces/{spaceId}/calendars/shared`                   | owner                               | FR-024, FR-025         | T051                      |
| PUT, DELETE   | `/api/owner/spaces/{spaceId}/seats/{seatId}/calendar`            | owner                               | AC 6.3                 | T051                      |
| GET, POST     | `/api/owner/spaces/{spaceId}/occupancy`                          | owner                               | FR-022, FR-023         | T047                      |
| POST          | `/api/owner/spaces/{spaceId}/occupancy/{markId}/end`             | owner                               | AC 5.2                 | T047                      |
| GET           | `/api/owner/spaces/{spaceId}/bookings`                           | owner                               | FR-027                 | T056                      |
| GET, PUT      | `/api/owner/spaces/{spaceId}/layout`                             | owner                               | FR-029, FR-030         | T062                      |
| GET           | `/api/listings`                                                  | any                                 | FR-014, FR-015         | T034, T038                |
| GET           | `/api/listings/locations`                                        | any                                 | AC 4.2                 | T034                      |
| GET           | `/api/listings/{spaceId}`                                        | any                                 | AC 3.5, FR-012         | T028                      |
| GET           | `/api/listings/{spaceId}/seats`                                  | any                                 | FR-016, AC 4.4, AC 6.4 | T035                      |
| GET           | `/api/listings/{spaceId}/layout`                                 | any                                 | FR-031                 | T062                      |
| POST          | `/api/listings/{spaceId}/bookings`                               | any (not the space's owner)         | FR-017–FR-021          | T036, T037                |
| GET           | `/api/bookings`                                                  | any                                 | FR-026                 | T055                      |
| POST          | `/api/bookings/{bookingId}/cancel`                               | any                                 | FR-026, FR-028         | T055                      |
| ~~POST~~      | ~~`/api/bookings`~~ (hourly create)                              | removed                             | R-7                    | T008                      |
| ~~GET~~       | ~~`/api/spaces`~~, ~~`/api/spaces/{spaceId}/availability`~~      | published-only (T008), then removed | R-7                    | T043                      |

"any" means any signed-in user. Owners may use renter routes for other owners' spaces (Assumptions). The role
column is enforced by `RolesGuard` reading `session.user.accountType`. A wrong role is 403, and ownership
mismatches are 404 ([ADR-0010](../../../docs/adr/0010-account-roles-and-owner-authorization.md)).

Request schemas for query strings are named too: `SearchListingsInput`, `LocationSuggestionsInput`,
`SeatAvailabilityInput`, `ListMyBookingsInput` (`limit`), `ListOccupancyInput` (`seatId`) and
`ListOwnerBookingsInput` (`from`, `to`, `cursor`, `limit`).

## Problem types introduced by this feature

All use `ProblemException` and are exported as constants from `apps/api/src/common/errors/problem-types.ts`
(T007). 001 types that are reused keep their meaning. `detail` names the rule (FR-020). Each type's exact `title`
and `detail` are in the [problem copy registry](#problem-copy-registry-title-and-detail) below.

**The web never displays `title` or `detail` (OQ-H, decided in T018).** It maps `type` plus the screen's action to
ui spec copy (`lib/marketplace-problems.ts`, ui/01 section 7 and ui/02 section 9) and, for an unmapped type, falls
back by HTTP status. `title` and `detail` serve API clients, logs and support. They are plain English and never
carry personal data or interpolated values; the extension members carry the data.

| Status | `type`                                                | When                                                                                                   | Spec                           |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 403    | `urn:bseat:problem:http-403` (existing mapping)       | wrong role for the route (renter on `/api/owner/*`, owner on `PUT /api/me/preferences`)                | FR-001, AQ-6                   |
| 404    | `urn:bseat:problem:http-404`                          | missing **or not yours / not published**                                                               | FR-009, FR-028, AC 2.6, AC 7.4 |
| 409    | `urn:bseat:problem:booking:seat-unavailable` (001)    | `seat_hold_seat_no_overlap` on booking create                                                          | AC 4.6, AC 4.7, SC-005         |
| 409    | `urn:bseat:problem:booking:user-overlap` (001)        | `seat_hold_user_no_overlap`                                                                            | AC 4.8, FR-019                 |
| 409    | `urn:bseat:problem:booking:already-started` (001)     | cancel after the first slot started                                                                    | AC 7.2                         |
| 422    | `urn:bseat:problem:booking-rule:space-not-published`  | booking a space that is not published                                                                  | FR-020                         |
| 422    | `urn:bseat:problem:booking-rule:own-space`            | the caller owns the space                                                                              | FR-020, edge                   |
| 422    | `urn:bseat:problem:booking-rule:pass-not-offered`     | slot off, slot not valid for the opening mode, or no price                                             | FR-011                         |
| 422    | `urn:bseat:problem:booking-rule:start-day-closed`     | the seat's calendar closes the start date                                                              | AC 6.4, FR-017                 |
| 422    | `urn:bseat:problem:booking-rule:slot-started`         | the first slot has started                                                                             | AC 4.9, FR-020                 |
| 422    | `urn:bseat:problem:booking-rule:too-far-ahead` (001)  | first slot starts more than 30 × 24 h from now                                                         | AC 4.9, FR-020                 |
| 422    | `urn:bseat:problem:listing:publish-incomplete`        | publish without an active seat and/or an offered pass; extension `missing: ('seat' \| 'pricedPass')[]` | FR-008, AC 2.4                 |
| 422    | `urn:bseat:problem:listing:seat-limit`                | more than 200 active seats                                                                             | FR-007                         |
| 409    | `urn:bseat:problem:listing:label-taken`               | duplicate label among active seats; extension `labels: string[]`                                       | FR-007, AC 2.3                 |
| 409    | `urn:bseat:problem:listing:cubicle-name-taken`        | duplicate name among a space's active cubicles (create or rename)                                      | AC 2.3                         |
| 409    | `urn:bseat:problem:listing:seat-has-future-bookings`  | removing a seat (or a cubicle's seats) with future bookings                                            | FR-007, edge                   |
| 409    | `urn:bseat:problem:occupancy:conflicts-with-bookings` | marking over renter bookings; extension `conflicts` (see below)                                        | FR-023, AC 5.3                 |
| 409    | `urn:bseat:problem:occupancy:already-occupied`        | overlapping only the owner's own active marks; same extension                                          | AC 5.1                         |
| 409    | `urn:bseat:problem:layout:stale-version`              | layout saved from an old version                                                                       | FR-029                         |
| 422    | `urn:bseat:problem:layout:out-of-bounds`              | an element outside the grid, or a seat outside its cubicle                                             | FR-029                         |

**Extension members (AQ-3, decided:
[ADR-0009](../../../docs/adr/0009-pass-bookings-seat-holds-and-slots.md) section 8).** `ProblemSchema` is
**unchanged**. The three types that carry extra members each get a dedicated named **response** schema, built
with `ProblemSchema.extend({...}).meta({ id })`, with the members **required**. Only the route and status that
emit it document it:

| Schema id                  | Extension                                                                                                                                                 | Documented on                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `PublishIncompleteProblem` | `missing: ('seat' \| 'pricedPass')[]` (min 1)                                                                                                             | 422 of `POST /api/owner/spaces/{spaceId}/publish`                |
| `LabelTakenProblem`        | `labels: string[]` (min 1)                                                                                                                                | 409 of `POST …/seats` and `PATCH …/seats/{seatId}`               |
| `OccupancyConflictProblem` | `conflicts: { seatId: uuid, label: string, bookedDates: LocalDate[], marks: { id: uuid, startDate: LocalDate, endDate: LocalDate \| null }[] }[]` (min 1) | 409 of `POST /api/owner/spaces/{spaceId}/occupancy` (both types) |

`bookedDates` are renter occurrence dates (finite, since bookings start at most 30 days ahead). Existing marks are
reported as ranges, because an open-ended mark has no finite date list. Neither ever includes renter identities.

`ProblemException` gains an optional `extensions` record. `ProblemFilter` spreads it **before** the standard
members, so an extension can never override `type`, `title`, `status`, `detail` or `instance`. Every other
problem keeps plain `ProblemSchema`.

**Booking rule order** (first failure wins): `space-not-published`, `own-space`, `pass-not-offered`,
`start-day-closed`, `slot-started`, `too-far-ahead`; then the insert decides `seat-unavailable` / `user-overlap`.
An unknown space, a `draft` space, an unknown seat, a removed seat or a seat in another space → 404
(`space-not-published` is only for `unpublished` spaces, which were listed once; ADR-0010).

`booking-rule:invalid-local-time` (001) is **not** part of the 002 contract. Renters send dates only, and
owner-set slot boundaries in a DST gap or overlap resolve by the "compatible" rule (ADR-0009 section 4).

## Problem copy registry (`title` and `detail`)

The single source for every problem's `title` and `detail` (folded in from ui/02 section 9.2 by the architect,
T018). Titles of the typed problems are short noun phrases in sentence case; `detail` is one or two plain sentences
with the next step where one exists. The `ProblemFilter` rows (`validation`, `http-*`, `internal`) are 001 behaviour
and keep their lowercase status-text titles. Code must match this table exactly, and the unit tests of each factory or thrower assert both
strings. "Changes" names what differs from the code at the time of writing and the task that changes it.

| Status | `type` (after `urn:bseat:problem:`) | `title`                    | `detail`                                                                             | Thrown by (task)                                 | Changes                                                                                                 |
| ------ | ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 400    | `validation`                        | Request validation failed  | none (`errors[]` carries `path` and `message` per field)                             | `ProblemFilter` (001)                            | none                                                                                                    |
| 401    | `http-401`                          | unauthorized               | the exception message                                                                | `ProblemFilter` from `AuthGuard` (001)           | none                                                                                                    |
| 403    | `http-403`                          | forbidden                  | This action is not available for your account type                                   | `ProblemFilter` from `RolesGuard` (T002)         | none: the filter's status-text titles stay as in 001 (ui/02's proposed 403 and 404 details are dropped) |
| 404    | `http-404`                          | not found                  | `Not Found` (bare `new NotFoundException()`, never a custom message)                 | `ProblemFilter` from every service               | none. A custom message would break 404 parity between a foreign and a random id (ADR-0010)              |
| 500    | `internal`                          | internal server error      | none (never leaks internals)                                                         | `ProblemFilter` (001)                            | none                                                                                                    |
| 409    | `booking:seat-unavailable`          | Seat unavailable           | This seat is no longer available for that period.                                    | booking create (T036)                            | detail: 001 "that time" becomes "that period" (T036)                                                    |
| 409    | `booking:user-overlap`              | Overlapping booking        | You already have a booking at that time.                                             | booking create (T036)                            | none                                                                                                    |
| 409    | `booking:already-started`           | Booking already started    | This booking has already started and can no longer be cancelled.                     | cancel (T055)                                    | none                                                                                                    |
| 422    | `booking-rule:space-not-published`  | Space not listed           | This space is no longer listed.                                                      | booking rules (T036)                             | new                                                                                                     |
| 422    | `booking-rule:own-space`            | Your own space             | You can't book a seat in your own space. Mark it occupied instead.                   | booking rules (T036)                             | new                                                                                                     |
| 422    | `booking-rule:pass-not-offered`     | Pass not offered           | This space doesn't offer that pass for that slot.                                    | booking rules (T036)                             | new                                                                                                     |
| 422    | `booking-rule:start-day-closed`     | Start date closed          | This seat isn't available on the start date you chose.                               | booking rules (T036)                             | new                                                                                                     |
| 422    | `booking-rule:slot-started`         | Slot already started       | That slot has already started. Choose a later start date.                            | booking rules (T036)                             | new                                                                                                     |
| 422    | `booking-rule:too-far-ahead`        | Too far ahead              | Bookings can start at most 30 days ahead.                                            | booking rules (T036)                             | title: 001 "Invalid booking window" becomes "Too far ahead" (002 has no booking window; T036)           |
| 422    | `listing:publish-incomplete`        | Listing incomplete         | Add at least one seat and price at least one pass before publishing.                 | `publishIncomplete` factory (T007), used by T020 | none                                                                                                    |
| 422    | `listing:seat-limit`                | Seat limit reached         | A space can have at most 200 seats. No seats were added.                             | seat create (T021)                               | new                                                                                                     |
| 409    | `listing:label-taken`               | Seat label already used    | Another active seat in this space already uses that label. Choose a different label. | `labelTaken` factory (T007), used by T021        | title was "Seat label taken"; detail adds the next step (T021)                                          |
| 409    | `listing:cubicle-name-taken`        | Cubicle name already used  | Another active cubicle in this space already has that name. Choose a different name. | cubicle create and rename (T021)                 | new                                                                                                     |
| 409    | `listing:seat-has-future-bookings`  | Upcoming bookings          | Upcoming bookings prevent this removal. Wait until they end or are cancelled.        | seat and cubicle removal (T021)                  | new; neutral, because one type covers a seat and a cubicle's seats                                      |
| 409    | `occupancy:conflicts-with-bookings` | Seats are booked           | Some of these seats are booked by renters on those dates.                            | `occupancyConflict` factory (T007), used by T047 | none                                                                                                    |
| 409    | `occupancy:already-occupied`        | Seats are already occupied | You've already marked some of these seats occupied on those dates.                   | `alreadyOccupied` factory (T007), used by T047   | detail was "…active occupancy marks of yours…" (internal term); changed in T021 with the other factory  |
| 409    | `layout:stale-version`              | Layout out of date         | This layout changed after you opened it. Reload it and try again.                    | layout save (T062)                               | new                                                                                                     |
| 422    | `layout:out-of-bounds`              | Outside the grid           | Keep every item inside the grid, and every seat inside its cubicle.                  | layout save (T062)                               | new                                                                                                     |
| 409    | `photo:limit-reached`               | Photo limit reached        | This space already has 10 photos. Delete one to add another.                         | photo upload (003 T008)                          | new; extension `limit: 10`                                                                              |
| 409    | `photo:order-stale`                 | Photos changed             | The photos changed after you opened them. Reload them and try again.                 | photo reorder (003 T023)                         | new                                                                                                     |
| 413    | `photo:too-large`                   | Photo too large            | Photos can be at most 10 MB.                                                         | photo upload (003 T008)                          | new; extension `maxBytes`                                                                               |
| 415    | `photo:unsupported-format`          | Unsupported photo format   | Use a JPEG, PNG or WebP photo that is not animated.                                  | photo upload (003 T008)                          | new; extension `accepted`                                                                               |
| 422    | `photo:dimensions-out-of-range`     | Photo size out of range    | The longest side must be 800 to 12,000 pixels, up to 50 megapixels.                  | photo upload (003 T008)                          | new; extensions `minLongEdge`, `maxLongEdge`, `maxPixels`                                               |
| 422    | `photo:unreadable`                  | Photo unreadable           | This file couldn't be read as an image.                                              | photo upload (003 T008)                          | new                                                                                                     |
| 503    | `photo:busy`                        | Busy                       | We are busy right now. Try again in a moment.                                        | photo upload (003 T008)                          | new; always with `Retry-After`                                                                          |

Extension members (`missing`, `labels`, `conflicts`) are unchanged.
