/**
 * An error the seed throws on purpose. Its message is safe to print (it names variables and
 * rows, never values); any other error is reported generically, because a driver error can
 * carry query parameters such as the password hash.
 */
export class SeedError extends Error {
  override readonly name = 'SeedError';
}

/** The line the seed prints for any error; never includes driver messages or parameters. */
export function describeSeedError(err: unknown): string {
  if (err instanceof SeedError) return err.message;
  // Drizzle wraps the driver error as `cause`; a bare driver error (e.g. a refused connection) has the code itself.
  const source = err instanceof Error && err.cause instanceof Error ? err.cause : err;
  const code =
    source instanceof Error && 'code' in source && typeof source.code === 'string'
      ? ` (${source.code})`
      : '';
  return `seed: database error${code}`;
}
