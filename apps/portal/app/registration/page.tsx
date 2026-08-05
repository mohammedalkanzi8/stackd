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
  if (!phone) fail(`"${rawPhone}" is not a Saudi mobile number. Try 054 755 7666.`);
  if (password.length < 8) fail('Your password needs at least 8 characters.');

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

  const id = await transaction(async (c) => {
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

  await startSession(id);
  redirect('/points?welcome=1');
}

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fullName?: string; email?: string; phone?: string }>;
}) {
  if (await currentMember()) redirect('/points');
  const { error, fullName = '', email = '', phone = '' } = await searchParams;

  const settings = await queryOne<{ signup_bonus: number; points_per_riyal: string }>(
    'select signup_bonus, points_per_riyal from loyalty_settings',
  );
  const bonus = settings?.signup_bonus ?? 0;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>Join and start earning</h1>
        <p className="lede">
          {bonus > 0
            ? `${bonus} points the moment you sign up, then ${Number(settings?.points_per_riyal ?? 1)} for every riyal you spend.`
            : `Earn ${Number(settings?.points_per_riyal ?? 1)} point for every riyal you spend, and swap them for food.`}
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
                Mobile <span className="hint">— 054 755 7666</span>
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
                Password <span className="hint">— at least 8 characters</span>
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

        <p className="muted" style={{ marginBlockStart: 18, textAlign: 'center' }}>
          Already a member? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
