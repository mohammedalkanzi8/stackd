import Link from 'next/link';
import { redirect } from 'next/navigation';
import { queryOne, verifyPassword } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember, normalisePhone, startSession } from '@/lib/session.ts';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/LangSwitch.tsx';

export const metadata = { title: 'Sign in · STACKD Rewards' };
export const dynamic = 'force-dynamic';

/** A hash nothing matches, verified when the account is missing. */
const DUMMY =
  'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function signIn(formData: FormData): Promise<void> {
  'use server';

  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // {t(lang, 'login.id')}, whichever they remember. A number typed any way normalises
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
  const lang = await getLang();
  // A signed-in visitor mid-reset goes to /password, not /points, or the
  // forced screen could be skipped by visiting /login and being bounced past it.
  const signedIn = await currentMember();
  if (signedIn) redirect(signedIn.mustChangePassword ? '/password' : '/points');
  const { error, id = '', from } = await searchParams;

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>
        <h1>{t(lang, 'login.title')}</h1>
        <p className="lede">{t(lang, 'login.lede')}</p>

        {from === 'claim' ? (
          <div className="banner ok">
            {t(lang, 'login.receiptWaiting')}
          </div>
        ) : null}
        {error ? (
          <div className="banner bad">
            {t(lang, 'login.failed')}
          </div>
        ) : null}

        <div className="card">
          <form action={signIn} className="stack">
            <div>
              <label htmlFor="identifier">{t(lang, 'login.id')}</label>
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
              <label htmlFor="password">{t(lang, 'w.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <SubmitButton className="primary wide" pendingLabel="Signing you in…">{t(lang, 'a.signIn')}</SubmitButton>
          </form>
        </div>

        <p className="muted">
          <Link href="/forgot">{t(lang, 'login.forgot')}</Link>
        </p>
        <p className="muted">
          {t(lang, 'login.notMember')} <Link href="/registration">{t(lang, 'login.join')}</Link>
        </p>
      </div>
    </div>
  );
}
