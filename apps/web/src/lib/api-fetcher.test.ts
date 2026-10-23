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

  it('keeps the status when a JSON error body is empty or truncated', async () => {
    server.use(
      http.get(
        '*/api/x',
        () =>
          new HttpResponse('', { status: 502, headers: { 'content-type': 'application/json' } }),
      ),
    );
    const empty = await failure();
    expect(empty.status).toBe(502);
    expect(empty.problem).toBeUndefined();

    server.use(
      http.get(
        '*/api/x',
        () =>
          new HttpResponse('{"type":', {
            status: 504,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    expect((await failure()).status).toBe(504);
  });

  it('sanitises problem fields and never renders [object Object]', async () => {
    server.use(
      http.get('*/api/x', () =>
        HttpResponse.json(
          { type: 'x', detail: {}, title: 5, status: 'no', errors: 'no', requestId: 'r1' },
          { status: 400 },
        ),
      ),
    );
    const error = await failure();
    expect(error.message).not.toContain('[object Object]');
    expect(error.problem).toEqual({ type: 'x', title: 'x', status: 400, requestId: 'r1' });
  });
});
