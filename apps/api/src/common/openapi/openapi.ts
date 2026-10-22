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

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  return withProblemContentType(document);
}

/**
 * Every error body is RFC 9457 (ProblemFilter), so declare 4xx/5xx responses as
 * application/problem+json instead of swagger's default application/json.
 */
export function withProblemContentType(document: OpenAPIObject): OpenAPIObject {
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem) as { responses?: Record<string, unknown> }[]) {
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        const content = (response as { content?: Record<string, unknown> }).content;
        if (Number(status) >= 400 && content?.['application/json']) {
          content['application/problem+json'] = content['application/json'];
          delete content['application/json'];
        }
      }
    }
  }
  return document;
}

/** Serves Swagger UI at /docs and the raw spec at /openapi.json (non-production only). */
export function serveOpenApi(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
}
