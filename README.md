# BSeat

Book a desk or seat in seconds. BSeat shows hybrid office employees which seats are free
for a time window and lets them reserve one.

It is also a reference setup for **AI-assisted development**: a production-grade monorepo
where a team of Claude Code agents takes features from spec to reviewed pull request,
with humans approving every merge.

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
