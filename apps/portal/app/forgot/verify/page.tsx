import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SubmitButton } from '../../SubmitButton.tsx';
import { currentMember, startSession } from '@/lib/session.ts';
import { normaliseEmail, RESET, verifyResetCode } from '@/lib/reset.ts';

export const metadata = { title: 'Enter your code · STACKD Rewards' };
export const dynamic = 'force-dynamic';

const MESSAGE = {
  invalid: 'That code is not right. Check the email and try again.',
  expired: `That code has expired. Codes last ${RESET.TTL_MINUTES} minutes — ask for a new one.`,
  locked: 'Too many wrong tries, so that code has been cancelled. Ask for a new one.',
} as const;

async function submit(formData: FormData): Promise<void> {
  'use server';

  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const code = String(formData.get('code') ?? '');
  const back = (m: string) =>
    redirect(`/forgot/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent(m)}`);

  const result = await verifyResetCode(email, code);
  if (!result.ok) {
    // Expired and cancelled codes are gone from the database, so there is
    // nothing left to retry against — those two go back to the start.
    if (result.reason !== 'invalid') {
      redirect(`/forgot?error=${encodeURIComponent(MESSAGE[result.reason])}`);
    }
    back(MESSAGE.invalid);
  }

  // Signed in, but `must_change_password` is set, so requireMember() on every
  // other page bounces them to /password until they choose one.
  await startSession((result as { ok: true; customerId: string }).customerId);
  redirect('/password');
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  if (await currentMember()) redirect('/points');
  const { email = '', error } = await searchParams;

  if (!email) redirect('/forgot');

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>Check your email</h1>
        <p className="lede">
          If <b>{email}</b> is on an account, a six-digit code is on its way. It
          works once, for {RESET.TTL_MINUTES} minutes.
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        <div className="card">
          <form action={submit} className="stack">
            <input type="hidden" name="email" value={email} />
            <div>
              <label htmlFor="code">Your code</label>
              <input
                id="code"
                name="code"
                // `text` with a numeric inputMode, not `number`: a number field
                // strips a leading zero, and a third of these codes start with
                // one. autoComplete lets iOS and Android offer the code straight
                // from the notification.
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                className="mono code-input"
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Checking…">
              Continue
            </SubmitButton>
          </form>
        </div>

        <p className="muted">
          No mail? Check spam, or <Link href="/forgot">send another code</Link>.
        </p>
      </div>
    </div>
  );
}
