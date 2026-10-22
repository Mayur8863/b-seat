import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { ProblemFilter } from './common/errors/problem.filter.js';
import { validationPipe } from './common/errors/validation.js';
import { type Env, loadEnv } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { MeController } from './me/me.controller.js';
import { REDIS, RedisModule } from './redis/redis.module.js';
import { SpacesModule } from './spaces/spaces.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: loadEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
          ...(config.get('NODE_ENV', { infer: true }) === 'development' && {
            transport: { target: 'pino-pretty', options: { singleLine: true } },
          }),
        },
      }),
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [REDIS, ConfigService],
      // Per-environment prefix so test jobs never reach the dev worker.
      useFactory: (redis: Redis, config: ConfigService<Env, true>) => ({
        connection: redis,
        prefix: `bseat:${config.get('NODE_ENV', { infer: true })}`,
      }),
    }),
    TerminusModule,
    DbModule,
    MailModule,
    AuthModule,
    SpacesModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    { provide: APP_PIPE, useValue: validationPipe },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
