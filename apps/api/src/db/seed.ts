/**
 * Idempotent dev seed: safe to run on every `docker compose up`.
 * Demo accounts and marketplace listings; see seed-run.ts for the guards.
 */
import { createDb, createPool } from './db.js';
import { runSeed } from './seed-run.js';

try {
  await runSeed(process.env, (url) => {
    const pool = createPool(url);
    return { db: createDb(pool), close: () => pool.end() };
  });
  console.warn('seed: done');
} catch (err) {
  // A non-zero exit fails the compose `migrate` service, so the stack does not start half-seeded.
  console.error(err instanceof Error ? err.message : 'seed: failed');
  process.exitCode = 1;
}
