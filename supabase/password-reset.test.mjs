/**
 * Tests the forgotten-password flow added in migration 0006.
 *
 * Like schema.test.mjs these run against the local database built by
 * `npm run db:reset`, and they FAIL rather than skip when it is unreachable —
 * a security test that quietly passes because nothing ran is worse than no test.
 * Set STACKD_SKIP_DB_TESTS=1 to opt out explicitly.
 *
 * The code itself is never returned by any function here, on purpose: it only
 * exists in the email. So these tests read it the way a customer does, by
 * intercepting what the mailer writes — which also proves the mail is actually
 * sent and carries a code somebody could type.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

import { connectionFor, DB_NAME } from '../scripts/db-reset.mjs';
import {
  issueResetCode,
  verifyResetCode,
  setPassword,
  RESET,
} from '../apps/portal/lib/reset.ts';
import { hashPassword, verifyPassword } from '../packages/server/src/password.ts';

const EMAIL = 'reset-test@stackd.invalid';
const PHONE = '+966500000199';

let db;

/**
 * Runs `fn` and returns whatever six-digit code the mailer printed.
 *
 * With no SMTP_URL configured, sendMail writes the whole message to stderr —
 * see packages/server/src/mail.ts. Capturing that is how the test learns the
 * code, and it doubles as an assertion that a mail was produced at all.
 */
async function codeFrom(fn) {
  const original = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk, ...rest) => {
    captured += String(chunk);
    return original(chunk, ...rest);
  };
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  const match = captured.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

async function freshCustomer() {
  await db.query('delete from auth.users where email = $1 or phone = $2', [EMAIL, PHONE]);
  const { rows } = await db.query(
    'insert into auth.users (phone, email) values ($1, $2) returning id',
    [PHONE, EMAIL],
  );
  const id = rows[0].id;
  await db.query(
    'insert into customers (id, full_name, phone, email, locale) values ($1, $2, $3, $4, $5)',
    [id, 'Reset Tester', PHONE, EMAIL, 'en'],
  );
  return id;
}

before(async () => {
  if (process.env.STACKD_SKIP_DB_TESTS === '1') return;
  // The library under test reads this to pick its database.
  process.env.STACKD_DB ??= DB_NAME;
  db = new pg.Client(connectionFor(DB_NAME));
  await db.connect();
});

after(async () => {
  if (!db) return;
  await db.query('delete from auth.users where email = $1 or phone = $2', [EMAIL, PHONE]);
  await db.end();
});

describe('the unique email index', () => {
  test('refuses a second account on the same address, whatever the case', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    await freshCustomer();

    const { rows } = await db.query(
      'insert into auth.users (phone) values ($1) returning id',
      ['+966500000198'],
    );
    await assert.rejects(
      () =>
        db.query('insert into customers (id, full_name, phone, email) values ($1, $2, $3, $4)', [
          rows[0].id,
          'Impostor',
          '+966500000198',
          EMAIL.toUpperCase(),
        ]),
      (err) => err.code === '23505',
      'a duplicate email differing only in case must be rejected by the database, ' +
        'not merely by the form that usually checks first',
    );
    await db.query('delete from auth.users where id = $1', [rows[0].id]);
  });
});

describe('issuing a code', () => {
  test('says nothing and writes nothing for an address nobody owns', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');

    // Counted before and after rather than asserted to be zero outright: a
    // developer database can legitimately have somebody else's reset in flight,
    // and a test that only passes on an empty table fails for the wrong reason.
    const count = async () =>
      (await db.query('select count(*)::int as n from customer_password_resets')).rows[0].n;

    const before = await count();
    const code = await codeFrom(() => issueResetCode('nobody-at-all@stackd.invalid'));
    assert.equal(code, null, 'no mail may be sent for an unregistered address');
    assert.equal(await count(), before, 'and no reset row may be created either');
  });

  test('emails a six-digit code and stores only its hash', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();

    const code = await codeFrom(() => issueResetCode(EMAIL));
    assert.match(code ?? '', /^\d{6}$/, 'the mail must carry a six-digit code');

    const { rows } = await db.query(
      'select code_hash, attempts from customer_password_resets where customer_id = $1',
      [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].attempts, 0);
    assert.ok(
      !rows[0].code_hash.includes(code),
      'the stored value must not contain the code itself',
    );
    assert.ok(rows[0].code_hash.startsWith('scrypt$'), 'it must be a scrypt hash');
    assert.ok(await verifyPassword(code, rows[0].code_hash), 'and it must verify against the code');
  });

  test('will not send a second code inside the cooldown', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();

    const first = await codeFrom(() => issueResetCode(EMAIL));
    const second = await codeFrom(() => issueResetCode(EMAIL));

    assert.equal(second, null, 'an immediate second request must not send anything');
    const { rows } = await db.query(
      'select code_hash from customer_password_resets where customer_id = $1',
      [id],
    );
    assert.ok(
      await verifyPassword(first, rows[0].code_hash),
      'and must leave the first code working — otherwise a double tap breaks ' +
        'the code the customer is already typing',
    );
  });
});

