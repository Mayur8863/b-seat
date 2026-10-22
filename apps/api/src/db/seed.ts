/**
 * Idempotent dev seed: safe to run on every `docker compose up`.
 * Domain seed data is added by feature slices (see specs/).
 */
import { createDb, createPool } from './db.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = createPool(url);
const db = createDb(pool);

export async function seed(_db: typeof db): Promise<void> {
  // populated by feature slices
}

await seed(db);
await pool.end();
console.warn('seed: done');
