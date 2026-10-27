import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { MailService } from '../mail/mail.service.js';
import { createAuth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DB, ConfigService, MailService],
      useFactory: (db: Database, config: ConfigService<Env, true>, mail: MailService) =>
        createAuth({
          db,
          env: {
            BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
            BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
            TRUSTED_ORIGINS: config.get('TRUSTED_ORIGINS', { infer: true }),
            NODE_ENV: config.get('NODE_ENV', { infer: true }),
          },
          sendMail: (job) => mail.send(job),
        }),
    },
    AuthGuard,
    RolesGuard,
  ],
  exports: [AUTH, AuthGuard, RolesGuard],
})
export class AuthModule {}
