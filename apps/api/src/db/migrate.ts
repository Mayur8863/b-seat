/**
 * Applies pending SQL migrations from ./drizzle using only runtime deps
 * (no drizzle-kit). Used by the production image: `node dist/db/migrate.js`
 * (run as a one-off task before the API deploys, ADR-0007).
 */
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb, createPool } from './db.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = createPool(url);
try {
  await migrate(createDb(pool), {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  console.warn('migrate: done');
} finally {
  await pool.end();
}
