import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { createDb, createPool, type Database } from '../src/db/db.js';

/**
 * Reusable harness for "existing rows survive a migration" tests (expand/contract, research R-7).
 * It creates a throwaway database next to the test one, migrates it up to a named migration, lets
 * the test insert old-shaped rows with raw SQL, then migrates the rest. The dev database is never
 * touched: the scratch name is random and derived from DATABASE_URL_TEST.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

interface JournalEntry {
  idx: number;
  tag: string;
}
interface Journal {
  entries: JournalEntry[];
}

export interface ScratchDatabase {
  pool: pg.Pool;
  db: Database;
  /** Applies every migration up to and including `tag` (e.g. `0003_user_account_type`). */
  migrateTo(tag: string): Promise<void>;
  /** Applies every pending migration. */
  migrateToLatest(): Promise<void>;
  drop(): Promise<void>;
}

function urlWithDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Copies the migrations to a temp folder whose journal stops at `tag`. */
function foldersUpTo(tag: string): { dir: string; cleanup: () => void } {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as Journal & Record<string, unknown>;
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  if (last === -1) throw new Error(`unknown migration tag: ${tag}`);
  const dir = mkdtempSync(join(tmpdir(), 'bseat-migrations-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }),
  );
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const baseUrl = process.env.DATABASE_URL_TEST;
  if (!baseUrl) throw new Error('DATABASE_URL_TEST is required for integration tests');

  const name = `bseat_scratch_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: urlWithDatabase(baseUrl, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = createPool(urlWithDatabase(baseUrl, name));
  const db = createDb(pool);

  async function run(migrationsFolder: string): Promise<void> {
    await migrate(db, { migrationsFolder });
  }

  return {
    pool,
    db,
    async migrateTo(tag) {
      const { dir, cleanup } = foldersUpTo(tag);
      try {
        await run(dir);
      } finally {
        cleanup();
      }
    },
    migrateToLatest: () => run(MIGRATIONS_DIR),
    async drop() {
      await pool.end();
      const dropper = new pg.Client({ connectionString: urlWithDatabase(baseUrl, 'postgres') });
      await dropper.connect();
      try {
        await dropper.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}
