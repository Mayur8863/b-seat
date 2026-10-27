# Quickstart: validate the space marketplace end to end

This guide checks the feature once its tasks are merged. It links to [contracts/](./contracts/README.md) and
[data-model.md](./data-model.md) for shapes and rules and does not repeat them. The host needs only Docker.

**Status**: planning. Nothing below runs yet. Each step names the task that makes it runnable.

## 1. Setup

```bash
docker compose up -d                 # web :3000, api :3001, postgres, redis, mailpit :8025
bin/pnpm db:migrate                  # applies 0003+ (account type, listings, pricing/calendar, pass bookings, holds, ...)
bin/pnpm db:seed                     # demo owner + renter, London HQ and Pune Hub as priced, published listings (T009)
```

Seed accounts (T009; the password comes from `SEED_DEMO_PASSWORD`, see `.env.example`, T012):

| Account              | Role   | Owns                                                                                                                                        |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner@bseat.local`  | owner  | London HQ (GB, London, open 24 h, shift 07:00, day/night/24 h priced in GBP), Pune Hub (IN, Pune, 09:00–18:00, working hours priced in INR) |
| `renter@bseat.local` | renter | preferences: IN, Pune                                                                                                                       |

Check the invariants exist (read-only role, or `bin/tools bash` + psql):

```sql
select conname, contype from pg_constraint where conrelid = 'seat_hold'::regclass order by 1;
-- seat_hold_seat_no_overlap (x), seat_hold_user_no_overlap (x), seat_hold_booking_fk (f), seat_hold_one_source (c), ...
select conname from pg_constraint where conrelid = 'booking'::regclass and contype = 'x';
-- no rows: the 001 exclusions moved to seat_hold (T005, ADR-0009)
select conname, convalidated from pg_constraint where conname = 'booking_no_new_hourly';  -- f (NOT VALID)
select account_type, count(*) from "user" group by account_type;  -- pre-existing accounts are 'renter' (FR-003)
```

## 2. Automated checks (primary evidence)

```bash
bin/pnpm --filter @bseat/api test:unit          # slots, pass periods, calendars, money, booking rules (DST cases)
bin/pnpm --filter @bseat/api test:integration   # constraints, owner scoping (404 parity), races (SC-005), emails
bin/pnpm --filter @bseat/web test               # components with MSW: loading / empty / error / success
docker compose --profile e2e run --rm e2e       # journeys per story + axe on every screen (SC-007)
bin/pnpm lint && bin/pnpm typecheck && bin/pnpm build && bin/pnpm gen:api && git diff --exit-code apps/api/openapi.json
```

Expected: all green; the last command shows no diff.

## 3. Journeys to try by hand

| #   | Steps                                                                                                       | Expected                                                                                   | Spec                                    |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1   | Sign up without choosing a role                                                                             | the form refuses, naming the missing choice                                                | AC 1.1 (T015)                           |
| 2   | Sign up as "I need a space" with country IN, city "pune "                                                   | renter dashboard; "Find a space" opens with IN / Pune prefilled                            | AC 1.2, AC 4.1 (T015, T039)             |
| 3   | From the renter dashboard, Tab through the main nav                                                         | every renter page is reachable by keyboard; no URL typing needed                           | AC 1.3, AC 1.5, SC-002 (T014)           |
| 4   | Sign up as "I own a space"; create a space; try to publish                                                  | refused: "add at least one seat and price at least one pass"                               | AC 2.1, AC 2.4 (T023, T022)             |
| 5   | Add seats `A-1` to `A-20` with the pattern; set day and monthly prices for Day, Night and 24 hours; publish | published; a renter search for the city lists it with lowest prices                        | AC 2.3, AC 3.1–3.5, AC 4.1 (T024, T030) |
| 6   | As the renter, open London HQ, choose Weekly / Day / next Monday                                            | 20 seats free or taken (text and icon), end date and time, price, 24-hour saving shown     | AC 4.4, AC 3.5 (T040)                   |
| 7   | Book a free seat                                                                                            | confirmation with price and "pay the owner directly"; email to renter and owner in Mailpit | AC 4.5, AC 4.10 (T041, T037)            |
| 8   | Reload the seat view for the same pass                                                                      | the seat is taken for those 7 days; a night pass on the same seat is still free            | AC 4.5, edge "day and night" (T035)     |
| 9   | As the owner, mark that seat occupied for the same week                                                     | refused, listing the renter's dates                                                        | AC 5.3 (T048)                           |
| 10  | Mark another seat occupied with a note, no end date                                                         | renters see it taken; owner sees "occupied" and the note today                             | AC 5.1, AC 5.4 (T048)                   |
| 11  | Set the shared calendar to Mon–Fri; book a weekly pass starting Monday                                      | 5 days included, Sat and Sun shown as closed, same price                                   | AC 6.2, AC 6.4 (T052, T040)             |
| 12  | Open My bookings; cancel the booking                                                                        | it disappears; the seat is free again for the whole period                                 | AC 7.1, AC 7.2 (T057)                   |
| 13  | As the owner, draw two cubicles, a "Meeting room" area and 6 seats; save; view as renter                    | same plan with free/taken labels; booking from the plan works; list view still available   | AC 8.1–8.4 (T065, T066)                 |
| 14  | Do 13 with the keyboard only                                                                                | every item can be selected, moved, resized and renamed                                     | AC 8.3 (T065)                           |

## 4. API spot checks

Through the web origin with a cookie jar, as in [001 quickstart](../001-seat-booking/quickstart.md#3-manual-api-walk-through-through-the-web-origin-same-origin-cookies):

| Call                                                                                 | Expected                         | Spec   |
| ------------------------------------------------------------------------------------ | -------------------------------- | ------ |
| `GET /api/me` as a pre-existing account                                              | `accountType: "renter"`          | FR-003 |
| `POST /api/auth/update-user {"accountType":"owner"}` as a renter, then `GET /api/me` | 400, then still `renter`         | FR-001 |
| `GET /api/owner/spaces` as a renter                                                  | 403                              | R-3    |
| `GET /api/owner/spaces/{otherOwnersSpace}`                                           | 404 identical to a random UUID   | FR-009 |
| `GET /api/listings?country=GB&city=%20LONDON%20`                                     | London HQ                        | AC 4.2 |
| `POST /api/listings/{id}/bookings` with a start date 31 days ahead                   | 422 `booking-rule:too-far-ahead` | AC 4.9 |
| `POST /api/listings/{ownSpace}/bookings` as its owner                                | 422 `booking-rule:own-space`     | edge   |
| `POST /api/bookings` (old hourly create)                                             | 404 (route removed)              | R-7    |
