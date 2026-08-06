import Link from 'next/link';
import { redirect } from 'next/navigation';
import { queryOne, verifyPassword } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember, normalisePhone, startSession } from '@/lib/session.ts';

export const metadata = { title: 'Sign in · STACKD Rewards' };
export const dynamic = 'force-dynamic';

/** A hash nothing matches, verified when the account is missing. */
const DUMMY =
  'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function signIn(formData: FormData): Promise<void> {
  'use server';

  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // Mobile or email, whichever they remember. A number typed any way normalises
  // first so 0500338808 and +966500338808 find the same account.
  const phone = normalisePhone(identifier);
  const row = await queryOne<{ id: string; password_hash: string }>(
    `select c.id, cc.password_hash
       from customers c
       join customer_credentials cc on cc.customer_id = c.id
      where ($2::text is not null and c.phone = $2)
         or lower(c.email) = lower($1)`,
    [identifier, phone],
  );

  // The hash is verified even when no account matched, so neither the wording
  // nor the response time reveals which phone numbers are registered.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY);
  if (!row || !ok) {
    redirect(`/login?error=1&id=${encodeURIComponent(identifier)}`);
  }

  await startSession(row.id);
  redirect('/points');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; id?: string; from?: string }>;
}) {
  if (await currentMember()) redirect('/points');
  const { error, id = '', from } = await searchParams;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>Sign in</h1>
        <p className="lede">Your points, and what you can swap them for.</p>

        {from === 'claim' ? (
          <div className="banner ok">
            Sign in and the points from your receipt will be waiting.
          </div>
        ) : null}
        {error ? (
          <div className="banner bad">
            That mobile number or email and password do not match an account.
          </div>
        ) : null}

        <div className="card">
          <form action={signIn} className="stack">
            <div>
              <label htmlFor="identifier">Mobile or email</label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                autoFocus
                autoComplete="username"
                inputMode="email"
                defaultValue={id}
              />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Signing you in…">
              Sign in
            </SubmitButton>
          </form>
        </div>

        <p className="muted" style={{ marginBlockStart: 18, textAlign: 'center' }}>
          Not a member yet? <Link href="/registration">Join in a minute</Link>
        </p>
      </div>
    </div>
  );
}
