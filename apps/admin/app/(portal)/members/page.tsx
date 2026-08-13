import Link from 'next/link';

import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';
import { redirect } from 'next/navigation';

import { query, queryOne, transaction } from '@stackd/server';

import { requireStaff } from '@/lib/auth.ts';

export const metadata = { title: 'Members · STACKD admin' };
export const dynamic = 'force-dynamic';

/**
 * Signs somebody up at the counter.
 *
 * Phone-first, because that is how KSA customers expect to be identified and it
 * is what the app's OTP login will key on later. Email is optional and rarely
 * given.
 *
 * Any staff member can do this — it is the whole point of a counter signup, and
 * a cashier not being able to enrol the person in front of them would make the
 * programme useless at the moment it matters.
 */
async function addMember(formData: FormData): Promise<void> {
  'use server';
  await requireStaff();

  const name = String(formData.get('fullName') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const locale = String(formData.get('locale') ?? 'ar');
  // An unchecked checkbox is absent from the form data, never present-and-false.
  const wantsMail = formData.get('marketingOptIn') !== null;
  // Optional, and usually skipped at a busy counter — but it is the only thing
  // that lets this person ever sign in to the customer portal, because the
  // forgotten-password code is the only way in for an account created here and
  // there is nowhere to send it otherwise. It can be added later on the member's
  // own page.
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  const fail = (m: string) => redirect(`/members?error=${encodeURIComponent(m)}`);

  if (!name) fail(t(await getLang(), 'err.name'));
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail(`"${email}" is not an email address. Leave it blank if they would rather not say.`);
  }

  // Accept 0500338808, 500338808, +966500338808, or with spaces. Stored as E.164.
  const digits = rawPhone.replace(/[^0-9]/g, '');
  let phone: string;
  if (/^9665\d{8}$/.test(digits)) phone = `+${digits}`;
  else if (/^05\d{8}$/.test(digits)) phone = `+966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) phone = `+966${digits}`;
  else fail(tf(await getLang(), 'err.badPhone', { n: rawPhone }));

  if (!['ar', 'en'].includes(locale)) fail(t(await getLang(), 'err.lang'));

  if (await queryOne('select 1 from customers where phone = $1', [phone!])) {
    fail(`${phone!} is already a member.`);
  }
  if (email && (await queryOne('select 1 from customers where lower(email) = $1', [email]))) {
    fail(`${email} is already on another member's account.`);
  }

  const settings = await queryOne<{ signup_bonus: number }>(
    'select signup_bonus from loyalty_settings',
  );

  // Resolved out here rather than inside the transaction: it is the note that
  // goes on the ledger row, and it is ordinary data. Note that this freezes the
  // enrolling cashier's UI language into a permanent record, so a ledger worked
  // by both an Arabic and an English till will read in both. That is the
  // existing intent and is left as it is, but it is the reason to prefer a
  // reason code over prose if these notes are ever reported on.
  const signupNote = t(await getLang(), 'err.signedCounter');

  const code = await transaction(async (c) => {
    // The customer row hangs off auth.users, so both go in together.
    const { rows } = await c.query(
      'insert into auth.users (phone, email) values ($1, $2) returning id',
      [phone!, email || null],
    );
    const id = rows[0].id;
    const created = await c.query(
      `insert into customers (id, full_name, phone, email, locale, marketing_opt_in)
       values ($1, $2, $3, $4, $5, $6) returning member_code`,
      // Empty becomes NULL, never '': the unique index on lower(email) exempts
      // NULLs, so a table of empty strings would all collide with each other.
      [id, name, phone!, email || null, locale, wantsMail],
    );
    if (settings && settings.signup_bonus > 0) {
      // ⚠ THE NOTE IS A BOUND PARAMETER, NOT SQL. It was previously written as
      // `t(await getLang(), 'err.signedCounter')` INSIDE the string, where
      // nothing interpolates it — Postgres received those characters as SQL and
      // raised 42601 "syntax error at or near getLang". Because signup_bonus is
      // 100 in production this branch runs on EVERY counter signup, so enrolling
      // anyone at the till failed outright. The transaction meant it rolled back
      // cleanly rather than half-creating a customer, which is why it left no
      // wreckage to notice.
      await c.query(
        `insert into loyalty_transactions (customer_id, delta, reason, note)
         values ($1, $2, 'signup_bonus', $3)`,
        [id, settings.signup_bonus, signupNote],
      );
    }
    return created.rows[0].member_code as string;
  });

  redirect(
    `/members?q=${code}&ok=${encodeURIComponent(
      `${name} is member ${code}${
        settings && settings.signup_bonus > 0 ? ` with ${settings.signup_bonus} bonus points` : ''
      }.`,
    )}`,
  );
}

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string | null;
  phone: string | null;
  locale: string;
  balance: number;
  lifetime_earned: number;
  created_at: Date;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  // ⚠ THE LAYOUT'S requireStaff() DOES NOT PROTECT THIS PAGE. A Next layout
  // renders concurrently with its page, so the layout's redirect does not stop
  // this component running. Verified against production: an anonymous request
  // with `RSC: 1` returned HTTP 200 and a flight payload containing a real
  // customer's name, member code and mobile number.
  //
  // The requireStaff() further up this file guards the addMember ACTION only.
  // An action guard and a page guard are different things, and a file-level
  // grep for the symbol cannot tell them apart — which is exactly why this one
  // survived the first sweep that fixed / and /orders.
  await requireStaff();

  const lang = await getLang();
  const { q = '', ok, error } = await searchParams;
  const term = q.trim();

  // Matches a scanned member code, a phone number however it was typed, or a
  // name. Phone comparison strips punctuation on both sides so "0500338808",
  // "050 033 8808" and "+966500338808" all find the same person.
  const members = await query<MemberRow>(
    `select c.id, c.member_code, c.full_name, c.phone, c.locale, c.created_at,
            coalesce(b.balance, 0) as balance,
            coalesce(b.lifetime_earned, 0) as lifetime_earned
       from customers c
       left join loyalty_balances b on b.customer_id = c.id
      where $1 = ''
         or upper(c.member_code) = upper($1)
         or c.full_name ilike '%' || $1 || '%'
         or (
              -- Only treat the term as a phone number when it actually has
              -- digits, or an empty needle matches every row via LIKE '%%'.
              regexp_replace($1, '[^0-9]', '', 'g') <> ''
              and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
                  like '%' || regexp_replace($1, '[^0-9]', '', 'g') || '%'
            )
      order by coalesce(b.balance, 0) desc, c.created_at desc
      limit 50`,
    [term],
  );

  return (
    <>
      <p className="eyebrow">{t(lang, 'mem.title')}</p>
      <h1>{t(lang, 'mem.heading')}</h1>
      <p className="lede">{t(lang, 'mem.lede')}</p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <form className="card row">
        <div className="field">
          <label htmlFor="q">
            {t(lang, 'mem.searchLabel')}{' '}
            <span className="hint">{t(lang, 'mem.searchHint')}</span>
          </label>
          <input dir="ltr" id="q" name="q" type="text" defaultValue={term} autoFocus placeholder="DEV22222" />
        </div>
        <button type="submit" className="primary">
          {t(lang, 'a.search')}
        </button>
        {term ? (
          <Link href="/members" className="btn">
            {t(lang, 'mem.clear')}
          </Link>
        ) : null}
      </form>

      <div className="card">
        {members.length === 0 ? (
          <p className="empty">
            {term ? (
              <>
                {t(lang, 'mem.noMatchA')} <b>{term}</b>. {t(lang, 'mem.noMatchB')}
              </>
            ) : (
              t(lang, 'mem.none')
            )}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'ord.member')}</th>
                  <th>{t(lang, 'mem.code')}</th>
                  <th>{t(lang, 'w.phone')}</th>
                  <th className="right">{t(lang, 'w.balance')}</th>
                  <th className="right">{t(lang, 'mem.lifetimeCol')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/members/${m.id}`}>{m.full_name ?? t(lang, 'mem.unnamed')}</Link>{' '}
                      <span className="chip">{m.locale.toUpperCase()}</span>
                    </td>
                    <td className="mono">{m.member_code}</td>
                    <td className="mono muted">{m.phone ?? '-'}</td>
                    <td className="right num">
                      <b>{m.balance}</b>
                    </td>
                    <td className="right num muted">{m.lifetime_earned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>{t(lang, 'mem.addTitle')}</h2>
        <p className="lede">{t(lang, 'mem.addLede')}</p>
        <form action={addMember} className="row">
          <div className="field">
            <label htmlFor="fullName">{t(lang, 'w.name')}</label>
            <input id="fullName" name="fullName" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="phone">
              {t(lang, 'mem.mobile')}
            </label>
            <input id="phone" name="phone" type="text" inputMode="tel" required />
          </div>
          <div className="field">
            <label htmlFor="email">
              {t(lang, 'w.email')}{' '}
              <span className="hint">{t(lang, 'mem.emailHint')}</span>
            </label>
            <input id="email" name="email" type="email" dir="ltr" placeholder="name@example.com" />
          </div>
          <div className="field field-sm">
            <label htmlFor="locale">{t(lang, 'mem.language')}</label>
            <select id="locale" name="locale" defaultValue="ar">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          {/* Ticked by default, and the cashier is expected to say the sentence
              out loud rather than tick it silently. Only matters when an email
              was given — there is nowhere to send a promotion otherwise. */}
          <label className="check">
            <input type="checkbox" name="marketingOptIn" defaultChecked />
            <span>{t(lang, 'mem.marketing')}</span>
          </label>
          <button type="submit" className="primary">
            {t(lang, 'mem.addButton')}
          </button>
        </form>
      </div>
    </>
  );
}
