import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

/** Timeouts that bound a request's DB work; scripts (migrate, seed) pass none, as DDL runs long. */
export const API_POOL_LIMITS: pg.PoolConfig = {
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  idle_in_transaction_session_timeout: 10_000,
};

export function createPool(connectionString: string, limits: pg.PoolConfig = {}): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, ...limits });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

/** What the seed needs: a `Database` or one of its transactions. */
export type DbExecutor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;
