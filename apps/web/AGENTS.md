# AGENTS.md: apps/web

Root `AGENTS.md` applies. Additional rules for the web app:

## Commands

```bash
bin/pnpm --filter @bseat/web lint | typecheck | test | test:coverage | build
docker compose --profile e2e run --rm e2e        # Playwright + axe against the running stack
```

## Structure

```
src/app/(auth)/…     public auth pages        src/app/(app)/…   signed-in pages (guarded by src/proxy.ts)
src/components/      app components + *.test.tsx next to them
src/lib/             auth-client and small helpers
src/test/            vitest setup, MSW server, render helpers
e2e/                 Playwright journeys + axe checks
```

Reference implementations: `components/dashboard-view.tsx` (four-state hook pattern) and `components/app-nav.tsx` (role-aware nav and
mobile panel), and `components/auth-form.tsx` (accessible RHF + Zod form).

## Rules

- Data: `import { useXxx } from '@bseat/api-client'`. Mock in tests with
  `@bseat/api-client/mocks` handlers via `server.use(...)`. No `fetch`.
- Auth: `authClient` from `src/lib/auth-client.ts`. `proxy.ts` only improves UX; the API enforces auth.
- UI primitives come from `@bseat/ui/components/*`. Add new ones to `packages/ui` with the shadcn CLI.
- Every new page: a `metadata` title, one `<h1>`, `<main id="main">`, and keyboard and axe clean.
- Typed routes are on (`typedRoutes`), so links are type-checked.
