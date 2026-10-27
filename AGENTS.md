# AGENTS.md: BSeat

BSeat is a seat and desk booking web app. People browse spaces, see which seats
are free for a time slot, and book one. This file is the **source of truth for
every coding agent and human contributor**. `CLAUDE.md` imports it; the apps
have short `AGENTS.md` files that add local rules. If this file and code
disagree, fix one of them in the same PR.

## Stack

| Layer      | Choice                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm 12 workspaces + Turborepo 2, Node 22 LTS                                               |
| Web        | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui (Radix)        |
| Data (web) | TanStack Query hooks **generated** from OpenAPI (orval); forms: React Hook Form + Zod       |
| API        | NestJS 12 (ESM, SWC), Zod 4 via native Standard Schema validation, OpenAPI from the schemas |
| DB         | PostgreSQL 18 + Drizzle ORM/Kit migrations                                                  |
| Auth       | Better Auth (email/password, sessions in Postgres) hosted inside the API at `/api/auth/*`   |
| Queue      | Redis 8 + BullMQ (e.g. outbound mail -> SMTP; Mailpit locally)                              |
| Tests      | Vitest (unit/integration), Testing Library + MSW (components), Playwright + axe (e2e/a11y)  |
| Ops        | Docker Compose locally; AWS target (ECS Fargate, RDS, ElastiCache), see `docs/adr/0007`     |

Decisions and their reasons live in `docs/adr/`. Read the relevant ADR before
changing anything it covers.

## Commands

The host needs **only Docker**. Every Node command runs in the `tools`
container via `bin/` wrappers. Never run `npm`/`pnpm`/`node` directly on the host.

| Task                        | Command                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| Run everything (hot reload) | `docker compose up` → web :3000, api :3001, mail UI :8025                 |
| Install deps                | `bin/pnpm install`                                                        |
| Lint / typecheck (all)      | `bin/pnpm lint` · `bin/pnpm typecheck`                                    |
| Unit + integration tests    | `bin/pnpm test` (needs `docker compose up -d postgres redis mailpit`)     |
| Coverage                    | `bin/pnpm test:coverage`                                                  |
| E2E + accessibility         | `docker compose --profile e2e run --rm e2e` (stack running)               |
| Build                       | `bin/pnpm build`                                                          |
| One package                 | `bin/pnpm --filter @bseat/api test` (api, web, ui, api-client)            |
| Regenerate API contract     | `bin/pnpm gen:api` → commits `apps/api/openapi.json`                      |
| New DB migration            | `bin/pnpm --filter @bseat/api db:generate --name <change>`                |
| Apply migrations / seed     | `bin/pnpm db:migrate` · `bin/pnpm db:seed`                                |
| Add a changeset             | `bin/pnpm changeset`                                                      |
| Secret scan / SAST / CVEs   | `bin/gitleaks dir .` · `bin/security`                                     |
| Shell in the toolbox        | `bin/tools bash`                                                          |
| Add a shadcn component      | `bin/tools bash -c 'cd packages/ui && pnpm dlx shadcn@latest add <name>'` |

API docs (Swagger UI): http://localhost:3001/docs. Caught email: http://localhost:8025.

## Folder map

```
apps/api            NestJS API. src/<feature>/ = controller + service + schemas + *.spec.ts
  src/db/schema     Drizzle tables (one file per aggregate), drizzle/ = SQL migrations
  test/             *.int-spec.ts integration tests (real Postgres/Redis)
  openapi.json      generated API contract (committed; CI fails if stale)
apps/web            Next.js. src/app = routes, src/components = app components, e2e/ = Playwright
packages/ui         shadcn/ui components + design tokens (src/styles/globals.css)
packages/api-client generated client: hooks, models, zod, MSW mocks (src/generated is gitignored)
packages/config     shared eslint / tsconfig / prettier presets
specs/NNN-feature/  spec.md → plan.md → tasks.md (+ research, data-model, contracts)
docs/adr            architecture decision records (MADR)
docs/runbooks       how to operate: local dev, incidents, deploys, migrations
.claude/agents      the agent team (see "Workflow")
.specify/           spec-kit templates, scripts and the project constitution
bin/                Docker wrappers: pnpm, tools, gitleaks, security
docker/             tools image, Postgres init, production Dockerfiles
```

