/**
 * Postgres connection for the portal.
 *
 * Mirrors connectionFor() in scripts/db-reset.mjs — deliberately duplicated
 * rather than imported, because that file is a CLI that drops databases and
 * nothing in a web app should be one import away from it.
 *
 * The portal is a TRUSTED SERVER CONTEXT. It connects as the owner and therefore
 * bypasses RLS, the same posture PostgREST's service_role has. That is correct
 * here — an admin editing the menu is not a customer reading their own row — but
 * it means RLS is not a safety net for this app. Every query here must be
 * scoped by hand, and every mutation must go through a server action that has
 * already checked the session.
 */

import pg from 'pg';

// DATE (oid 1082) as 'YYYY-MM-DD'. Otherwise node-postgres builds a Date at
// local midnight and rendering it in another timezone shifts the day.
pg.types.setTypeParser(1082, (v) => v);
// int8 as a number. Counts and ledger ids fit comfortably; the string default
// turns every sum into a template-literal surprise.
pg.types.setTypeParser(20, (v) => Number(v));

const DB_NAME = process.env.STACKD_DB ?? 'stackd_dev';

function connectionConfig(): pg.PoolConfig {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${DB_NAME}`;
    return { connectionString: url.toString() };
  }
  // A host starting with `/` makes pg use the unix socket, where Debian's
  // default pg_hba grants peer auth without a password.
  return {
    host: process.env.PGHOST ?? '/var/run/postgresql',
    database: DB_NAME,
    user: process.env.PGUSER,
  };
}

/**
 * One pool per process, cached on globalThis so Next's dev-mode module reloading
 * does not open a new pool on every edit until Postgres refuses connections.
 */
const globalForPool = globalThis as unknown as { stackdPool?: pg.Pool };

export const pool: pg.Pool =
  globalForPool.stackdPool ?? new pg.Pool({ ...connectionConfig(), max: 5 });

if (process.env.NODE_ENV !== 'production') globalForPool.stackdPool = pool;

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(sql, params as never[]);
  return res.rows as T[];
}

/** Single row, or null. Throws if the query returns more than one. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  if (rows.length > 1) throw new Error(`expected at most one row, got ${rows.length}`);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction on a dedicated connection. */
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
