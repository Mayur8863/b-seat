# BSeat Constitution

These principles bind every spec, plan, task and PR. `/speckit-plan` checks plans
against them (the "Constitution Check" gate). AGENTS.md holds the day-to-day
conventions that put these principles into practice.

## Core Principles

### I. Spec before code (NON-NEGOTIABLE)

Every change starts as `specs/NNN-<feature>/spec.md` → `plan.md` → `tasks.md`.
The spec says *what* and *why* in user terms, with testable acceptance criteria and
explicit non-goals. The architect approves the plan before implementation starts.

### II. Test-first for business logic (NON-NEGOTIABLE)

Write the failing test, make it pass, then refactor. Every acceptance criterion maps to at
least one automated test (unit, integration or e2e). Changed lines need at least 80% coverage.
Integration tests use a real Postgres and Redis, not mocks.

### III. Contract-first API

The API contract is Zod schemas → OpenAPI (`apps/api/openapi.json`). The web app consumes
only the generated client. A contract change is a reviewed change to `openapi.json`;
breaking changes need a new version or an expand/contract migration.

### IV. Invariants live in the database

Correctness rules that must never break (no double booking, uniqueness, ownership)
are enforced by database constraints as well as in code, so concurrency cannot violate them.

### V. Secure and accessible by default

Validate at the boundary, authorize every data access, keep secrets out of code and logs.
UI meets WCAG 2.1 AA, verified by axe in e2e tests.

### VI. Small, reversible, observable changes

One task = one branch = one PR. Prefer the simplest design that meets the spec (YAGNI).
Structured logs with request ids, health probes and traces for everything that runs.

## Technology constraints

Stack and versions as in AGENTS.md (Next.js 16, NestJS 12, Drizzle, Postgres 18, Redis 8,
Better Auth). The deployment target is AWS (ADR-0007). A new runtime dependency needs a
justification in the plan; a new framework or datastore needs an ADR.

## Development workflow and quality gates

spec → task-manager plans → architect approves → devs implement (TDD) → qa-engineer
tests → code-reviewer + security-reviewer → fix loop → docs-writer → human approves the PR.
CI gates: lint, typecheck, unit and integration tests, coverage, build, e2e and axe,
contract drift, gitleaks, Semgrep and Trivy. No agent merges to `main`.

## Governance

This constitution overrides other practice documents. Amend it through a PR that explains
the change, bumps the version, and updates AGENTS.md if needed. Reviewers reject work that
violates a principle unless the plan's "Complexity Tracking" section justifies it.

**Version**: 1.0.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-10-22
