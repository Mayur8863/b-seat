# Runbook: local development

## Start, stop, reset

| Goal                                    | Command                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Start everything (foreground logs)      | `docker compose up`                                                          |
| Start in background, wait until healthy | `docker compose up -d --wait`                                                |
| Logs for one service                    | `docker compose logs -f api`                                                 |
| Stop (keep data)                        | `docker compose down`                                                        |
| **Reset all local data** (DB, Redis)    | `docker compose down -v`, then `docker compose up`. Destructive: humans only |
| Re-run migrations + seed                | `docker compose run --rm migrate`                                            |
| Rebuild the toolbox image               | `docker compose build tools`                                                 |
| psql into the dev DB                    | `docker compose exec postgres psql -U bseat bseat`                           |

## Demo data

`docker compose up` runs the migrations and the seed. The seed resets the demo accounts' passwords and
sessions, so never point it at a database that holds real users.

- **Accounts:** `owner@bseat.local` (owner) and `renter@bseat.local` (renter). The owner's password comes
  from `SEED_DEMO_PASSWORD`; compose has a dev-only default, and `.env.example` shows the override. Re-run
  the seed with `bin/pnpm db:seed`.
- **London HQ** (Europe/London, open 24 hours, 12 seats) has two cubicles, Quiet Zone (A-01 to A-06) and
  Collaboration Zone (A-07 to A-12), and a sample floor plan with a meeting room, a kitchen and an entrance.
  The seed saves the floor plan only when the space has none, so an edited plan is never overwritten.
- **Pune Hub** (Asia/Kolkata, 8 seats) is a priced, published listing with working hours.

## Ports

web 3000 · api 3001 · Postgres **5433** · Redis **6380** · Mailpit UI 8025 / SMTP 1025.
Postgres and Redis use non-default host ports to avoid clashing with local installs.
Change any of them in `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `WEB_PORT`, …).

## Testing

- **Integration tests** (`bin/pnpm test`) need `docker compose up -d postgres redis mailpit`. They read
  `DATABASE_URL_TEST`, which compose sets to the `bseat_test` database. The integration setup applies the
  migrations to that database on every run, so you do not run them by hand.
- **Mail tests** read Mailpit's HTTP API at `MAILPIT_URL`. Compose sets `http://mailpit:8025` for the
  containers. On the host it defaults to `http://localhost:8025`, and `.env.example` documents the
  variable. Turborepo only passes environment variables listed in `turbo.json` (`globalPassThroughEnv`)
  to tasks, so a variable that a test reads must be listed there too, or the test silently uses its default.
- **Extra test databases (optional).** Parallel runs in separate clones can use their own databases,
  `bseat_test_b` and `bseat_test_c`. Nothing creates them: the Postgres init script only creates `bseat_test`.
  Create one by hand, then point that clone's test run at it. The database must be owned by the `bseat` user.

  ```bash
  docker compose exec postgres psql -U bseat -d bseat -c 'CREATE DATABASE bseat_test_b OWNER bseat;'
  export DATABASE_URL_TEST="${DATABASE_URL_TEST}_b"   # appends _b to the database name in the current value
  bin/pnpm --filter @bseat/api test
  ```

  The `_b` suffix only works if `DATABASE_URL_TEST` already ends in `/bseat_test`. The `btree_gist` extension
  is created by the first migration, so no extra step is needed.

## Troubleshooting

- **`docker compose up` fails at `install`**: the lockfile is out of date. Run `bin/pnpm install`
  and commit `pnpm-lock.yaml`.
- **API log shows `EADDRINUSE` in a loop, and the API runs old code** (typically after a branch switch).
  The hot-reloaded process still holds port 3001. Run `docker compose restart api`.
- **API changes don't reload**: the dev server watches `apps/api/dist-dev/`. Check
  `docker compose logs api` for a compile error. Restart with `docker compose restart api`.
- **Web shows stale API types**: run `bin/pnpm gen:api` (regenerates `openapi.json` and the client).
- **Integration tests can't connect**: they need `docker compose up -d postgres redis mailpit`
  and use the `bseat_test` database (created by `docker/postgres/init`). If the volume predates
  the init script, reset data (see above). Mail tests that fail with `ECONNREFUSED 127.0.0.1:8025`
  have lost `MAILPIT_URL`; see [Testing](#testing).
- **Permission errors on files**: containers run as uid 1000. If your host uid differs, set
  `user:` in a `docker-compose.override.yml`.
- **Git hook fails with "docker: command not found"**: hooks call `bin/*`, which need Docker on PATH.
- **A booking worked but no email appears in Mailpit**: run `docker compose logs api | grep 'booking\.'`.
  A `booking.confirmation_not_queued` line means Redis could not take the job. See
  [booking-confirmations.md](booking-confirmations.md).

## Where things run

The repo is mounted into containers at the **same absolute path** as on your host, so
paths in errors and stack traces are clickable. `node_modules` lives in the repo (owned by
your user); the pnpm store is a Docker volume.
