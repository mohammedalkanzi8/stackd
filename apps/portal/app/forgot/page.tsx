import Link from 'next/link';
import { redirect } from 'next/navigation';
import { assertMailConfigured, mailConfigured, rateLimit, callerIp } from '@stackd/server';
import { headers } from 'next/headers';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember } from '@/lib/session.ts';
import { issueResetCode, normaliseEmail, RESET } from '@/lib/reset.ts';

import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/LangSwitch.tsx';

export const metadata = { title: 'Forgotten password · STACKD Rewards' };
export const dynamic = 'force-dynamic';

async function request(formData: FormData): Promise<void> {
  'use server';

  const email = normaliseEmail(String(formData.get('email') ?? ''));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/forgot?error=${encodeURIComponent(t(await getLang(), 'fg.badEmail'))}`);
  }

  // Checked before the code is created rather than after, so a deployment with
  // no mailbox configured fails while the customer is still on this form and can
  // be told the truth — instead of sending them to wait for a mail that was
  // never going to arrive.
  assertMailConfigured();

  // ⚠ Two limits, closing two different holes.
  //
  // Per-IP caps how many DIFFERENT addresses can be probed from one host — the
  // 60-second per-customer cooldown inside issueResetCode() does nothing against
  // an attacker walking a list of addresses, and each request sends real mail
  // from our domain, so the sender reputation being spent is ours.
  //
  // Per-address caps ISSUANCES, which is the gap the review found: each new code
  // resets the five-guess counter, so an attacker who could resend freely got
  // five fresh guesses a minute against a six-digit code, forever.
  const ip = callerIp(await headers());
  const byIp = await rateLimit({ action: 'reset_ip', key: ip, max: 5, windowSecs: 900 });
  const byEmail = await rateLimit({ action: 'reset_email', key: email, max: 5, windowSecs: 3600 });
  if (!byIp.allowed || !byEmail.allowed) {
    console.warn(`[auth] password reset rate-limited ip=${ip}`);
    // ⚠ The SAME destination as success. Saying "too many requests" for a real
    // address and "sent" for an unknown one would hand back exactly the
    // enumeration oracle this flow is built to deny.
    redirect(`/forgot/verify?email=${encodeURIComponent(email)}`);
  }

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
  const lang = await getLang();
  if (await currentMember()) redirect('/points');
  const { error, email = '' } = await searchParams;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>{t(lang, 'fg.title')}</h1>
        <p className="lede">
          {t(lang, 'fg.lede')}
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
              <label htmlFor="email">{t(lang, 'w.email')}</label>
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
              {t(lang, 'fg.send')}
            </SubmitButton>
          </form>
        </div>

        {/* Said here, before they wait, rather than as an error afterwards: this
            form deliberately cannot tell them whether the address is registered,
            so silence is the only signal a typo ever produces. */}
        <p className="muted">
          {tf(lang, 'fg.codeLasts', { n: RESET.TTL_MINUTES })}
        </p>
        <p className="muted">
          {t(lang, 'fg.remembered')} <Link href="/login">{t(lang, 'a.signIn')}</Link>
        </p>

        {/* Reachable before the portal chrome exists, and Arabic is the
            default — without this a customer handed an Arabic screen has no
            route to English. */}
        <div className="login-prefs">
          <LangSwitch lang={lang} />
        </div>
      </div>
    </div>
  );
}
