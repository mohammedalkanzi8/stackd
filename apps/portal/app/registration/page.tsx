import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hashPassword, queryOne, transaction } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember, normalisePhone, startSession } from '@/lib/session.ts';

export const metadata = { title: 'Join STACKD Rewards' };
export const dynamic = 'force-dynamic';

const BACK = '/registration';

async function register(formData: FormData): Promise<void> {
  'use server';

  const name = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // Everything the person typed comes back with the error, so a typo in the
  // phone number does not cost them the whole form.
  const keep = new URLSearchParams({ fullName: name, email, phone: rawPhone });
  const fail = (message: string): never => {
    keep.set('error', message);
    redirect(`${BACK}?${keep}`);
  };

  if (name.length < 2) fail('Please enter your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That email address does not look right.');

  const phone = normalisePhone(rawPhone);
  if (!phone) fail(`"${rawPhone}" is not a Saudi mobile number. Try 050 033 8808.`);
  if (password.length < 8) fail('Your password needs at least 8 characters.');

  // Checked up front so the common case gets a sentence about the field it
  // belongs to. It is NOT the guarantee — two people submitting at the same
  // moment both pass this, and the unique indexes on customers.phone and
  // lower(customers.email) are what actually stop the second one. See the catch
  // below, and migration 0006.
  if (await queryOne('select 1 from customers where phone = $1', [phone])) {
    fail('That mobile number is already registered. Sign in instead.');
  }
  if (await queryOne('select 1 from customers where lower(email) = $1', [email])) {
    fail('That email is already registered. Sign in instead.');
  }

  const settings = await queryOne<{ signup_bonus: number }>(
    'select signup_bonus from loyalty_settings',
  );
  const hash = await hashPassword(password);

  // 23505 is unique_violation. It reaches here when two registrations race the
  // check above, and the constraint name says which field lost — so the person
  // still gets "that mobile is already registered" rather than a stack trace.
  // Annotated on the binding, not just the arrow's return type: TypeScript only
  // treats a call as terminating control flow when the callee's `never` is
  // declared on a name it can see, and `id` below is otherwise "used before
  // assigned".
  const onConflict: (err: unknown) => never = (err) => {
    const code = (err as { code?: string } | null)?.code;
    const constraint = String((err as { constraint?: string } | null)?.constraint ?? '');
    if (code !== '23505') throw err;
    if (constraint.includes('email')) return fail('That email is already registered. Sign in instead.');
    return fail('That mobile number is already registered. Sign in instead.');
  };

  let id: string;
  try {
    id = await transaction(async (c) => {
      // auth.users, the customer, the credential and the bonus land together or
      // not at all — a half-made account cannot sign in and cannot be repaired
      // from the outside.
      const { rows } = await c.query(
        'insert into auth.users (phone, email) values ($1, $2) returning id',
        [phone, email],
      );
      const customerId = rows[0].id as string;
      await c.query(
        'insert into customers (id, full_name, phone, email, locale) values ($1, $2, $3, $4, $5)',
        [customerId, name, phone, email, 'en'],
      );
      await c.query(
        'insert into customer_credentials (customer_id, password_hash) values ($1, $2)',
        [customerId, hash],
      );
      if (settings && settings.signup_bonus > 0) {
        await c.query(
          `insert into loyalty_transactions (customer_id, delta, reason, note)
           values ($1, $2, 'signup_bonus', 'Registered online')`,
          [customerId, settings.signup_bonus],
        );
      }
      return customerId;
    });
  } catch (err) {
    // Nothing in the transaction body redirects, so anything caught here is a
    // real database error. onConflict rethrows whatever is not a duplicate.
    onConflict(err);
  }

  await startSession(id);
  redirect('/points?welcome=1');
}

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fullName?: string; email?: string; phone?: string }>;
}) {
  const signedIn = await currentMember();
  if (signedIn) redirect(signedIn.mustChangePassword ? '/password' : '/points');
  const { error, fullName = '', email = '', phone = '' } = await searchParams;

  const settings = await queryOne<{ signup_bonus: number; earn_percent: string }>(
    'select signup_bonus, earn_percent from loyalty_settings',
  );
  const bonus = settings?.signup_bonus ?? 0;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>Join and start earning</h1>
        <p className="lede">
          {bonus > 0
            ? `${bonus} points the moment you sign up, then ${Number(settings?.earn_percent ?? 10)}% of every bill back as points.`
            : `Get ${Number(settings?.earn_percent ?? 10)}% of every bill back as points, then spend them off a later one.`}
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        <div className="card">
          <form action={register} className="stack">
            <div>
              <label htmlFor="fullName">Your name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                autoComplete="name"
                defaultValue={fullName}
              />
            </div>
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={email}
              />
            </div>
            <div>
              <label htmlFor="phone">
                Mobile <span className="hint">050 033 8808</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                defaultValue={phone}
              />
            </div>
            <div>
              <label htmlFor="password">
                Password <span className="hint">at least 8 characters</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Creating your account…">
              Create my account
            </SubmitButton>
          </form>
        </div>

        <p className="muted">
          Already a member? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
