@AGENTS.md

# Claude Code specifics

Everything in AGENTS.md applies. This section adds only what is specific to Claude Code.

## Agent team (`.claude/agents/`)

Use the subagent that owns the work rather than doing it all in the main thread:

| Agent               | Use for                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `task-manager`      | Turning a spec into plan.md and tasks.md, dispatching tasks, tracking status |
| `architect`         | Data model, API contracts, ADRs, approving plans                             |
| `backend-dev`       | NestJS endpoints, services, migrations, queues                               |
| `frontend-dev`      | Next.js pages and components, generated-client data fetching, forms          |
| `ui-ux-designer`    | Tokens, component states, UI specs, screenshot review                        |
| `qa-engineer`       | Test plans, tests, running the full suite, marking tasks `done`              |
| `code-reviewer`     | Read-only diff review: blocker / major / minor / nit                         |
| `security-reviewer` | Read-only OWASP, auth and dependency review                                  |
| `devops`            | Docker, CI/CD, environments, observability, AWS                              |
| `docs-writer`       | README, runbooks, changelog and changesets after each change                 |

Start a feature with `/feature <short description>`. It walks the AGENTS.md workflow.

## Spec-driven development (spec-kit skills)

`/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-analyze` (optional) → implement task by task. The project principles are in
`.specify/memory/constitution.md`.

## MCP servers (`.mcp.json`)

All servers run from pinned Docker images or remote endpoints; approve them once with `/mcp`.

- `playwright`: drive a real browser against http://localhost:3000 (UI checks, screenshots).
- `github`: issues and PRs. Needs `GITHUB_PERSONAL_ACCESS_TOKEN` exported in your shell
  (fine-grained: contents read, issues and pull requests read/write).
- `context7`: current library docs. Use it before relying on memory for Next.js, NestJS,
  Drizzle, Better Auth, TanStack Query, orval or shadcn APIs. Many of these had recent majors.
- `postgres`: **read-only** SQL against the local dev DB as `bseat_readonly`.

## Guardrails

- `.claude/settings.json` denies reading `.env*` files and merging PRs, and asks before `git push`.
- `.claude/hooks/guard_bash.py` blocks commits on `main`, pushes to `main`, hook bypasses
  and destructive commands. Reviewer agents also run `readonly_bash.py`.
- Run tooling through `bin/pnpm` and `bin/tools`. The host has no Node toolchain by design.
