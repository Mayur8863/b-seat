# ADR-0006: Quality gates and code-quality tooling

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project lead, devops agent

## Context

AI agents produce code quickly; quality must be enforced automatically and the same way
locally and in CI.

## Decision

| Concern            | Tool                                                                         | Where                            |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------- |
| Lint / format      | ESLint 9 (type-aware typescript-eslint, jsx-a11y strict, Next) + Prettier    | hooks, CI                        |
| Git hooks          | **Lefthook** (single Go binary, parallel jobs, run through Docker)           | pre-commit, commit-msg, pre-push |
| Commits / versions | Conventional Commits + commitlint; Changesets                                | commit-msg, PRs                  |
| Unit / integration | Vitest 5 (+ SWC for Nest decorators), real Postgres/Redis                    | CI `test`                        |
| Components         | Testing Library + MSW (orval-generated handlers)                             | CI `test`                        |
| E2E / a11y         | Playwright + @axe-core/playwright (WCAG 2.1 AA)                              | CI `e2e`                         |
| Contract           | `openapi.json` drift check + Schemathesis fuzzing of the running API         | CI `contract`                    |
| Coverage           | v8 + **diff-cover ≥ 80% on changed lines**; package floors in vitest configs | CI                               |
| Secrets            | gitleaks                                                                     | pre-commit, CI                   |
| SAST               | Semgrep CE (TS, Node, Docker, secrets rulesets)                              | CI, `bin/security`               |
| Containers / deps  | Trivy (fs + images), Dependabot (grouped)                                    | CI, weekly                       |

Lefthook was chosen over Husky + lint-staged (one binary, runs on the host, delegates
to Docker). ESLint + Prettier were chosen over Biome, which lacks type-aware rules and the jsx-a11y
and Next rule sets. Dependabot was chosen over Renovate because it needs no GitHub App installation.

## Consequences

Required status checks on `main` (configured when the GitHub repo exists) mirror the
CI jobs. Bypassing hooks is forbidden for agents (`guard_bash.py`).
