import { Controller, Get, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';

import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { REDIS } from '../redis/redis.module.js';

/**
 * Liveness: process is up (no dependencies; used by the container healthcheck).
 * Readiness: Postgres + Redis reachable (used by the load balancer).
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.probe('postgres', () => this.db.execute(sql`select 1`)),
      () => this.probe('redis', () => this.redis.ping()),
    ]);
  }

  private async probe(key: string, fn: () => Promise<unknown>) {
    const check = this.indicator.check(key);
    try {
      await fn();
      return check.up();
    } catch (err) {
      return check.down({ message: (err as Error).message });
    }
  }
}
