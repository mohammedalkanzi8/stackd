/**
 * Forgotten-password codes.
 *
 * A six-digit code, emailed, good for fifteen minutes and five wrong guesses.
 * Verifying one signs the customer in and marks the credential as needing a new
 * password; the portal then shows nothing else until they set one.
 *
 * ⚠ NOTHING HERE EVER TELLS THE CALLER WHETHER AN EMAIL IS REGISTERED.
 * `issueResetCode` returns the same way for an address that exists and one that
 * does not, and the page prints the same sentence either way. A "no account with
 * that email" message would turn this form into a tool for testing whether a
 * given person is a STACKD member, which is not something a stranger should be
 * able to find out. The cost is that a typo looks like success; the mail that
 * never arrives is the feedback, and the form says so in advance.
 *
 * Codes are stored hashed. See supabase/migrations/0006 for why that matters
 * more than it might appear for something only six digits long.
 */

import { randomInt, randomBytes } from 'node:crypto';
import { hashPassword, queryOne, sendMail, transaction, verifyPassword } from '@stackd/server';

/** How long a code lives. Long enough to find the mail, short enough to matter. */
const TTL_MINUTES = 15;
/** Wrong guesses before the code dies. */
const MAX_ATTEMPTS = 5;
/**
 * Minimum gap between codes for one customer. Without it this form is a way to
 * have STACKD send somebody a hundred emails, and the sender reputation that
 * pays for is ours.
 */
const RESEND_COOLDOWN_SECONDS = 60;

/** Lowercase and trimmed, matching how customers.email is stored. */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

function sixDigits(): string {
  // randomInt, not Math.random: this is a credential. randomInt is also free of
  // the modulo bias a naive `bytes % 1000000` would introduce.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * The reset email itself.
 *
 * Exported so `scripts/mail-test.mjs` sends the identical message rather than a
 * copy of it — a deliverability test against a lookalike proves nothing about
 * the mail customers actually receive.
 *
 * The subject leads with the code, because most phones show enough of a subject
 * line on the lock screen that it never needs opening.
 */
export function resetEmail(
  code: string,
  name: string | null,
): { subject: string; text: string } {
  const hello = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: `${code} is your STACKD Rewards code`,
    text: `${hello}

Your STACKD Rewards code is ${code}

Enter it in the app to set a new password. It works for the next ${TTL_MINUTES} minutes and once only.

If you did not ask to reset your password, you can ignore this — nothing has changed on your account, and whoever typed your address cannot see this code.

STACKD Rewards
`,
  };
}

/**
 * Emails a code, if that address belongs to somebody.
 *
 * Returns nothing in every case. The caller must not branch on the result.
 */
export async function issueResetCode(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  if (!email) return;

  const customer = await queryOne<{ id: string; full_name: string | null }>(
    'select id, full_name from customers where lower(email) = $1',
    [email],
  );
  if (!customer) return;

  // A code issued moments ago is still in their inbox. Sending a second one also
  // invalidates the first, so an impatient double-tap would otherwise break the
  // code the customer is in the middle of typing.
  const recent = await queryOne<{ id: string }>(
    `select customer_id as id from customer_password_resets
      where customer_id = $1
        and created_at > now() - make_interval(secs => $2)`,
    [customer.id, RESEND_COOLDOWN_SECONDS],
  );
  if (recent) return;

  const code = sixDigits();
  const codeHash = await hashPassword(code);

  // One live code per customer: issuing supersedes rather than accumulates.
  await queryOne(
    `insert into customer_password_resets (customer_id, code_hash, expires_at, attempts, created_at)
     values ($1, $2, now() + make_interval(mins => $3), 0, now())
     on conflict (customer_id) do update
        set code_hash = excluded.code_hash,
            expires_at = excluded.expires_at,
            attempts = 0,
            created_at = now()
     returning customer_id`,
    [customer.id, codeHash, TTL_MINUTES],
  );

  await sendMail({ to: email, ...resetEmail(code, customer.full_name) });
}

export type VerifyResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/**
 * Checks a code and, if it is right, signs the account over to the caller.
 *
 * On success the credential is marked `must_change_password` and the code is
 * destroyed. The existing password hash is deliberately left alone: abandoning a
 * reset halfway should not lock somebody out of a password they still remember.
 * A customer who has never had one — signed up at the counter, phone only — gets
 * a row with an unguessable hash, so the only way in stays the code.
 */
export async function verifyResetCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normaliseEmail(rawEmail);
  const code = rawCode.replace(/\D/g, '');

  const row = await queryOne<{
    customer_id: string;
    code_hash: string;
    attempts: number;
    expired: boolean;
  }>(
    `select r.customer_id, r.code_hash, r.attempts, r.expires_at <= now() as expired
       from customer_password_resets r
       join customers c on c.id = r.customer_id
      where lower(c.email) = $1`,
    [email],
  );

  // No code in flight for that address — including the case where the address
  // is not a customer at all. One answer for both.
  if (!row) return { ok: false, reason: 'invalid' };

  if (row.expired) {
    await queryOne('delete from customer_password_resets where customer_id = $1 returning customer_id', [
      row.customer_id,
    ]);
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await queryOne('delete from customer_password_resets where customer_id = $1 returning customer_id', [
      row.customer_id,
    ]);
    return { ok: false, reason: 'locked' };
  }

  const ok = code.length === 6 && (await verifyPassword(code, row.code_hash));

  if (!ok) {
    // Counted in the database, not in memory: the portal runs more than one
    // process and a counter held in one of them is not a limit.
    const after = await queryOne<{ attempts: number }>(
      `update customer_password_resets set attempts = attempts + 1
        where customer_id = $1 returning attempts`,
      [row.customer_id],
    );
    if (after && after.attempts >= MAX_ATTEMPTS) {
      await queryOne(
        'delete from customer_password_resets where customer_id = $1 returning customer_id',
        [row.customer_id],
      );
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'invalid' };
  }

  const unusable = await hashPassword(randomBytes(32).toString('hex'));

  await transaction(async (c) => {
    await c.query(
      `insert into customer_credentials (customer_id, password_hash, must_change_password)
       values ($1, $2, true)
       on conflict (customer_id) do update
          set must_change_password = true`,
      [row.customer_id, unusable],
    );
    await c.query('delete from customer_password_resets where customer_id = $1', [row.customer_id]);
  });

  return { ok: true, customerId: row.customer_id };
}

/** Saves a new password and lifts the block. */
export async function setPassword(customerId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await queryOne(
    `update customer_credentials
        set password_hash = $2, must_change_password = false, updated_at = now()
      where customer_id = $1
      returning customer_id`,
    [customerId, hash],
  );
}

export const RESET = { TTL_MINUTES, MAX_ATTEMPTS } as const;
