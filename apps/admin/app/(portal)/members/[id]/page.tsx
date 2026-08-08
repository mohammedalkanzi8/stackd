import { SubmitButton } from '@/app/SubmitButton.tsx';
import { formatSar, query, queryOne } from '@stackd/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { MANAGERIAL, requireRole, requireStaff } from '@/lib/auth.ts';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  member_code: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  birthday: string | null;
  marketing_opt_in: boolean;
  created_at: Date;
  balance: number;
  lifetime_earned: number;
  last_activity_at: Date | null;
}

interface Entry {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  created_at: Date;
  reward: string | null;
  order_total: number | null;
  actor: string | null;
}

const REASON_LABEL: Record<string, string> = {
  earn_purchase: 'Earned on a purchase',
  redeem_reward: 'Redeemed',
  redeem_counter: 'Spent at the counter',
  signup_bonus: 'Sign-up bonus',
  birthday_bonus: 'Birthday bonus',
  manual_adjust: 'Manual adjustment',
  expiry: 'Expired',
  order_refund: 'Clawed back on refund',
};

/**
 * Goodwill credit or correction.
 *
 * Writes a `manual_adjust` row rather than touching the balance, because the
 * balance is a cached projection of the ledger — editing it directly would be
 * overwritten by the next transaction and would leave no trace of who did it.
 * The database refuses a manual_adjust without an actor, so the signed-in staff
 * member is recorded whether or not this code remembers to.
 */
async function adjustPoints(formData: FormData): Promise<void> {
  'use server';

  const staff = await requireRole(...MANAGERIAL);
  const customerId = String(formData.get('customerId') ?? '');
  const raw = String(formData.get('delta') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  const back = `/members/${customerId}`;

  const delta = Number(raw);
  if (!Number.isInteger(delta) || delta === 0) {
    redirect(`${back}?error=${encodeURIComponent('Enter a whole number of points, not zero.')}`);
  }
  if (!note) {
    redirect(`${back}?error=${encodeURIComponent('Say why. This is an audit trail.')}`);
  }

  try {
    await query(
      `insert into loyalty_transactions (customer_id, delta, reason, actor_id, note)
       values ($1, $2, 'manual_adjust', $3, $4)`,
      [customerId, delta, staff.id, note],
    );
  } catch (err) {
    // The likely one is loyalty_balances_balance_check: taking away more points
    // than the member holds. Say that, rather than showing the constraint name.
    const message =
      err instanceof Error && err.message.includes('loyalty_balances_balance_check')
        ? 'That would take the balance below zero.'
        : err instanceof Error
          ? err.message
          : 'Could not apply the adjustment.';
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(back);
  redirect(
    `${back}?ok=${encodeURIComponent(
      `${delta > 0 ? 'Added' : 'Removed'} ${Math.abs(delta)} points.`,
    )}`,
  );
}

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const member = await queryOne<Member>(
    `select c.id, c.member_code, c.full_name, c.phone, c.email, c.locale,
            c.birthday, c.marketing_opt_in, c.created_at,
            coalesce(b.balance, 0) as balance,
            coalesce(b.lifetime_earned, 0) as lifetime_earned,
            b.last_activity_at
       from customers c
       left join loyalty_balances b on b.customer_id = c.id
      where c.id = $1`,
    [id],
  );
  if (!member) notFound();

  const entries = await query<Entry>(
    `select t.id, t.delta, t.reason, t.note, t.created_at,
            r.name_en as reward,
            o.grand_total as order_total,
            actor.full_name as actor
       from loyalty_transactions t
       left join rewards r on r.id = t.reward_id
       left join orders o on o.id = t.order_id
       left join staff actor on actor.id = t.actor_id
      where t.customer_id = $1
      order by t.id desc`,
    [id],
  );

  const canAdjust = MANAGERIAL.includes(staff.role);

  return (
    <>
      <p className="eyebrow">
        <Link href="/members">Members</Link> · {member.member_code}
      </p>
      <h1>{member.full_name ?? 'Unnamed member'}</h1>
      <p className="lede">
        Joined{' '}
        {new Date(member.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Riyadh',
        })}
        {member.phone ? ` · ${member.phone}` : ''}
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="grid" style={{ marginBlockEnd: 22 }}>
        <div className="card stat">
          <div className="k">Points balance</div>
          <div className="v num">{member.balance}</div>
          <div className="sub">{member.lifetime_earned} earned all time</div>
        </div>
        <div className="card stat">
          <div className="k">Member code</div>
          <div className="v mono" style={{ fontSize: 22 }}>
            {member.member_code}
          </div>
          <div className="sub">what the QR carries</div>
        </div>
        <div className="card stat">
          <div className="k">Last activity</div>
          <div className="v" style={{ fontSize: 20 }}>
            {member.last_activity_at
              ? new Date(member.last_activity_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Asia/Riyadh',
                })
              : '-'}
          </div>
          <div className="sub">points lapse after 12 months idle</div>
        </div>
      </div>

      {canAdjust ? (
        <div className="card" style={{ marginBlockEnd: 22 }}>
          <h2>Adjust points</h2>
          <p className="lede" style={{ marginBlockEnd: 14 }}>
            Goodwill, or fixing a mistake. Recorded against your name in the ledger
            and never removable. Use a negative number to take points away.
          </p>
          <form action={adjustPoints} className="row">
            <input type="hidden" name="customerId" value={member.id} />
            <div className="field field-sm">
              <label htmlFor="delta">Points</label>
              <input id="delta" name="delta" type="number" step="1" placeholder="50" required />
            </div>
            <div className="field">
              <label htmlFor="note">
                Reason <span className="hint">shown in the ledger</span>
              </label>
              <input
                id="note"
                name="note"
                type="text"
                placeholder="Apology for a long wait on 4 Aug"
                required
              />
            </div>
            <SubmitButton className="primary" pendingLabel="Applying…">Apply</SubmitButton>
          </form>
        </div>
      ) : null}

      <div className="card">
        <div className="spread" style={{ marginBlockEnd: 14 }}>
          <h2>Ledger</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · append-only
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="empty">Nothing yet. This member has not earned or spent any points.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reason</th>
                  <th>Detail</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(e.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Riyadh',
                      })}
                    </td>
                    <td>{REASON_LABEL[e.reason] ?? e.reason}</td>
                    <td className="muted">
                      {e.reward ?? null}
                      {e.order_total !== null ? formatSar(e.order_total) : null}
                      {e.note ? <span>{e.note}</span> : null}
                      {e.actor ? (
                        <span className="chip" style={{ marginInlineStart: 6 }}>
                          by {e.actor}
                        </span>
                      ) : null}
                      {!e.reward && e.order_total === null && !e.note ? '-' : null}
                    </td>
                    <td className={`right num ${e.delta > 0 ? 'pos' : 'neg'}`}>
                      {e.delta > 0 ? '+' : ''}
                      {e.delta}
                    </td>
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
