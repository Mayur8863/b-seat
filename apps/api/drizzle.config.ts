import { defineConfig } from 'drizzle-kit';

// Migrations are generated from src/db/schema (`pnpm db:generate`), reviewed
// in the PR, and applied with `pnpm db:migrate`. Never edit an applied one.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
