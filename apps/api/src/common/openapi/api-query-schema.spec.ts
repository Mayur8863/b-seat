import { Controller, Get, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiQueryFromSchema } from './api-query-schema.js';

const WindowQueryInput = z
  .object({
    date: z.iso.date().describe('Local date'),
    limit: z.string().optional(),
  })
  .refine((q) => q.date !== '', { path: ['date'] })
  .meta({ id: 'WindowQueryInput' });

@Controller('things')
class ThingsController {
  @Get()
  @ApiQueryFromSchema(WindowQueryInput)
  list(@Query({ schema: WindowQueryInput }) query: unknown): unknown {
    return query;
  }
}

const PageQuery = z.object({ page: z.string().describe('Page number') });

@Controller('pages')
class PagesController {
  @Get()
  @ApiQueryFromSchema(PageQuery)
  list(@Query({ schema: PageQuery }) query: unknown): unknown {
    return query;
  }
}

async function documentFor(controller: new () => unknown) {
  const moduleRef = await Test.createTestingModule({ controllers: [controller] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  await app.close();
  return document;
}

describe('ApiQueryFromSchema', () => {
  it('works for an unnamed schema without duplicating parameters', async () => {
    const document = await documentFor(PagesController);
    expect(document.paths['/pages']?.get?.parameters).toEqual([
      {
        name: 'page',
        in: 'query',
        required: true,
        description: 'Page number',
        schema: { type: 'string' },
      },
    ]);
  });

  it('documents each property of a named query schema as its own query parameter', async () => {
    const document = await documentFor(ThingsController);
    const parameters = document.paths['/things']?.get?.parameters;
    expect(parameters).toEqual([
      {
        name: 'date',
        in: 'query',
        required: true,
        description: 'Local date',
        schema: expect.objectContaining({ type: 'string', format: 'date' }),
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'string' },
      },
    ]);
    // The named schema stays a component, so the contract keeps its request schema id.
    expect(document.components?.schemas).toHaveProperty('WindowQueryInput');
  });
});
