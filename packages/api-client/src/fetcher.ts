/**
 * The single HTTP entry point for every generated client call (orval mutator).
 * - Browser: same-origin `/api/*` (Next.js proxies to the API) with cookies.
 * - Server (RSC/route handlers): API_INTERNAL_URL; pass the incoming cookie
 *   header via `init.headers` when acting on behalf of a user.
 */

/** RFC 9457 problem details, as returned by the API on every error. */
export interface ProblemDetails {
  type: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
  /** Extension member of `listing:publish-incomplete`: what the listing still lacks. */
  missing?: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | undefined,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

/** Error type orval uses for generated hooks (`error` in useQuery/useMutation). */
export type ErrorType<P> = ApiError & { problem: P | undefined };

function baseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * Gateways and proxies can answer with HTML or arbitrary JSON, so only trust real problem details.
 * Requiring a string `type` is deliberately stricter than RFC 9457 (where it is optional):
 * every BSeat API error carries one, so its absence means the body did not come from the API.
 */
function asProblem(data: unknown, status: number): ProblemDetails | undefined {
  if (typeof data !== 'object' || data === null || !('type' in data)) return undefined;
  const raw = data as Record<string, unknown>;
  if (typeof raw.type !== 'string') return undefined;
  const problem: ProblemDetails = {
    type: raw.type,
    status: typeof raw.status === 'number' ? raw.status : status,
  };
  const title = str(raw.title);
  const detail = str(raw.detail);
  const instance = str(raw.instance);
  const requestId = str(raw.requestId);
  if (title !== undefined) problem.title = title;
  if (detail !== undefined) problem.detail = detail;
  if (instance !== undefined) problem.instance = instance;
  if (requestId !== undefined) problem.requestId = requestId;
  if (Array.isArray(raw.errors)) {
    problem.errors = raw.errors.filter(
      (e): e is { path: string; message: string } =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).path === 'string' &&
        typeof (e as Record<string, unknown>).message === 'string',
    );
  }
  if (Array.isArray(raw.missing)) {
    problem.missing = raw.missing.filter((m): m is string => typeof m === 'string');
  }
  return problem;
}

/**
 * Error bodies are parsed tolerantly (a gateway may send HTML or truncated JSON, and the status
 * must survive). Successful bodies stay strict so a bad one becomes a query error, not bad data.
 */
async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined;
  const text = await res.text();
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  if (!isJson) return text || undefined;
  try {
    return JSON.parse(text);
  } catch {
    if (res.ok) throw new ApiError(res.status, undefined);
    return text || undefined;
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  const res = await fetch(`${baseUrl()}${url}`, { credentials: 'include', ...init, headers });
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, asProblem(data, res.status));
  return { data, status: res.status, headers: res.headers } as T;
}

export default apiFetch;
