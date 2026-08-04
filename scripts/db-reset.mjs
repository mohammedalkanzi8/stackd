#!/usr/bin/env node
/**
 * Drops and rebuilds the local development database from source.
 *
 *   npm run db:reset                 # shim + schema + seed + dev fixtures
 *   npm run db:reset -- --no-dev-data
 *
 * Connects over the unix socket by default, not TCP. Debian's stock pg_hba.conf
 * gives `local all all peer`, so a role named after the OS user authenticates
 * with no password; the same connection over TCP hits scram-sha-256 and fails
 * with "password authentication failed" for a role that has no password. That
 * error reads like a permissions problem and is actually a transport one.
 *
 * Override with DATABASE_URL to point at a real server.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DB_NAME = process.env.STACKD_DB ?? 'stackd_dev';

/** Socket-first connection config. `host` starting with `/` makes pg use a socket. */
export function connectionFor(database) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    return { connectionString: url.toString() };
  }
  return {
    host: process.env.PGHOST ?? '/var/run/postgresql',
    database,
    user: process.env.PGUSER,
  };
}

/** Applied in order. Each file is one simple-query batch, so it is one transaction. */
const FILES = [
  'supabase/local/00_shim.sql',
  'supabase/schema.sql',
  'supabase/seed.sql',
  'supabase/local/10_dev_data.sql',
];

async function run() {
  const withDevData = !process.argv.includes('--no-dev-data');
  const files = FILES.filter((f) => withDevData || !f.includes('10_dev_data'));

  const admin = new pg.Client(connectionFor('postgres'));
  await admin.connect();
  // `with (force)` terminates other sessions first — otherwise an open psql in
  // another terminal blocks the drop indefinitely with no useful message.
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  const db = new pg.Client(connectionFor(DB_NAME));
  await db.connect();
  try {
    for (const rel of files) {
      const sql = await readFile(path.join(ROOT, rel), 'utf8');
      try {
        await db.query(sql);
      } catch (err) {
        // Postgres reports a character offset into the batch, which is useless
        // against a 600-line file. Turn it into a line number.
        const line = err.position
          ? sql.slice(0, Number(err.position)).split('\n').length
          : null;
        throw new Error(
          `${rel}${line ? `:${line}` : ''} — ${err.message}` +
            (err.hint ? `\n  hint: ${err.hint}` : ''),
        );
      }
      console.log(`  applied ${rel}`);
    }

    const { rows } = await db.query(`
      select
        (select count(*) from menu_items)  as items,
        (select count(*) from categories)  as categories,
        (select count(*) from rewards)     as rewards,
        (select count(*) from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) as rls_on,
        (select count(*) from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as rls_off
    `);
    const s = rows[0];
    console.log(
      `\n${DB_NAME}: ${s.categories} categories, ${s.items} items, ${s.rewards} rewards` +
        `\nRLS: ${s.rls_on} tables on, ${s.rls_off} off` +
        (Number(s.rls_off) > 0 ? '  ← every table should be on; run npm test' : ''),
    );
  } finally {
    await db.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error(`\ndb:reset failed\n  ${err.message}`);
    if (err.message.includes('ENOENT') || err.message.includes('ECONNREFUSED')) {
      console.error(
        '\nIs Postgres running?\n' +
          '  sudo service postgresql start\n' +
          'First time on this machine, you also need a role and socket access:\n' +
          '  sudo -u postgres createuser --superuser "$USER"',
      );
    }
    process.exit(1);
  });
}
