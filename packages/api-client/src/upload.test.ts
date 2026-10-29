import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './fetcher';
import { uploadSpacePhoto } from './upload';

class FakeXhr {
  static last: FakeXhr;
  method = '';
  url = '';
  withCredentials = false;
  responseType = '';
  status = 0;
  responseText = '';
  headers: Record<string, string> = {};
  sent: unknown;
  aborted = false;
  upload: Record<string, ((e?: unknown) => void) | null> = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  responseHeaders: Record<string, string> = {};
  constructor() {
    FakeXhr.last = this;
  }
  open(m: string, u: string) {
    this.method = m;
    this.url = u;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(n: string) {
    return this.responseHeaders[n] ?? null;
  }
  send(b: unknown) {
    this.sent = b;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number, body: string) {
    this.upload.onload?.();
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }
}

const file = new File(['x'], 'a.png', { type: 'image/png' });

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});
afterEach(() => vi.unstubAllGlobals());

describe('uploadSpacePhoto', () => {
  it('posts multipart to the encoded path with credentials, reports progress and resolves', async () => {
    const onProgress = vi.fn();
    const onProcessing = vi.fn();
    const p = uploadSpacePhoto('a/b?c', file, { onProgress, onProcessing });
    const x = FakeXhr.last;
    expect(x.method).toBe('POST');
    expect(x.url).toBe('/api/owner/spaces/a%2Fb%3Fc/photos');
    expect(x.withCredentials).toBe(true);
    expect((x.sent as FormData).get('file')).toBeInstanceOf(File);
    x.progress(25, 100);
    x.progress(50, 100);
    expect(onProcessing).not.toHaveBeenCalled();
    x.respond(201, JSON.stringify({ id: 'p1', position: 1 }));
    await expect(p).resolves.toMatchObject({ id: 'p1' });
    expect(onProgress.mock.calls.map((c: number[]) => c[0])).toEqual([0.25, 0.5, 1]);
    expect(onProcessing).toHaveBeenCalledOnce();
  });

  it('rejects a problem response with ApiError and its type', async () => {
    const p = uploadSpacePhoto('s', file);
    FakeXhr.last.respond(
      413,
      JSON.stringify({ type: 'urn:bseat:problem:photo:too-large', status: 413 }),
    );
    const e = await p.catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(413);
    expect((e as ApiError).problem?.type).toBe('urn:bseat:problem:photo:too-large');
  });

  it('keeps Retry-After seconds on a busy response', async () => {
    const p = uploadSpacePhoto('s', file);
    FakeXhr.last.responseHeaders['Retry-After'] = '7';
    FakeXhr.last.respond(
      503,
      JSON.stringify({ type: 'urn:bseat:problem:photo:busy', status: 503 }),
    );
    await expect(p).rejects.toMatchObject({ status: 503, retryAfter: 7 });
  });

  it('maps a bare error response to the network type with its status', async () => {
    const p = uploadSpacePhoto('s', file);
    FakeXhr.last.respond(408, '');
    await expect(p).rejects.toMatchObject({
      status: 408,
      problem: { type: 'urn:bseat:problem:network' },
    });
  });

  it('rejects a connection loss with status 0 and the network type', async () => {
    const p = uploadSpacePhoto('s', file);
    FakeXhr.last.onerror?.();
    await expect(p).rejects.toMatchObject({
      status: 0,
      problem: { type: 'urn:bseat:problem:network' },
    });
  });

  it('aborts mid-upload with an AbortError', async () => {
    const ctl = new AbortController();
    const p = uploadSpacePhoto('s', file, { signal: ctl.signal });
    ctl.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects at once when the signal is already aborted', async () => {
    const p = uploadSpacePhoto('s', file, { signal: AbortSignal.abort() });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects an unreadable success body', async () => {
    const p = uploadSpacePhoto('s', file);
    FakeXhr.last.respond(201, 'nope');
    await expect(p).rejects.toBeInstanceOf(ApiError);
  });
});
