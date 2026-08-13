import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hashPassword, queryOne, transaction } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { currentMember, normalisePhone, startSession } from '@/lib/session.ts';

import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/LangSwitch.tsx';

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
  // An unchecked checkbox submits NOTHING at all — it is absent from the form
  // data rather than present and false — so this reads presence, never a value.
  const wantsMail = formData.get('marketingOptIn') !== null;

  // Everything the person typed comes back with the error, so a typo in the
  // phone number does not cost them the whole form.
  const keep = new URLSearchParams({ fullName: name, email, phone: rawPhone });
  const fail = (message: string): never => {
    keep.set('error', message);
    redirect(`${BACK}?${keep}`);
  };

  if (name.length < 2) fail(t(await getLang(), 'reg.errName'));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(t(await getLang(), 'reg.errEmail'));

  const phone = normalisePhone(rawPhone);
  if (!phone) fail(tf(await getLang(), 'reg.badPhone', { n: rawPhone }));
  if (password.length < 8) fail(t(await getLang(), 'reg.errPw'));

  // Checked up front so the common case gets a sentence about the field it
  // belongs to. It is NOT the guarantee — two people submitting at the same
  // moment both pass this, and the unique indexes on customers.phone and
  // lower(customers.email) are what actually stop the second one. See the catch
  // below, and migration 0006.
  if (await queryOne('select 1 from customers where phone = $1', [phone])) {
    fail(t(await getLang(), 'reg.dupPhone'));
  }
  if (await queryOne('select 1 from customers where lower(email) = $1', [email])) {
    fail(t(await getLang(), 'reg.dupEmail'));
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
  // Resolved before the callback because `onConflict` is synchronous — it is
  // passed to a .catch() and cannot await.
  const lg = await getLang();
  const onConflict: (err: unknown) => never = (err) => {
    const code = (err as { code?: string } | null)?.code;
    const constraint = String((err as { constraint?: string } | null)?.constraint ?? '');
    if (code !== '23505') throw err;
    if (constraint.includes('email')) return fail(t(lg, 'reg.dupEmail'));
    return fail(t(lg, 'reg.dupPhone'));
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
      // ⚠ THE LANGUAGE THEY REGISTERED IN, not a hard-coded 'en'. This row
      // decides which language their promotional mail is written in and how the
      // portal greets them, and it was pinned to English for every customer no
      // matter which side of the toggle they used to sign up.
      //
      // ⚠ marketing_opt_in was ALSO never written here. It has existed since the
      // first schema, defaulting to false, so every customer was opted out and a
      // promotion would have reached nobody. The column was never the missing
      // piece — nobody had been asked.
      await c.query(
        `insert into customers (id, full_name, phone, email, locale, marketing_opt_in)
         values ($1, $2, $3, $4, $5, $6)`,
        [customerId, name, phone, email, lg, wantsMail],
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
  const lang = await getLang();
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
        <h1>{t(lang, 'reg.lede')}</h1>
        <p className="lede">
          {bonus > 0
            ? tf(lang, 'reg.leadBonus', { n: bonus, pct: Number(settings?.earn_percent ?? 10) })
            : tf(lang, 'reg.leadNoBonus', { pct: Number(settings?.earn_percent ?? 10) })}
        </p>

        {error ? <div className="banner bad">{error}</div> : null}

        <div className="card">
          <form action={register} className="stack">
            <div>
              <label htmlFor="fullName">{t(lang, 'reg.name')}</label>
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
              <label htmlFor="email">{t(lang, 'w.email')}</label>
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
              <label htmlFor="phone">{t(lang, 'reg.mobile')}
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
              <label htmlFor="password">{t(lang, 'w.password')} <span className="hint">{t(lang, 'w.min8')}</span>
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
            {/* ⚠ VISIBLE AND WORDED PLAINLY, not buried in the terms. It ships
                ticked, which is ordinary practice for marketing to a shop's own
                customers and is why the list is not empty on day one — but it
                is a consent decision, not a technical one. Removing
                `defaultChecked` here and on the counter signup is the whole
                change if the owner wants explicit opt-in instead.

                Every promotional mail carries a one-click unsubscribe, which is
                what makes a pre-ticked box defensible rather than sharp. */}
            <label className="check">
              <input type="checkbox" name="marketingOptIn" defaultChecked />
              <span>{t(lang, 'reg.marketing')}</span>
            </label>
            <SubmitButton className="primary wide" pendingLabel="Creating your account…">
              {t(lang, 'reg.create')}
            </SubmitButton>
          </form>
        </div>

        <p className="muted">
          {t(lang, 'reg.already')} <Link href="/login">{t(lang, 'a.signIn')}</Link>
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
