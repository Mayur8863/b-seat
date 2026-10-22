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

## Ports

web 3000 · api 3001 · Postgres **5433** · Redis **6380** · Mailpit UI 8025 / SMTP 1025.
Postgres and Redis use non-default host ports to avoid clashing with local installs.
Change any of them in `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `WEB_PORT`, …).

## Troubleshooting

- **`docker compose up` fails at `install`**: the lockfile is out of date. Run `bin/pnpm install`
  and commit `pnpm-lock.yaml`.
- **API changes don't reload**: the dev server watches `apps/api/dist-dev/`. Check
  `docker compose logs api` for a compile error. Restart with `docker compose restart api`.
- **Web shows stale API types**: run `bin/pnpm gen:api` (regenerates `openapi.json` and the client).
- **Integration tests can't connect**: they need `docker compose up -d postgres redis mailpit`
  and use the `bseat_test` database (created by `docker/postgres/init`). If the volume predates
  the init script, reset data (see above).
- **Permission errors on files**: containers run as uid 1000. If your host uid differs, set
  `user:` in a `docker-compose.override.yml`.
- **Git hook fails with "docker: command not found"**: hooks call `bin/*`, which need Docker on PATH.

## Where things run

The repo is mounted into containers at the **same absolute path** as on your host, so
paths in errors and stack traces are clickable. `node_modules` lives in the repo (owned by
your user); the pnpm store is a Docker volume.