describe('verifying a code', () => {
  test('rejects a wrong code, counts the attempt, and does not sign anyone in', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    const code = await codeFrom(() => issueResetCode(EMAIL));
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');

    const result = await verifyResetCode(EMAIL, wrong);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid');

    const { rows } = await db.query(
      'select attempts from customer_password_resets where customer_id = $1',
      [id],
    );
    assert.equal(rows[0].attempts, 1, 'the wrong guess must be counted in the database');

    const cred = await db.query(
      'select 1 from customer_credentials where customer_id = $1 and must_change_password',
      [id],
    );
    assert.equal(cred.rows.length, 0, 'a wrong code must not mark the account as reset');
  });

  test('destroys the code after too many wrong guesses', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    const code = await codeFrom(() => issueResetCode(EMAIL));
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');

    let last;
    for (let i = 0; i < RESET.MAX_ATTEMPTS; i += 1) last = await verifyResetCode(EMAIL, wrong);

    assert.equal(last.ok, false);
    assert.equal(last.reason, 'locked', 'the cap must report itself, not just keep failing');

    const { rows } = await db.query(
      'select 1 from customer_password_resets where customer_id = $1',
      [id],
    );
    assert.equal(rows.length, 0, 'and the code must be gone, so the right one no longer works');

    const after = await verifyResetCode(EMAIL, code);
    assert.equal(after.ok, false, 'even the correct code must fail once the cap is hit');
  });

  test('rejects an expired code', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    const code = await codeFrom(() => issueResetCode(EMAIL));

    await db.query(
      "update customer_password_resets set expires_at = now() - interval '1 second' where customer_id = $1",
      [id],
    );

    const result = await verifyResetCode(EMAIL, code);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'expired');
  });

  test('accepts the right code once, and only once', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    const code = await codeFrom(() => issueResetCode(EMAIL));

    const first = await verifyResetCode(EMAIL, code);
    assert.equal(first.ok, true);
    assert.equal(first.customerId, id);

    const cred = await db.query(
      'select must_change_password from customer_credentials where customer_id = $1',
      [id],
    );
    assert.equal(cred.rows.length, 1, 'a counter signup with no credential row must get one');
    assert.equal(cred.rows[0].must_change_password, true);

    const gone = await db.query('select 1 from customer_password_resets where customer_id = $1', [
      id,
    ]);
    assert.equal(gone.rows.length, 0, 'the code must be consumed');

    const again = await verifyResetCode(EMAIL, code);
    assert.equal(again.ok, false, 'replaying the same code must fail');
  });
});

describe('setting the new password', () => {
  test('saves it and lifts the block', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    const code = await codeFrom(() => issueResetCode(EMAIL));
    await verifyResetCode(EMAIL, code);

    await setPassword(id, 'a-brand-new-password');

    const { rows } = await db.query(
      'select password_hash, must_change_password from customer_credentials where customer_id = $1',
      [id],
    );
    assert.equal(rows[0].must_change_password, false, 'the portal must stop forcing the screen');
    assert.ok(
      await verifyPassword('a-brand-new-password', rows[0].password_hash),
      'and the new password must actually sign them in',
    );
  });

  test('leaves an existing password working until a new one is chosen', async (t) => {
    if (process.env.STACKD_SKIP_DB_TESTS === '1') return t.skip('STACKD_SKIP_DB_TESTS=1');
    const id = await freshCustomer();
    // Seeded the way registration would, since setPassword only ever updates.
    await db.query('insert into customer_credentials (customer_id, password_hash) values ($1, $2)', [
      id,
      await hashPassword('the-original-password'),
    ]);

    const code = await codeFrom(() => issueResetCode(EMAIL));
    await verifyResetCode(EMAIL, code);

    const { rows } = await db.query(
      'select password_hash from customer_credentials where customer_id = $1',
      [id],
    );
    assert.ok(
      await verifyPassword('the-original-password', rows[0].password_hash),
      'abandoning a reset halfway must not lock somebody out of a password they still know',
    );
  });
});
