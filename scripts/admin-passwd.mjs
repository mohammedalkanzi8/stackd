#!/usr/bin/env node
/**
 * Sets an admin portal password for a staff member.
 *
 *   npm run admin:passwd -- owner@stackd.local
 *
 * Prompts without echoing. The staff member must already exist in `staff` and
 * have an email on their auth.users row — this creates the credential, not the
 * person.
 */

import { createInterface } from 'node:readline';
import pg from 'pg';

import { connectionFor, DB_NAME } from './db-reset.mjs';
import { hashPassword } from '../apps/admin/lib/password.ts';

/** Reads a line with the terminal's echo turned off. */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl.output;
    let muted = false;
    output._writeToOutput = function (chunk) {
      if (!muted) output.constructor.prototype._writeToOutput.call(output, chunk);
    };
    rl.question(question, (answer) => {
      muted = false;
      output.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('usage: npm run admin:passwd -- <staff email>');
    process.exit(1);
  }

  const db = new pg.Client(connectionFor(DB_NAME));
  await db.connect();
  try {
    const { rows } = await db.query(
      `select s.id, s.full_name, s.role
         from staff s join auth.users u on u.id = s.id
        where lower(u.email) = lower($1) and s.is_active`,
      [email],
    );
    if (rows.length === 0) {
      throw new Error(
        `no active staff member with email ${email}\n` +
          '  Staff are seeded in supabase/local/10_dev_data.sql for local work.',
      );
    }
    const staff = rows[0];

    const password = await prompt(`Password for ${staff.full_name} (${staff.role}): `);
    if (password.length < 8) throw new Error('password must be at least 8 characters');
    const again = await prompt('Again: ');
    if (password !== again) throw new Error('passwords did not match');

    await db.query(
      `insert into staff_credentials (staff_id, password_hash)
       values ($1, $2)
       on conflict (staff_id) do update
         set password_hash = excluded.password_hash, updated_at = now()`,
      [staff.id, await hashPassword(password)],
    );
    console.log(`\npassword set for ${email}`);
  } finally {
    await db.end();
  }
}

run().catch((err) => {
  console.error(`\nadmin:passwd failed\n  ${err.message}`);
  process.exit(1);
});
