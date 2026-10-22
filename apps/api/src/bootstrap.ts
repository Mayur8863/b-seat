import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import type { Auth } from './auth/auth.js';
import { AUTH_BASE_PATH } from './auth/auth.js';
import { AUTH } from './auth/auth.tokens.js';
import { createOpenApiDocument, serveOpenApi } from './common/openapi/openapi.js';
import type { Env } from './config/env.js';

/** Creates and configures the app (shared by main.ts and integration tests). */
export async function createApp(): Promise<NestExpressApplication> {
  // bodyParser off: Better Auth must read the raw request first.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(helmet());
  // Domain routes live under /api (same prefix the web app proxies); probes stay at /health.
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });

  const auth = app.get<Auth>(AUTH);
  app.getHttpAdapter().getInstance().all(`${AUTH_BASE_PATH}/*splat`, toNodeHandler(auth));
  app.useBodyParser('json', { limit: '100kb' });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    serveOpenApi(app, createOpenApiDocument(app));
  }
  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}
