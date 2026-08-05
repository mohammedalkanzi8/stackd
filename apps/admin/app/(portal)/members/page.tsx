import Link from 'next/link';
import { redirect } from 'next/navigation';

import { query, queryOne, transaction } from '@stackd/server';

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
  const { requireStaff } = await import('@/lib/auth.ts');
  await requireStaff();

  const name = String(formData.get('fullName') ?? '').trim();
  const rawPhone = String(formData.get('phone') ?? '').trim();
  const locale = String(formData.get('locale') ?? 'ar');

  const fail = (m: string) => redirect(`/members?error=${encodeURIComponent(m)}`);

  if (!name) fail('Enter their name.');

  // Accept 0547557666, 547557666, +966547557666, or with spaces — store E.164.
  const digits = rawPhone.replace(/[^0-9]/g, '');
  let phone: string;
  if (/^9665\d{8}$/.test(digits)) phone = `+${digits}`;
  else if (/^05\d{8}$/.test(digits)) phone = `+966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) phone = `+966${digits}`;
  else fail(`"${rawPhone}" is not a Saudi mobile number — try 054 755 7666.`);

  if (!['ar', 'en'].includes(locale)) fail('Pick a language.');

  if (await queryOne('select 1 from customers where phone = $1', [phone!])) {
    fail(`${phone!} is already a member.`);
  }

  const settings = await queryOne<{ signup_bonus: number }>(
    'select signup_bonus from loyalty_settings',
  );

  const code = await transaction(async (c) => {
    // The customer row hangs off auth.users, so both go in together.
    const { rows } = await c.query('insert into auth.users (phone) values ($1) returning id', [phone!]);
    const id = rows[0].id;
    const created = await c.query(
      `insert into customers (id, full_name, phone, locale)
       values ($1, $2, $3, $4) returning member_code`,
      [id, name, phone!, locale],
    );
    if (settings && settings.signup_bonus > 0) {
      await c.query(
        `insert into loyalty_transactions (customer_id, delta, reason, note)
         values ($1, $2, 'signup_bonus', 'Signed up at the counter')`,
        [id, settings.signup_bonus],
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
  const { q = '', ok, error } = await searchParams;
  const term = q.trim();

  // Matches a scanned member code, a phone number however it was typed, or a
  // name. Phone comparison strips punctuation on both sides so "0547557666",
  // "054 755 7666" and "+966547557666" all find the same person.
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
      <p className="eyebrow">Members</p>
      <h1>Look someone up</h1>
      <p className="lede">
        Scan or type a member code, or search by name or phone number. The code is
        what is on the customer&rsquo;s QR.
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <form className="card row" style={{ marginBlockEnd: 20 }}>
        <div className="field">
          <label htmlFor="q">
            Member code, name or phone <span className="hint">— blank lists everyone</span>
          </label>
          <input id="q" name="q" type="text" defaultValue={term} autoFocus placeholder="DEV22222" />
        </div>
        <button type="submit" className="primary">
          Search
        </button>
        {term ? (
          <Link href="/members" className="btn">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="card">
        {members.length === 0 ? (
          <p className="empty">
            {term ? (
              <>
                Nothing matches <b>{term}</b>. Member codes are eight characters and
                never contain 0, O, 1, I or L.
              </>
            ) : (
              'No members yet.'
            )}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th className="right">Balance</th>
                  <th className="right">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/members/${m.id}`}>{m.full_name ?? 'Unnamed'}</Link>{' '}
                      <span className="chip">{m.locale.toUpperCase()}</span>
                    </td>
                    <td className="mono">{m.member_code}</td>
                    <td className="mono muted">{m.phone ?? '—'}</td>
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

      <div className="card" style={{ marginBlockStart: 22 }}>
        <h2>Sign someone up</h2>
        <p className="lede" style={{ marginBlockEnd: 16 }}>
          For a customer joining at the counter. They get a member code straight
          away — read it out, or let them scan the QR on their next receipt.
        </p>
        <form action={addMember} className="row">
          <div className="field">
            <label htmlFor="fullName">Name</label>
            <input id="fullName" name="fullName" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="phone">
              Mobile <span className="hint">— 054 755 7666</span>
            </label>
            <input id="phone" name="phone" type="text" inputMode="tel" required />
          </div>
          <div className="field field-sm">
            <label htmlFor="locale">Language</label>
            <select id="locale" name="locale" defaultValue="ar">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <button type="submit" className="primary">
            Add member
          </button>
        </form>
      </div>
    </>
  );
}
