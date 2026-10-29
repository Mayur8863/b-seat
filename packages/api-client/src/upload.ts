/**
 * Photo upload over XMLHttpRequest: `fetch` has no upload progress (ADR-0011).
 * Same-origin through the Next rewrite, with cookies. Failures reject with the same
 * `ApiError` shape as `apiFetch`, so callers map problem types in one place.
 */
import { ApiError, asProblem } from './fetcher';
import type { OwnerSpacePhoto } from './generated/model';

export interface UploadSpacePhotoOptions {
  /** Fraction 0..1 of the request body sent. */
  onProgress?: (fraction: number) => void;
  /** Fires once the whole body is sent and the server is processing the image. */
  onProcessing?: () => void;
  signal?: AbortSignal;
}

const NETWORK = 'urn:bseat:problem:network';

const abortError = () => new DOMException('The upload was aborted.', 'AbortError');

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

export function uploadSpacePhoto(
  spaceId: string,
  file: File,
  { onProgress, onProcessing, signal }: UploadSpacePhotoOptions = {},
): Promise<OwnerSpacePhoto> {
  return new Promise<OwnerSpacePhoto>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      xhr.abort();
    };
    const done = () => signal?.removeEventListener('abort', onAbort);
    const network = (status: number) =>
      new ApiError(status, { type: NETWORK, status, title: 'Connection lost' });

    xhr.open('POST', `/api/owner/spaces/${encodeURIComponent(spaceId)}/photos`);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => {
      onProgress?.(1);
      onProcessing?.();
    };
    xhr.onload = () => {
      done();
      const body = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (typeof body === 'object' && body !== null) resolve(body as OwnerSpacePhoto);
        else reject(new ApiError(xhr.status, undefined));
        return;
      }
      const problem = asProblem(body, xhr.status) ?? { type: NETWORK, status: xhr.status };
      reject(
        new ApiError(xhr.status, problem, retryAfterSeconds(xhr.getResponseHeader('Retry-After'))),
      );
    };
    xhr.onerror = () => {
      done();
      reject(network(0));
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      done();
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
