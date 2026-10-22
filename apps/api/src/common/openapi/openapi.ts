import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document from controllers + Zod schemas (Standard Schema).
 * The committed apps/api/openapi.json is the contract the web client is
 * generated from; CI fails if it is stale (`pnpm gen:api`).
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BSeat API')
    .setDescription('Seat and desk booking API. Errors use RFC 9457 problem details.')
    .setVersion('0.1.0')
    .addCookieAuth('bseat.session_token')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

/** Serves Swagger UI at /docs and the raw spec at /openapi.json (non-production only). */
export function serveOpenApi(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
}
