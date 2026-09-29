import { Pool } from 'pg';
import { env } from '../../config/env';

/**
 * The connection to the online store.
 *
 * A pool, not a connection per request: every Postgres connection costs 1-3MB
 * on the server, and a shop counter can easily fire a dozen requests at once.
 * Ten connections is plenty for the number of people who can be at the counter.
 *
 * The pool is created once and kept. The store reads the whole shop into memory
 * at boot and writes back the rows that changed, so a warm connection is the
 * normal case rather than the exception.
 */
let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  return env.database.url !== '';
}

export function getPool(): Pool {
  if (!env.database.url) {
    throw new Error('DATABASE_URL is not set, so the online store is not configured.');
  }
  if (pool) return pool;

  pool = new Pool({
    connectionString: env.database.url,
    max: env.database.poolMax,
    // Hand an unused connection back after half a minute of quiet. A shop PC
    // that sits closed overnight should not hold a slot open all night.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase presents its own certificate, which Node does not chain to a
    // public root, so the certificate itself is not verified. The connection is
    // still encrypted.
    ssl: { rejectUnauthorized: false },
  });

  // An idle client can be dropped by the server or the network without warning.
  // Without a listener that becomes an unhandled error event and takes the
  // whole process down; with one, the pool simply replaces the client.
  pool.on('error', (error: Error) => {
    console.error('[db] idle connection error:', error.message);
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}

/**
 * A safe description of where the data lives.
 *
 * Deliberately not the connection string: this is shown on the sync screen and
 * sent to the browser, and the connection string carries the password.
 */
export function describeDatabase(): string {
  if (!env.database.url) return '';
  try {
    const url = new URL(env.database.url);
    const database = url.pathname.replace(/^\//, '');
    return `${url.hostname}/${database}`;
  } catch {
    return 'configured database';
  }
}
