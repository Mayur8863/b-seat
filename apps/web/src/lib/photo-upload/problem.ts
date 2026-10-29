import { ApiError } from '@bseat/api-client';

const PREFIX = 'urn:bseat:problem:';

/** Maps an upload failure to the reducer's problem key (type without the URN prefix, or `http-<status>`). */
export function uploadProblem(error: unknown): string {
  if (!(error instanceof ApiError)) return 'network';
  const type = error.problem?.type.startsWith(PREFIX)
    ? error.problem.type.slice(PREFIX.length)
    : undefined;
  if (type?.startsWith('photo:') || type === 'network') return type;
  if (error.status === 401 || error.status === 403 || error.status === 404)
    return `http-${error.status}`;
  if (error.status === 0) return 'network';
  return type ?? 'unknown';
}
