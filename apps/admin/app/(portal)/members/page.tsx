import Link from 'next/link';

import { query } from '@/lib/db.ts';

export const metadata = { title: 'Members · STACKD admin' };
export const dynamic = 'force-dynamic';

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
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
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
    </>
  );
}
