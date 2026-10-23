import { ApiError, apiFetch } from '@bseat/api-client';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';

async function failure(): Promise<ApiError> {
  const error: unknown = await apiFetch('/api/x').catch((e: unknown) => e);
  if (!(error instanceof ApiError)) throw new Error('expected ApiError');
  return error;
}

describe('apiFetch error bodies', () => {
  it('keeps problem details', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json({ type: 'urn:t', title: 'T', status: 409 }, { status: 409 }),
      ),
    );
    expect((await failure()).problem?.type).toBe('urn:t');
  });

  it('drops an HTML gateway body', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.html('<html>502</html>', { status: 502 })));
    const error = await failure();
    expect(error.status).toBe(502);
    expect(error.problem).toBeUndefined();
  });

  it('drops JSON without a string type', async () => {
    server.use(http.get('*/api/x', () => HttpResponse.json({ type: 5 }, { status: 413 })));
    expect((await failure()).problem).toBeUndefined();
  });
});
