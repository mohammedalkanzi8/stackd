import { SubmitButton } from '../SubmitButton.tsx';
import { queryOne, verifyPassword, rateLimit, clearLimit, callerIp } from '@stackd/server';
import { headers } from 'next/headers';
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

  // ⚠ BEFORE THE DATABASE AND BEFORE THE HASH, and the order is the point. Every
  // attempt costs ~64 MB and ~100 ms of scrypt — including failures against
  // accounts that do not exist, because the dummy hash below is verified anyway
  // so the response cannot leak which addresses are real. A limiter placed after
  // that still pays for the attack it exists to stop.
  //
  // Two counters, deliberately. Per-IP stops one host hammering; per-account
  // stops a botnet spread across addresses hammering one mailbox. Either alone
  // is bypassable.
  const ip = callerIp(await headers());
  const byIp = await rateLimit({ action: 'admin_login', key: ip, max: 10, windowSecs: 300 });
  const byAccount = await rateLimit({
    action: 'admin_login_id',
    key: email.toLowerCase(),
    max: 5,
    windowSecs: 900,
  });
  if (!byIp.allowed || !byAccount.allowed) {
    // ⚠ Logged, because until now a brute-force attempt left no trace anywhere.
    console.warn(
      `[auth] admin login rate-limited ip=${ip} account=${email.toLowerCase()} ` +
        `retry_after=${Math.max(byIp.retryAfter, byAccount.retryAfter)}s`,
    );
    redirect('/login?error=slow');
  }

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

  if (!row || !ok) {
    // The only record that an attempt failed at all. Deliberately does not print
    // the password or say whether the account exists.
    console.warn(`[auth] admin login failed ip=${ip} account=${email.toLowerCase()}`);
    redirect('/login?error=1');
  }

  // A correct password clears the account's budget, so a staff member who
  // fat-fingers it four times is not locked out for the rest of their shift.
  // The per-IP counter is left alone: a shared address that has just produced
  // nine failures and one success is still worth slowing down.
  await clearLimit('admin_login_id', email.toLowerCase());
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

        {error ? (
          <div className="banner bad">
            {t(lang, error === 'slow' ? 'login.slow' : 'login.failed')}
          </div>
        ) : null}

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