## Conventions

**General**

- TypeScript `strict`. No `any`, no `@ts-ignore`, no non-null `!` in production code.
- Small modules with one job. Name things after the domain (`booking`, `seat`), not the tech.
- Comments explain _why_, not _what_. No commented-out code.
- Configuration comes from validated env (`apps/api/src/config/env.ts`). Add new variables
  there **and** to `.env.example` with a comment.

**API (`apps/api`)**

- Every route is under `/api`. Controllers stay thin: parse, authorize, call a service, return.
- Each request and response has a Zod schema with `.meta({ id })`. Request ids end in `Input`
  (`CreateBookingInput`) and response ids are nouns (`Booking`). Never reuse one schema for
  both directions. Validate with `@Body({ schema })` / `@Query({ schema })` / `@Param(..., { schema })`
  and document responses with `@ApiOkResponse({ standardSchema })`.
- Errors are RFC 9457 problem details (`ProblemFilter`). Throw Nest `HttpException`s
  (`NotFoundException`, `ConflictException`, …); never hand-build error JSON.
- Protected routes use `@UseGuards(AuthGuard)` and `@CurrentSession()`. Every query that
  reads or writes user data is scoped to the caller (authorization lives in the service).
- Data access goes through Drizzle with `@Inject(DB) db: Database`. No raw SQL string
  concatenation; use `sql` template tags.
- Enforce invariants in the database too (unique, FK, check, exclusion constraints).
  Domain tables use `uuid` ids and `timestamptz`.
- Migrations: change `src/db/schema`, run `db:generate`, review the SQL, commit both.
  Never edit a migration that has been merged.
- Relative imports use the `.js` extension (ESM).
- Log with the injected `PinoLogger`. Never log secrets, tokens, passwords or email bodies.

**Web (`apps/web`)**

- Server Components by default. Add `'use client'` only for interactivity or hooks.
- Talk to the API **only** through `@bseat/api-client` hooks and functions. ESLint
  bans `fetch` and `axios` in the app.
- Forms: React Hook Form + `zodResolver`. Every field has a `<Label>`, and errors are tied to
  the field with `aria-describedby`.
- UI comes from `@bseat/ui` and uses semantic tokens (`bg-primary`, `text-muted-foreground`),
  never raw colours. Every data view handles **loading, empty, error and success** states.
- Accessibility is WCAG 2.1 AA: keyboard reachable, visible focus, no colour-only meaning,
  4.5:1 text contrast. axe runs in e2e.

**Tests**

- Write the test first for business logic (TDD: red → green → refactor).
- Put unit tests next to the code (`*.spec.ts` in api, `*.test.tsx` in web). API integration
  tests go in `apps/api/test/*.int-spec.ts` against the real DB, and e2e journeys in `apps/web/e2e`.
- Coverage must be at least **80% on changed lines** (CI, diff-cover). Package floors are
  set in the vitest configs.
- Test behaviour through public interfaces. Mock only at boundaries (HTTP via MSW, mail queue).

**Git**

- One task = one branch = one PR, kept small (aim for under 400 changed lines).
- Branch names: `<type>/<spec-id>-<slug>`, e.g. `feat/001-create-booking`.
- Commit messages follow Conventional Commits with a scope: `feat(api): add booking overlap check`.
- Add a changeset (`bin/pnpm changeset`) for any user-visible change.

## Do / Don't

