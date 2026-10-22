# Contributing to BSeat

Humans and AI agents follow the same rules: [AGENTS.md](AGENTS.md) is the source of truth.
This page is the short version for people.

## Setup

Install Docker, then run `docker compose up`. Git hooks are installed automatically by the
first `pnpm install` (inside the `install` container) and run on your host through Docker.

## Flow of work

1. **Start from a spec.** New features get `specs/NNN-<feature>/spec.md` (use `/speckit-specify`
   or copy the template in `.specify/templates/`). Small fixes can reference an issue instead.
2. **Plan and approve.** `plan.md` and `tasks.md` are reviewed by the architect before any code.
3. **One task = one branch = one PR.** Name branches `<type>/<NNN>-<slug>`,
   e.g. `feat/001-create-booking`, `fix/014-cancel-timezone`.
4. **Test first** for business logic, then make it pass and refactor.
5. **Open a PR** using the template (it is the handoff summary plus the definition-of-done
   checklist). CI must be green. A human reviews and merges; agents never merge.

## Commits

[Conventional Commits](https://www.conventionalcommits.org) with a scope, checked by commitlint:

```
feat(api): reject bookings longer than 10 hours
fix(web): announce booking errors to screen readers
chore(deps): bump drizzle-orm
```

Scopes: `web, api, ui, config, api-client, infra, ci, docs, agents, deps, specs`.

## Changesets

User-visible change? Add a changeset: `bin/pnpm changeset`, pick the packages and the bump,
and write one line for the changelog. Commit the generated `.changeset/*.md`.

## Before you push

```bash
bin/pnpm lint typecheck test build
docker compose --profile e2e run --rm e2e     # UI changes
bin/pnpm gen:api                              # API contract changes; commit openapi.json
```

Hooks may never be bypassed (`--no-verify`). If a hook is wrong, fix the hook in a PR.

## Dependencies

Add a dependency only with a reason in the PR. pnpm blocks install scripts by default;
a package that needs one goes in `allowBuilds` in `pnpm-workspace.yaml` (reviewed).
Dependabot opens grouped update PRs weekly.

## Decisions

Anything significant or hard to reverse gets an ADR in `docs/adr/` (copy `template.md`).
