import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';

import type { AccountType } from '../src/auth/account-type.js';
import { createApp } from '../src/bootstrap.js';
import { PG_POOL } from '../src/db/db.module.js';

export const ORIGIN = 'http://localhost:3000';

export async function createTestApp(): Promise<NestExpressApplication> {
  const app = await createApp();
  await app.init();
  return app;
}

/** Empties every app table (keeps the schema). Call in beforeEach. */
export async function resetDb(app: NestExpressApplication): Promise<void> {
  const pool = app.get<pg.Pool>(PG_POOL);
  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await pool.query(`truncate ${tables} restart identity cascade`);
}

/** Signs up a user (a renter unless told otherwise) and returns an agent that carries the session cookie. */
export async function signedInAgent(
  app: NestExpressApplication,
  user = { name: 'Test User', email: 'test@example.com', password: 'correct-horse-battery' },
  accountType: AccountType = 'renter',
) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/sign-up/email')
    .set('origin', ORIGIN)
    .send({ ...user, accountType })
    .expect(200);
  return agent;
}
