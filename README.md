# BSeat

Book a desk or seat in seconds. BSeat shows hybrid office employees which seats are free
for a time window and lets them reserve one.

It is also a reference setup for **AI-assisted development**: a production-grade monorepo
where a team of Claude Code agents takes features from spec to reviewed pull request,
with humans approving every merge.

## Features

Everyone signs up with one role: **I own a space** (owner) or **I need a space** (renter). The role
decides the dashboard and the pages in the menu. Prices are shown in the app and paid **offline,
directly to the owner**; there is no online payment.

**For owners**

- **List a space.** Name, description, country, city, area, street address, time zone, currency,
  opening hours and utilities. A draft can be published only with at least one seat and one priced
  pass; otherwise publishing says what is missing.
- **Seats and cubicles.** Add one seat or many with a label pattern (`A-1` to `A-20`), rename, group
  seats into cubicles, and remove them. A removal is refused while the seat has future bookings.
- **Passes and prices.** Choose the slots the space offers (day, night, 24 hours, or working hours)
  and set day, weekly and monthly prices. Empty means the pass is not offered.
- **Layout.** Draw a floor plan of seats, cubicles and areas on a grid with the pointer, the keyboard
  or a form. Saves are versioned.
- **Availability.** A shared calendar for the space, with an optional own calendar for any seat.
- **Occupancy.** Mark seats occupied for a period, with an optional note, and end the mark. A mark that
  clashes with existing bookings is refused.
- **Bookings.** See upcoming bookings at the space, filter them by date and page through them.

**For renters**

- **Find a space** (`/find`). Search by country, city, area, start date, pass, slot and utilities. The
  filters are in the URL, so results can be shared. Each result shows the lowest price per pass.
- **Space page** (`/spaces/{id}`). Details, offered slots and prices, and each seat as free, taken or
  closed for the pass and start date you pick. A space with a floor plan can show it instead of a list.
- **Book a pass.** Pick one seat for a day, week or month pass. A weekly or monthly pass keeps the same
  seat for the whole period. Days when the seat is unavailable are skipped at the same price, so the
  end date does not move. The confirmation shows the price and the offline-payment note.
- **My bookings** (`/bookings`). Upcoming bookings, with cancel for any booking that has not started.
  The dashboard shows your next booking.
- **Preferences.** Optional default country, city and area for searches.

Each booking emails the renter a confirmation and the owner a notification. Locally, mail is caught by
Mailpit at `http://localhost:8025`. See [booking confirmations](docs/runbooks/booking-confirmations.md).

**Demo data.** `docker compose up` seeds two accounts, `owner@bseat.local` (owner) and
`renter@bseat.local` (renter). The owner's password comes from `SEED_DEMO_PASSWORD`; compose has a
dev-only default, and [.env.example](.env.example) shows how to override it. The seed creates two
published spaces: London HQ (Europe/London, open 24 hours, 12 seats in two cubicles, with a sample
floor plan) and Pune Hub (Asia/Kolkata, 8 seats, working hours).

### Routes and API

Pages: `/dashboard`, `/find`, `/spaces/{id}`, `/bookings` for renters; `/owner/spaces/new` and
`/owner/spaces/{id}` (with its Details, Seats, Passes and prices, Layout, Availability and Bookings
pages) for owners. `/book` redirects to `/find`.

Full schemas are in Swagger UI at http://localhost:3001/docs. Routes are under `/api`. Resource routes
need a signed-in session cookie; sign-in is Better Auth under `/api/auth`.

| Method  | Path                               | Purpose                                                                        |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| GET     | `/api/listings`                    | Search published spaces (`country` required, plus filters)                     |
| GET     | `/api/listings/locations`          | City and area suggestions for the search box                                   |
| GET     | `/api/listings/{spaceId}`          | A published space with its offered passes and prices                           |
| GET     | `/api/listings/{spaceId}/seats`    | Free, taken or closed seats for a pass, slot and start date                    |
| POST    | `/api/listings/{spaceId}/bookings` | Book one seat for a day, week or month pass                                    |
| GET     | `/api/bookings`                    | My upcoming bookings                                                           |
| POST    | `/api/bookings/{bookingId}/cancel` | Cancel my booking that has not started                                         |
| various | `/api/owner/spaces/...`            | Owner spaces, seats, cubicles, pricing, layout, calendars, occupancy, bookings |

