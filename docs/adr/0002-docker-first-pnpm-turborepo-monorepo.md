# ADR-0002: Docker-first pnpm + Turborepo monorepo

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project lead

## Context

The product has a web app, an API and shared code (UI kit, generated API client, lint and TS
config) that change together. Contributors (human and AI) need an identical toolchain, and
the project lead asked that tools be installed and run through Docker as much as possible.

## Decision

- One repo with pnpm workspaces (`apps/*`, `packages/*`) and Turborepo for task graph
  and caching. The pnpm version is pinned through `packageManager` (corepack).
- **The host needs only Docker.** A `bseat-tools` image (Node 22 LTS, pnpm, git) runs every
  command through `bin/pnpm` / `bin/tools`. The repo is mounted at the _same absolute path_
  as on the host, so paths in errors, git hooks and caches match on both sides.
- `docker compose up` runs the full dev stack: install → migrate/seed → api + web with hot
  reload, plus Postgres, Redis and Mailpit. Scanners (gitleaks, Semgrep, Trivy) and
  Playwright also run from pinned official images.
- Internal packages are consumed as TypeScript source (no build step), except
  `@bseat/api-client`, whose "build" is code generation.

Version pins chosen while bootstrapping, and why:

| Tool       | Pin    | Reason                                                                     |
| ---------- | ------ | -------------------------------------------------------------------------- |
| TypeScript | `~6.0` | typescript-eslint supports `<6.1`; TS 7 (native) breaks lint tooling       |
| ESLint     | `^9`   | eslint-plugin-jsx-a11y and eslint-plugin-react don't support ESLint 10 yet |
| Node       | 22 LTS | Node 20 is EOL; orval and vitest need ≥ 22.12                              |

## Alternatives considered

- **Host-installed Node/pnpm:** faster commands, but versions drift between machines.
- **Nx:** more features, but heavier and more opinionated than we need.
- **Dev Containers:** a good later addition, and the tools image can back one.

## Consequences

Each `bin/pnpm` call pays about 1s of container startup. Git hooks run on the host but execute
in Docker. Revisit the TS and ESLint pins when typescript-eslint and the a11y plugin catch up
(Dependabot ignores those majors until then).
