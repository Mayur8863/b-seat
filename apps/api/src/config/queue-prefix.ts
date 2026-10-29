/**
 * Test runs on different databases share one Redis, so the database name joins the prefix and a run's
 * worker never takes another run's jobs. Dev and prod keep the plain per-environment prefix.
 */
export function queuePrefix(nodeEnv: string, databaseUrl: string): string {
  if (nodeEnv !== 'test') return `bseat:${nodeEnv}`;
  const db = new URL(databaseUrl).pathname.replace(/^\//, '');
  return db === '' ? 'bseat:test' : `bseat:test:${db}`;
}
