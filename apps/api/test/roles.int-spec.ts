import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Auth } from '../src/auth/auth.js';
import { AUTH } from '../src/auth/auth.tokens.js';
import { PG_POOL } from '../src/db/db.module.js';
import { createTestApp, ORIGIN, resetDb, signedInAgent } from './helpers.js';

const PASSWORD = 'correct-horse-battery';

describe('account type (sign-up, immutability, role guard)', () => {
  let app: NestExpressApplication;
  let pool: pg.Pool;

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get<pg.Pool>(PG_POOL);
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  const signUp = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', ORIGIN)
      .send({ name: 'Ada', email: 'ada@example.com', password: PASSWORD, ...body });

  const userCount = async () =>
    Number((await pool.query<{ n: string }>('select count(*) as n from "user"')).rows[0]?.n);

  it('rejects a sign-up without accountType (MISSING_FIELD) and creates no user', async () => {
    const res = await signUp({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FIELD');
    expect(await userCount()).toBe(0);
  });

  it('rejects an unknown accountType (VALIDATION_ERROR) and creates no user', async () => {
    const res = await signUp({ accountType: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await userCount()).toBe(0);
  });

  it('stores the chosen account type and exposes it on /api/me', async () => {
    const agent = await signedInAgent(
      app,
      { name: 'Olu', email: 'olu@example.com', password: PASSWORD },
      'owner',
    );
    const res = await agent.get('/api/me').expect(200);
    expect(res.body.accountType).toBe('owner');
  });

  it('treats a user row inserted without account_type as a renter', async () => {
    const auth = app.get<Auth>(AUTH);
    const { password } = await auth.$context;
    await pool.query(
      `insert into "user" (id, name, email) values ('legacy', 'Legacy', 'legacy@example.com')`,
    );
    await pool.query(
      `insert into "account" (id, account_id, provider_id, user_id, password)
       values ('legacy-acc', 'legacy', 'credential', 'legacy', $1)`,
      [await password.hash(PASSWORD)],
    );
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/sign-in/email')
      .set('origin', ORIGIN)
      .send({ email: 'legacy@example.com', password: PASSWORD })
      .expect(200);
    const res = await agent.get('/api/me').expect(200);
    expect(res.body.accountType).toBe('renter');
  });

  it('refuses to change accountType through update-user and leaves the row untouched', async () => {
    const agent = await signedInAgent(app);
    for (const body of [{ accountType: 'owner' }, { accountType: 'owner', name: 'Hacker' }]) {
      await agent.post('/api/auth/update-user').set('origin', ORIGIN).send(body).expect(400);
    }
    const { rows } = await pool.query<{ account_type: string; name: string }>(
      `select account_type, name from "user"`,
    );
    expect(rows).toEqual([{ account_type: 'renter', name: 'Test User' }]);
  });

  it('still lets a user change their name', async () => {
    const agent = await signedInAgent(app);
    await agent
      .post('/api/auth/update-user')
      .set('origin', ORIGIN)
      .send({ name: 'New' })
      .expect(200);
    const { rows } = await pool.query<{ name: string }>(`select name from "user"`);
    expect(rows[0]?.name).toBe('New');
  });

  it('enforces the CHECK constraint in the database', async () => {
    await signedInAgent(app);
    await expect(pool.query(`update "user" set account_type = 'admin'`)).rejects.toMatchObject({
      code: '23514',
      constraint: 'user_account_type_valid',
    });
  });
});
