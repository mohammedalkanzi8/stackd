import Link from 'next/link';
import { redirect } from 'next/navigation';
import { assertMailConfigured, mailConfigured } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember } from '@/lib/session.ts';
import { issueResetCode, normaliseEmail, RESET } from '@/lib/reset.ts';

export const metadata = { title: 'Forgotten password · STACKD Rewards' };
export const dynamic = 'force-dynamic';

async function request(formData: FormData): Promise<void> {
  'use server';

  const email = normaliseEmail(String(formData.get('email') ?? ''));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/forgot?error=${encodeURIComponent('That email address does not look right.')}`);
  }

  // Checked before the code is created rather than after, so a deployment with
  // no mailbox configured fails while the customer is still on this form and can
  // be told the truth — instead of sending them to wait for a mail that was
  // never going to arrive.
  assertMailConfigured();

  // Returns the same way whether or not that address belongs to anybody. See
  // lib/reset.ts for why the page must not learn the difference.
  await issueResetCode(email);

  redirect(`/forgot/verify?email=${encodeURIComponent(email)}`);
}

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  if (await currentMember()) redirect('/points');
  const { error, email = '' } = await searchParams;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>Forgotten your password?</h1>
        <p className="lede">
          Type the email address on your account and we will send you a code to
          get back in.
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        {/* Development only. Without a mailbox configured the code is written to
            the server log instead of sent, and somebody testing the flow needs
            to know that before they sit waiting for an email. In production
            `assertMailConfigured()` throws instead of letting this happen. */}
        {!mailConfigured() && process.env.NODE_ENV !== 'production' ? (
          <div className="banner bad">
            No <code>SMTP_URL</code> is set, so the code will be printed to the
            server log rather than emailed.
          </div>
        ) : null}

        <div className="card">
          <form action={request} className="stack">
            <div>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                defaultValue={email}
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Sending your code…">
              Email me a code
            </SubmitButton>
          </form>
        </div>

        {/* Said here, before they wait, rather than as an error afterwards: this
            form deliberately cannot tell them whether the address is registered,
            so silence is the only signal a typo ever produces. */}
        <p className="muted">
          The code lasts {RESET.TTL_MINUTES} minutes. If no mail arrives, that
          address is not on an account — try another, or{' '}
          <Link href="/registration">join</Link>.
        </p>
        <p className="muted">
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
