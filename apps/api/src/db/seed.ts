/**
 * Idempotent dev seed: safe to run on every `docker compose up`.
 * Domain seed data is added by feature slices (see specs/).
 */
import { createDb, createPool } from './db.js';
import { seedSpaces } from './demo-spaces.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = createPool(url);
const db = createDb(pool);

try {
  await seedSpaces(db);
  console.warn('seed: done');
} catch (err) {
  // A non-zero exit fails the compose `migrate` service, so the stack does not start half-seeded.
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
