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
  const cause = err instanceof Error ? err.cause : undefined;
  const code =
    cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
      ? ` (${cause.code})`
      : '';
  return `seed: database error${code}`;
}
