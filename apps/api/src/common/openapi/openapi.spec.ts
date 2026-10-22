import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';

import { withProblemContentType } from './openapi.js';

describe('withProblemContentType', () => {
  it('declares error responses as application/problem+json and leaves success alone', () => {
    const schema = { $ref: '#/components/schemas/X' };
    const doc = {
      paths: {
        '/api/x': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema } } },
              '401': { content: { 'application/json': { schema } } },
              '204': { description: 'no body' },
            },
          },
        },
      },
    } as unknown as OpenAPIObject;

    const responses = withProblemContentType(doc).paths['/api/x']!.get!.responses;

    expect(responses['200']).toEqual({ content: { 'application/json': { schema } } });
    expect(responses['401']).toEqual({ content: { 'application/problem+json': { schema } } });
    expect(responses['204']).toEqual({ description: 'no body' });
  });
});
