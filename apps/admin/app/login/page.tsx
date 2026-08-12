import { SubmitButton } from '../SubmitButton.tsx';
import { queryOne, verifyPassword } from '@stackd/server';
import { redirect } from 'next/navigation';

import { currentStaff, startSession } from '@/lib/session.ts';
import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/(portal)/Prefs.tsx';

export const metadata = { title: 'Sign in · STACKD admin' };

interface Credential {
  id: string;
  password_hash: string;
}

async function signIn(formData: FormData): Promise<void> {
  'use server';

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const row = await queryOne<Credential>(
    `select s.id, c.password_hash
       from staff s
       join auth.users u on u.id = s.id
       join staff_credentials c on c.staff_id = s.id
      where lower(u.email) = lower($1) and s.is_active`,
    [email],
  );

  // One message for "no such account" and for "wrong password", and the hash is
  // verified even when the account is missing. Otherwise the response time and
  // the wording between the two cases tell an attacker which emails are real.
  const DUMMY =
    'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY);

  if (!row || !ok) redirect('/login?error=1');

  await startSession(row.id);
  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentStaff()) redirect('/');
  const [{ error }, lang] = await Promise.all([searchParams, getLang()]);

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* The brand mark is not translated. It is a wordmark. */}
        <p className="eyebrow">STACKD</p>
        <h1>{t(lang, 'login.title')}</h1>
        <p className="lede">{t(lang, 'login.lede')}</p>

        {error ? <div className="banner bad">{t(lang, 'login.failed')}</div> : null}

        <div className="card">
          <form action={signIn} className="stack">
            <div>
              <label htmlFor="email">{t(lang, 'login.email')}</label>
              {/* dir=ltr on the field itself: an email address is left-to-right
                  even on an Arabic page, and without this the caret starts on
                  the wrong side and the @ lands in the wrong place visually. */}
              <input
                id="email"
                name="email"
                type="email"
                dir="ltr"
                required
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="password">{t(lang, 'login.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                dir="ltr"
                required
                autoComplete="current-password"
              />
            </div>
            <SubmitButton className="primary" pendingLabel={`${t(lang, 'login.pending')}…`}>
              {t(lang, 'login.submit')}
            </SubmitButton>
          </form>
        </div>

        {/* Sign-in is the one screen reachable before the portal chrome exists,
            so the language switch has to live here too — otherwise a cashier
            handed an English login has no way to reach Arabic. */}
        <div className="login-prefs">
          <LangSwitch lang={lang} />
        </div>

        {process.env.NODE_ENV !== 'production' ? (
          <p className="muted" style={{ fontSize: 13, marginBlockStart: 16 }}>
            Local fixtures: <code>owner@stackd.local</code>,{' '}
            <code>cashier@stackd.local</code>, <code>kitchen@stackd.local</code>,
            password <code>stackd-dev</code>. Only the owner can edit rewards and
            the menu. Set a real password with{' '}
            <code>npm run admin:passwd -- &lt;email&gt;</code>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
