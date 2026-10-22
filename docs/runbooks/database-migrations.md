# Runbook: database migrations

## Making a schema change

1. Edit the Drizzle schema in `apps/api/src/db/schema/`.
2. `bin/pnpm --filter @bseat/api db:generate --name <short-change>` writes
   `apps/api/drizzle/NNNN_<name>.sql` and updates `drizzle/meta/`.
3. **Read the SQL.** Look for table rewrites, locks on large tables, and dropped columns.
4. Constraints Drizzle can't express (e.g. exclusion constraints) go in a custom migration:
   `bin/pnpm --filter @bseat/api exec drizzle-kit generate --custom --name <name>`, then hand-write the SQL.
5. Apply locally with `bin/pnpm db:migrate`. Integration tests migrate `bseat_test` on every run.
6. Commit the schema, the SQL and `drizzle/meta` together. CI fails if the schema changed
   without a migration.

Never edit a migration that has been merged. Write a new one.

## Safe changes in production (expand → migrate → contract)

- Add a nullable column or a column with a default. Backfill in batches. Make it NOT NULL later.
- Rename = add new + dual-write + backfill + switch reads + drop old (across releases).
- Create indexes `CONCURRENTLY` in a custom migration on large tables.

## Running in AWS

A one-off ECS task runs `node dist/db/migrate.js` from the API image, with `DATABASE_URL`
from Secrets Manager, before the API service is updated (ADR-0007). It uses only runtime
dependencies (no drizzle-kit). Extensions such as `btree_gist` need the RDS master user once:
`CREATE EXTENSION IF NOT EXISTS btree_gist;`.

## Rollback

Migrations are forward-only. To undo, write a new migration that reverses the change, and
deploy the previous app version only if it is compatible with the current schema.
