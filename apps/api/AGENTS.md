# AGENTS.md: apps/api

Root `AGENTS.md` applies. Additional rules for the API:

## Commands

```bash
bin/pnpm --filter @bseat/api dev | lint | typecheck | test | test:unit | test:integration | test:coverage
bin/pnpm --filter @bseat/api db:generate --name <change>   # after editing src/db/schema
bin/pnpm gen:api                                         # after any route or schema change
```

Integration tests need `docker compose up -d postgres redis mailpit`. They use the `bseat_test` DB.

## Adding a feature module

```
src/<feature>/
  <feature>.schemas.ts      Zod request (…Input) and response schemas with .meta({ id })
  <feature>.service.ts      business logic + Drizzle queries, scoped to the caller
  <feature>.service.spec.ts unit tests (write first)
  <feature>.controller.ts   thin: validate → service → return; @UseGuards(AuthGuard)
  <feature>.module.ts       register in app.module.ts
test/<feature>.int-spec.ts  HTTP-level tests with createTestApp / resetDb / signedInAgent
```

Reference implementation: `src/me/` (`me.schemas.ts` schemas, `me.service.ts` caller-scoped query, `me.controller.ts` guards and OpenAPI decorators, `me.module.ts` module).

## Rules

- ESM: relative imports end in `.js`. Constructor-injected classes are imported as values, not `import type`.
- Use the shared providers: `DB` (Drizzle), `REDIS` (ioredis), `MailService` (queued email), and `AUTH`.
- Errors are Nest exceptions mapped to problem+json by `ProblemFilter`.
- Treat Better Auth tables (`src/db/schema/auth.ts`) as owned by Better Auth: change them only with its docs.