| Do                                                               | Don't                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Start every feature from `specs/NNN-*/spec.md`                   | Write code before the spec, plan and tasks are approved          |
| Regenerate the client (`gen:api`) after changing an API schema   | Edit `packages/api-client/src/generated` by hand                 |
| Add an ADR for any significant or hard-to-reverse decision       | Add a dependency without saying why in the PR                    |
| Keep secrets in env / AWS Secrets Manager                        | Commit `.env`, keys, tokens or real customer data                |
| Run lint, typecheck and tests before handing off                 | Bypass hooks (`--no-verify`, `LEFTHOOK=0`) or disable lint rules |
| Leave the code better than you found it, within the task's scope | Mix refactors or unrelated changes into a feature PR             |
| Ask (open question in the handoff) when requirements are unclear | Guess at product behaviour or invent requirements                |
| Use the read-only `bseat_readonly` role for DB inspection (MCP)  | Write to any database outside migrations, seeds and tests        |
| Push a branch and open a PR for human review                     | Push to or merge into `main` (humans merge, always)              |

## Workflow

Every change runs through this pipeline. Each arrow is a **handoff**.

```
spec ──▶ task-manager ──▶ architect ──▶ backend-dev / frontend-dev ──▶ qa-engineer
 (human)    plans          approves         implement (TDD)              tests
                                                                            │
   human approves PR ◀── docs-writer ◀── fix loop ◀── code-reviewer + security-reviewer
```

1. **Spec.** A human (or the task-manager with a human) writes `specs/NNN-<feature>/spec.md`
   with `/speckit-specify`: user stories, acceptance criteria, non-goals.
2. **Plan.** The task-manager runs `/speckit-plan` then `/speckit-tasks` to produce
   `plan.md` and `tasks.md` (epics → stories → tasks, each with acceptance criteria,
   an owner agent, dependencies and a status).
3. **Approve.** The architect reviews the plan, data model and API contract, records any
   ADRs, and marks the plan `Approved` (or sends it back). No code before approval.
   ui-ux-designer defines states and tokens for any UI tasks.
4. **Implement.** backend-dev / frontend-dev take one task at a time on its own branch,
   test first, keep `openapi.json` and the generated client in sync, and set the task
   to `review` when done.
5. **Test.** qa-engineer writes or extends tests from the acceptance criteria and runs
   the full suite (unit, integration, e2e, axe). Failures go back to the dev with
   reproduction steps. Only QA moves a task to `done`.
6. **Review.** code-reviewer and security-reviewer review the diff (read-only) and
   report findings as blocker / major / minor / nit. Blockers and majors loop back to the dev.
7. **Docs.** docs-writer updates the README, API docs, runbooks and the changeset or changelog.
8. **Human approval.** A person reviews and merges the PR. **No agent merges to `main`.**

Task status in `tasks.md` is one of `todo → in-progress → review → done` (or `blocked`,
with the reason). Only the task-manager changes ownership, and only qa-engineer marks `done`.

### Handoff template

Every handoff (agent → agent, or agent → human) ends with:

```markdown
## Handoff: <task id> <title> → <next agent>

**Done:** what was built or decided (1-3 bullets)
**Files changed:** path list (or `git diff --stat`)
**How to verify:** exact commands and expected result
**Open questions / risks:** anything the next agent or a human must decide
```

## Definition of done

A task is done only when **all** of these are true:

- [ ] Acceptance criteria in `tasks.md` are met and demonstrated by tests
- [ ] Tests were written first for business logic; changed-line coverage ≥ 80%
- [ ] `bin/pnpm check` pass; e2e and axe pass for UI changes
- [ ] `openapi.json` and the generated client are current (`bin/pnpm gen:api`)
- [ ] Migrations generated and reviewed (if the schema changed)
- [ ] No blocker or major findings left from code-reviewer or security-reviewer
- [ ] Docs, ADRs, `.env.example` and the changeset are updated where relevant
- [ ] Task status is `done` (set by qa-engineer) and the PR has the handoff summary

## Security rules (always)

- Never read, print or commit secrets. `.env*` files are off-limits to agents (except `.env.example`).
- Validate all input at the API boundary (Zod). Authorize every data access by owner or role.
- Keep dependencies minimal and pinned through the lockfile. pnpm blocks install scripts
  unless the package is listed in `pnpm-workspace.yaml` `allowBuilds`.
- Security tooling: gitleaks (pre-commit and CI), Semgrep, Trivy, and Dependabot.
