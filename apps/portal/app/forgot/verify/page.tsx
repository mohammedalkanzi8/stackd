import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rateLimit, callerIp } from '@stackd/server';

import { SubmitButton } from '../../SubmitButton.tsx';
import { currentMember, startSession } from '@/lib/session.ts';
import { normaliseEmail, RESET, verifyResetCode } from '@/lib/reset.ts';

import { getLang, type Lang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/LangSwitch.tsx';

export const metadata = { title: 'Enter your code · STACKD Rewards' };
export const dynamic = 'force-dynamic';

/* Built per request rather than at module scope: the wording depends on the
   language, and a module-level constant is evaluated once per process. */
function messages(lang: Lang) {
  return {
    invalid: t(lang, 'fg.wrong'),
    expired: t(lang, 'fg.expired'),
    locked: t(lang, 'fg.locked'),
  } as const;
}

async function submit(formData: FormData): Promise<void> {
  'use server';

  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const code = String(formData.get('code') ?? '');
  const back = (m: string) =>
    redirect(`/forgot/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent(m)}`);

  // The five-attempt cap inside verifyResetCode() is per CODE, and a new code
  // resets it. This caps guesses per host regardless of how many codes are
  // issued, which is what actually bounds an automated attack.
  const ip = callerIp(await headers());
  const guard = await rateLimit({ action: 'reset_verify', key: ip, max: 20, windowSecs: 900 });
  if (!guard.allowed) {
    console.warn(`[auth] reset code verification rate-limited ip=${ip}`);
    redirect(`/forgot?error=${encodeURIComponent(messages(await getLang()).locked)}`);
  }


  const result = await verifyResetCode(email, code);
  if (!result.ok) {
    // Expired and cancelled codes are gone from the database, so there is
    // nothing left to retry against — those two go back to the start.
    if (result.reason !== 'invalid') {
      redirect(`/forgot?error=${encodeURIComponent(messages(await getLang())[result.reason])}`);
    }
    back(messages(await getLang()).invalid);
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
  const lang = await getLang();
  if (await currentMember()) redirect('/points');
  const { email = '', error } = await searchParams;

  if (!email) redirect('/forgot');

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>{t(lang, 'fg.checkTitle')}</h1>
        <p className="lede">
          If <b>{email}</b> is on an account, a six-digit code is on its way. It
          works once, for {RESET.TTL_MINUTES} minutes.
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        <div className="card">
          <form action={submit} className="stack">
            <input type="hidden" name="email" value={email} />
            <div>
              <label htmlFor="code">{t(lang, 'fg.codeLabel')}</label>
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
            <SubmitButton className="primary wide" pendingLabel="Checking…">{t(lang, 'a.continue')}</SubmitButton>
          </form>
        </div>

        <p className="muted">
          {t(lang, 'fg.noMail')} <Link href="/forgot">{t(lang, 'fg.sendAnother')}</Link>.
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
