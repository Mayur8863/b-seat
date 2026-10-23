# Quickstart: validate seat booking end to end

This guide checks that the feature works once all tasks are merged. It links to
[contracts/](./contracts/README.md) and [data-model.md](./data-model.md) for shapes and rules
and does not repeat them. The host needs only Docker (AGENTS.md).

**Status on `feat/001-seat-booking`:** the `/book` page (T008), `POST /api/bookings` (T009) and the
confirmation email (T010) are done. The Book button (T011), My bookings and cancel (T012, T013) are
not built yet. Steps and rows marked **(T011–T013)** cannot be run yet.

## 1. Prerequisites and setup

```bash
docker compose up -d                 # web :3000, api :3001, postgres, redis, mailpit :8025
bin/pnpm db:migrate                  # applies 0001_spaces_bookings and 0002_booking_exclusions
bin/pnpm db:seed                     # London HQ (12 seats, Europe/London), Pune Hub (8 seats, Asia/Kolkata)
```

Expected: the seed prints `seed: done`. Running it a second time changes nothing (idempotent).

Check the constraints exist (read-only role or `bin/tools bash` + psql):

```sql
select conname from pg_constraint where conrelid = 'booking'::regclass order by 1;
-- includes booking_seat_no_overlap, booking_user_no_overlap, booking_duration_bounds, …
```

## 2. Automated checks (primary evidence)

```bash
bin/pnpm --filter @bseat/api test:unit          # booking-rules + zoned-time (DST) + services
bin/pnpm --filter @bseat/api test:integration   # needs postgres, redis, mailpit up: constraints, spaces, bookings (email, 20-user race)
bin/pnpm --filter @bseat/web test               # components with MSW: loading/empty/error/success
docker compose --profile e2e run --rm e2e       # Playwright: book.spec.ts, sign-in-redirect.spec.ts, auth.spec.ts
bin/pnpm lint && bin/pnpm typecheck && bin/pnpm build && bin/pnpm gen:api && git diff --exit-code apps/api/openapi.json
```

Expected: everything is green, and the last command shows no diff (the contract is current).

## 3. Manual API walk-through (through the web origin, same-origin cookies)

This needs `curl` and `jq` on the host. `date -d` is GNU date; on macOS use `date -v+1d +%F`.

```bash
B=http://localhost:3000; J=/tmp/bseat-cj; H='Origin: http://localhost:3000'
curl -s -c $J -H "$H" -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada+qs@example.com","password":"correct-horse-battery"}' \
  $B/api/auth/sign-up/email >/dev/null
curl -s -b $J $B/api/spaces | jq                       # 2 spaces with seatCount 12 and 8 (AC 1.1)
SPACE=$(curl -s -b $J $B/api/spaces | jq -r '.items[]|select(.name=="London HQ").id')
D=$(date -d tomorrow +%F)
curl -s -b $J "$B/api/spaces/$SPACE/availability?date=$D&startTime=10:00&endTime=11:00" | jq '.seats|map(.status)'
SEAT=$(curl -s -b $J "$B/api/spaces/$SPACE/availability?date=$D&startTime=09:00&endTime=12:00" | jq -r '.seats[0].id')
curl -s -b $J -H 'content-type: application/json' \
  -d "{\"seatId\":\"$SEAT\",\"date\":\"$D\",\"startTime\":\"09:00\",\"endTime\":\"12:00\"}" $B/api/bookings | jq
```

Swagger alternative: sign in at http://localhost:3000 in a browser, then use **Try it out** on
`POST /api/bookings` at http://localhost:3001/docs. The session cookie is set for `localhost`, so it
should be sent to port 3001 too. If you get 401, sign in again in the same browser.

| Step                                                                           | Expected                                                                                                                     | Spec           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Book 09:00–12:00                                                               | `201`, `status: "active"`, `timeZone: "Europe/London"`                                                                       | AC 2.1         |
| Availability 10:00–11:00                                                       | that seat `taken`, the other 11 `free`                                                                                       | AC 1.2         |
| Availability 12:00–13:00                                                       | all 12 `free`                                                                                                                | AC 1.3         |
| Open http://localhost:8025                                                     | one email to `ada+qs@example.com` naming London HQ, the seat, the local date, 09:00–12:00 and Europe/London, within a minute | AC 2.2, SC-004 |
| Book the same seat 11:00–13:00 as a second user                                | `409` `booking:seat-unavailable`                                                                                             | AC 2.3         |
| Book any other seat 11:00–13:00 as Ada                                         | `409` `booking:user-overlap`                                                                                                 | AC 2.5         |
| Book 06:30–08:00, 09:10–10:00, 08:00–19:00, a date 31 days ahead, or yesterday | `422` with the matching `booking-rule:*` type                                                                                | AC 2.6         |
| `GET /api/bookings` **(T012)**                                                 | only Ada's bookings, soonest first                                                                                           | AC 3.1         |
| `POST /api/bookings/{id}/cancel` **(T012)**                                    | `200` `status: "cancelled"`; the seat is `free` again for 10:00–11:00                                                        | AC 3.3         |
| Cancel Ada's booking id as the second user **(T012)**                          | `404` (identical to a random UUID)                                                                                           | AC 3.4         |
| Any of the above without the cookie                                            | `401` problem+json                                                                                                           | AC 1.4, FR-001 |

## 4. Concurrency smoke test (SC-002)

The integration test is the real proof (20 distinct users, repeated). For a manual check,
sign up 20 users with cookie jars `/tmp/cj1` to `/tmp/cj20`, then:

```bash
seq 1 20 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/cj{} \
  -H 'content-type: application/json' \
  -d "{\"seatId\":\"$SEAT\",\"date\":\"$D\",\"startTime\":\"14:00\",\"endTime\":\"15:00\"}" \
  $B/api/bookings | sort | uniq -c
```

Expected: `1 201` and `19 409`.

## 5. UI journey (manual counterpart of the e2e)

1. Sign in, then open http://localhost:3000/book. The dashboard has no link to it yet.
2. Choose London HQ, tomorrow, 10:00–11:00. The loading state appears, then the seat grid. Each
   seat shows its status as text, not only colour.
3. **(T011)** Press **Book** on a free seat (plus a confirmation, if ui.md defines one). A success
   toast appears, and the seat shows as taken. Steps after choosing the window: at most 4 (SC-001).
4. **(T012–T013)** Open **My bookings** (`/bookings`). The booking is listed with the space, seat and
   local time labelled with Europe/London. Cancel it, and it disappears.
5. **(T013)** With no bookings, the empty state links to `/book` (AC 3.2).
6. Signed out, `/book` redirects to `/sign-in?next=%2Fbook` (AC 1.4). `/bookings` redirects the same
   way, but its page is built in T013.

## 6. Troubleshooting

- `type "gist" … btree_gist` errors during migrate: the extension is missing. Locally, recreate
  the Postgres volume so `docker/postgres/init` runs. On RDS, the migration's `CREATE EXTENSION`
  needs the master user (see data-model.md, Migrations and
  [database-migrations.md](../../docs/runbooks/database-migrations.md)).
- No email in Mailpit: check `docker compose logs api | grep 'booking\.'` and that Redis is healthy.
  A `booking.confirmation_not_queued` line means the job was not queued. The booking still exists by
  design (FR-008). See [booking-confirmations.md](../../docs/runbooks/booking-confirmations.md).
