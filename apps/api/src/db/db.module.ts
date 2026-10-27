import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type pg from 'pg';

import type { Env } from '../config/env.js';
import { API_POOL_LIMITS, createDb, createPool } from './db.js';

/** Injection token for the Drizzle database (`@Inject(DB) db: Database`). */
export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createPool(config.get('DATABASE_URL', { infer: true }), API_POOL_LIMITS),
    },
    { provide: DB, inject: [PG_POOL], useFactory: createDb },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
