/**
 * The single HTTP entry point for every generated client call (orval mutator).
 * - Browser: same-origin `/api/*` (Next.js proxies to the API) with cookies.
 * - Server (RSC/route handlers): API_INTERNAL_URL; pass the incoming cookie
 *   header via `init.headers` when acting on behalf of a user.
 */

/** RFC 9457 problem details, as returned by the API on every error. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
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

/** Gateways and proxies can answer with HTML or arbitrary JSON; only trust real problem details. */
function asProblem(data: unknown): ProblemDetails | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  return 'type' in data && typeof data.type === 'string' ? (data as ProblemDetails) : undefined;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined;
  const type = res.headers.get('content-type') ?? '';
  return type.includes('json') ? res.json() : res.text();
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  const res = await fetch(`${baseUrl()}${url}`, { credentials: 'include', ...init, headers });
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, asProblem(data));
  return { data, status: res.status, headers: res.headers } as T;
}

export default apiFetch;