The 001 routes `GET /api/spaces` and `GET /api/spaces/{spaceId}/availability` were removed in favour of
`/api/listings`. Hourly booking is gone; passes replace it.

Notes that the schemas do not show:

- **Listing search can return a cursor on a short or empty page.** Each request looks at no more than 200
  candidate spaces when a start date is given. `nextCursor` can be set on a page with few or no results.
  Keep requesting with the cursor while it is set.
- **My bookings returns at most 50** (`limit` defaults to 50 and has a maximum of 50). There is no cursor.
- **Errors are problem details** (`application/problem+json`). A breached booking rule is a 422 whose
  `type` is `urn:bseat:problem:booking-rule:<rule>`. A clash is a 409, `booking:seat-unavailable` or
  `booking:user-overlap`. The full list and its copy are in
  [002 contracts](specs/002-space-marketplace/contracts/README.md).
- **Cross-site writes are refused.** An unsafe request (POST, PUT, PATCH, DELETE) from another site gets 403. Set `TRUSTED_ORIGINS` for deployed environments; see [origins and CSRF](docs/runbooks/origins-and-csrf.md).

### Known limitations

These are open follow-ups from the 002 reviews, listed in
[tasks.md, Review follow-ups](specs/002-space-marketplace/tasks.md#review-follow-ups).

- **My bookings shows at most 50 upcoming bookings**, with no paging.
- **`GET /api/listings` has no rate limit yet.**
- **Malformed space ids return HTTP 200 with the 404 page.** `/spaces/not-a-uuid` and
  `/owner/spaces/not-a-uuid` render "not found" but send status 200, because the page streams before the
  not-found decision. Monitors and crawlers that read status codes will see 200.
- **Holds of cancelled bookings are guarded in code, not in the database.** The cancel transaction and its
  tests keep them inactive. A database trigger for the cancelled-to-active transition is not in place (security review n5).
- **CSRF hardening is minimal.** The cross-site check is the only protection for cookie-authenticated
  writes. Requests with neither `Origin` nor `Sec-Fetch-Site` pass, and there are no CSRF tokens.

## Quick start

The only prerequisite is **Docker** (Engine 24+ with Compose v2). There is no Node, pnpm or
Python toolchain on the host; everything runs in containers.

```bash
git clone <repo> bseat && cd bseat
docker compose up          # installs deps, migrates + seeds the DB, starts everything
```

| What               | URL                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| Web app            | http://localhost:3000                                                |
| API + Swagger UI   | http://localhost:3001/docs                                           |
| Caught email       | http://localhost:8025                                                |
| Tracing (optional) | http://localhost:16686 (`docker compose --profile observability up`) |

Code changes hot-reload in both apps. Optionally copy `.env.example` to `.env` to
override defaults (every variable is documented there).

> The brief's `pnpm install && docker compose up && pnpm dev` maps to `docker compose up`
> (install and dev servers run inside it). The host-side equivalent of `pnpm <x>` is `bin/pnpm <x>`.

## Everyday commands

```bash
bin/pnpm lint | typecheck | test | build     # all packages (Turborepo, cached)
bin/pnpm --filter @bseat/api test            # one package
docker compose --profile e2e run --rm e2e    # Playwright + axe against the running stack
bin/pnpm gen:api                             # regenerate OpenAPI contract + typed client
bin/pnpm --filter @bseat/api db:generate --name <change>   # new migration
bin/security                                 # gitleaks + Semgrep + Trivy
bin/tools bash                               # shell inside the toolbox container
```

See [AGENTS.md](AGENTS.md#commands) for the full list.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · TanStack Query · React Hook Form + Zod ·
NestJS 12 · Zod (Standard Schema) → OpenAPI → orval client · Drizzle + PostgreSQL 18 · Redis 8 + BullMQ ·
Better Auth · Vitest · Testing Library + MSW · Playwright + axe · pnpm + Turborepo · Docker · GitHub Actions.
Why each was chosen: [docs/adr](docs/adr/README.md).

## Repository structure

```
apps/
  web/             Next.js frontend. Talks to the API only through the generated client.
  api/             NestJS backend. Owns the database, auth (Better Auth) and the OpenAPI contract.
packages/
  ui/              Shared shadcn/ui components and design tokens (Tailwind v4 CSS variables).
  api-client/      Generated from apps/api/openapi.json: TanStack Query hooks, Zod schemas, MSW mocks.
  config/          Shared ESLint, TypeScript and Prettier presets.
specs/             Spec-driven development: one folder per feature (spec → plan → tasks).
docs/
  adr/             Architecture decision records: why things are the way they are.
  runbooks/        How to operate: local dev, GitHub setup, migrations, incidents.
  design/          Design tokens and UI guidelines.
.claude/
  agents/          The AI agent team (one file per role).
  skills/          /feature workflow + spec-kit skills (/speckit-specify, -plan, -tasks, …).
  hooks/           Guardrails enforced on every agent command.
.specify/          spec-kit templates, scripts and the project constitution.
.github/           CI workflow, Dependabot, PR and issue templates.
bin/               Docker wrappers: pnpm, tools, gitleaks, security.
docker/            Toolbox image, Postgres init, production Dockerfiles.
AGENTS.md          Rules for every contributor, human or AI (CLAUDE.md imports it).
```

How the pieces connect: the API's Zod schemas generate `openapi.json`, orval turns that into
`@bseat/api-client`, and the web app uses only those hooks. CI fails if the contract is
stale. Locally, the browser calls the web origin and Next.js proxies `/api/*` to the API, so
auth cookies stay first-party (in AWS the load balancer does the same).

## Working with the AI agent team

Features follow one pipeline (details in [AGENTS.md](AGENTS.md#workflow)):

```
spec → task-manager → architect approves → backend-dev / frontend-dev (TDD) → qa-engineer
     → code-reviewer + security-reviewer → fix loop → docs-writer → human approves the PR
```

In Claude Code:

1. Run `/feature <what you want>`. It walks the whole pipeline and stops at the human gates
   (spec sign-off, push, PR).
2. Or drive the stages yourself: `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, then ask
   for a specific agent, e.g. "use the backend-dev agent for T007".
3. Run `/mcp` once to enable the MCP servers in [.mcp.json](.mcp.json): Playwright (browser),
   GitHub (needs `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell), Context7 (current library
   docs) and read-only Postgres.

| Agent                             | Does                                                                           | Model  |
| --------------------------------- | ------------------------------------------------------------------------------ | ------ |
| task-manager                      | spec → plan.md and tasks.md, assigns and tracks tasks, writes no code          | opus   |
| architect                         | data model, API contracts, ADRs, approves plans                                | opus   |
| backend-dev / frontend-dev        | implement tasks test-first                                                     | sonnet |
| ui-ux-designer                    | tokens, UI specs, component states, screenshot checks                          | sonnet |
| qa-engineer                       | test plans and tests, runs the full suite, the only role that marks tasks done | sonnet |
| code-reviewer / security-reviewer | read-only review, findings by severity                                         | opus   |
| devops                            | Docker, CI/CD, AWS, observability                                              | sonnet |
| docs-writer                       | README, runbooks, changesets                                                   | haiku  |

Guardrails apply to every agent: they cannot commit to or push `main`, merge PRs, bypass git
hooks, or read `.env` files, and reviewers are read-only. See
[.claude/settings.json](.claude/settings.json) and [.claude/hooks](.claude/hooks).

`specs/001-seat-booking` is a complete reference feature built through this pipeline. Read
it to see what each stage produces.

## Quality gates

Every commit runs (via Lefthook in Docker) gitleaks, Prettier, affected lint and typecheck,
and commitlint. Every PR runs CI: lint, typecheck, unit and integration tests with ≥ 80%
coverage on changed lines, a contract drift check, build, Playwright e2e with axe (WCAG 2.1 AA),
Schemathesis API fuzzing, gitleaks, Semgrep and Trivy (lockfile and images).

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits, PRs, definition of done
- [docs/runbooks/local-development.md](docs/runbooks/local-development.md): troubleshooting and resetting
- [docs/runbooks/github-setup.md](docs/runbooks/github-setup.md): first push, branch protection, tokens
- [docs/runbooks/database-migrations.md](docs/runbooks/database-migrations.md)
- [docs/runbooks/booking-confirmations.md](docs/runbooks/booking-confirmations.md): confirmation emails, Mailpit and lost-email handling
- [docs/runbooks/origins-and-csrf.md](docs/runbooks/origins-and-csrf.md): `TRUSTED_ORIGINS` and 403s on writes
- [specs/002-space-marketplace](specs/002-space-marketplace/spec.md): the space marketplace spec, plan and contracts
