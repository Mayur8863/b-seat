# ADR-0005: Generated, contract-first API client (orval)

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** architect agent

## Context

Hand-written fetch calls drift from the API and duplicate types. The frontend needs typed
data fetching with caching (TanStack Query) and test mocks.

## Decision

- The API generates `apps/api/openapi.json` (`bin/pnpm gen:api`), which is **committed**
  and reviewed like code. CI regenerates it and fails on drift.
- `packages/api-client` runs **orval 8** to produce TanStack Query hooks, models, Zod schemas
  and MSW handlers with Faker data. The output (`src/generated`) is gitignored and rebuilt by Turbo.
- All calls go through one mutator (`src/fetcher.ts`): same-origin with cookies in the
  browser, `API_INTERNAL_URL` on the server, and throws a typed `ApiError` carrying problem details.
  `forceSuccessResponse` makes resolved values success-only.
- ESLint forbids `fetch` and `axios` in `apps/web`.

## Alternatives considered

- **@hey-api/openapi-ts:** comparable. We chose orval for its integrated query hooks and MSW mocks.
- **Shared Zod package between API and web:** couples deploys and skips the contract boundary.

## Consequences

Contract changes are explicit and visible in PRs. Contributors must run `gen:api` after API
changes; the hook and CI catch mistakes.
