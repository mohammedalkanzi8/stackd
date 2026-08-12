import { SubmitButton } from '@/app/SubmitButton.tsx';
import { formatSar, query, queryOne } from '@stackd/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ADMIN, SUPER_ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';

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
 * Sets or clears the member's email address.
 *
 * This is the door into the customer portal for anybody who signed up at the
 * counter. A counter signup records a phone number and nothing else — no email,
 * no password — and the portal's forgotten-password flow is the only way such a
 * person can ever get in. With no address on file there is nowhere to send the
 * code, so they are simply stuck.
 *
 * Any staff member may do it, like the counter signup itself: the customer is
 * standing there, which is stronger identity verification than anything the
 * portal can do on its own. That is exactly why the customer-facing side has no
 * equivalent — letting somebody attach their own address to an account they only
 * know the phone number of would hand over the points balance.
 */
async function setEmail(formData: FormData): Promise<void> {
  'use server';
  await requireStaff();

  const id = String(formData.get('customerId') ?? '');
  const raw = String(formData.get('email') ?? '').trim().toLowerCase();
  const back = (k: 'ok' | 'error', m: string) =>
    redirect(`/members/${id}?${k}=${encodeURIComponent(m)}`);

  if (raw && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    back('error', 'That email address does not look right.');
  }

  try {
    // Empty clears it. NULL rather than '', because the unique index exempts
    // NULLs and every empty string would collide with every other.
    await queryOne('update customers set email = $2 where id = $1 returning id', [
      id,
      raw || null,
    ]);
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      back('error', `${raw} is already on another member's account.`);
    }
    throw err;
  }

  revalidatePath(`/members/${id}`);
  back('ok', raw ? `Email set to ${raw}. They can now use it to sign in to the portal.` : 'Email cleared.');
}

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

  // Super Admin only, on the owner's instruction (12 Aug 2026). Points are
  // money: this hands out balance a customer can spend, or takes back balance
  // they have already earned.
  const staff = await requireRole(...SUPER_ADMIN);
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

/**
 * Removes a member outright. Admin, on the owner's instruction (12 Aug 2026).
 *
 * ⚠ THIS IS THE ONE DESTRUCTIVE ACTION IN THE PORTAL THAT LEAVES NO TRACE.
 * Deactivating is the pattern everywhere else — staff are deactivated precisely
 * so the ledger keeps their name — but a member is a person, and "delete my
 * account" is a request they are entitled to make.
 *
 * Two things stop it being dangerous:
 *
 *  1. **Anyone with an order is refused.** `orders.customer_id` carries no
 *     ON DELETE, so the database would refuse anyway; checking first turns a
 *     constraint-violation stack trace into a sentence. It also means the rule
 *     cannot be forgotten — sales history is never reachable from here.
 *  2. **The member code has to be typed.** Not a confirm dialog, which people
 *     click through; the code is on screen and typing it is a deliberate act.
 *
 * What does go, via `on delete cascade`: their points ledger, their balance,
 * and their portal login. That is why the balance is spelled out on the button.
 */
async function deleteMember(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...ADMIN);

  const id = String(formData.get('customerId') ?? '');
  const typed = String(formData.get('confirmCode') ?? '').trim().toUpperCase();
  const back = `/members/${id}`;
  const stop = (m: string): never =>
    redirect(`${back}?error=${encodeURIComponent(m)}`);

  const member = await queryOne<{ member_code: string; full_name: string | null }>(
    'select member_code, full_name from customers where id = $1',
    [id],
  );
  if (!member) stop('That member no longer exists.');

  if (typed !== member!.member_code) {
    stop(`Type ${member!.member_code} exactly to confirm the deletion.`);
  }

  const orders = await queryOne<{ n: number }>(
    'select count(*)::int as n from orders where customer_id = $1',
    [id],
  );
  if ((orders?.n ?? 0) > 0) {
    stop(
      `${member!.full_name ?? 'This member'} has ${orders!.n} order${
        orders!.n === 1 ? '' : 's'
      } against their name and cannot be deleted — that is sales history. ` +
        'Points can still be zeroed from the ledger above.',
    );
  }

  await query('delete from customers where id = $1', [id]);

  revalidatePath('/members');
  redirect(
    `/members?ok=${encodeURIComponent(
      `${member!.full_name ?? member!.member_code} has been deleted.`,
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

  const canAdjust = SUPER_ADMIN.includes(staff.role);
  const canDelete = ADMIN.includes(staff.role);

  // Only fetched for the people who can act on it. Deletion is refused for
  // anyone with orders, and saying so up front beats letting them type the code
  // and then bouncing them.
  const orderCount = canDelete
    ? (
        await queryOne<{ n: number }>(
          'select count(*)::int as n from orders where customer_id = $1',
          [id],
        )
      )?.n ?? 0
    : 0;

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

      <div className="grid">
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

      <div className="card">
        <h2>Contact email</h2>
        <p className="lede">
          {member.email
            ? 'Used to sign in to the customer portal, and to send a code if they forget their password.'
            : 'This member has no email, so they cannot sign in to the customer portal or reset a password. Add one and they can.'}
        </p>
        <form action={setEmail} className="row">
          <input type="hidden" name="customerId" value={member.id} />
          <div className="field">
            <label htmlFor="email">
              Email <span className="hint">leave blank to remove</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={member.email ?? ''}
              placeholder="name@example.com"
            />
          </div>
          <SubmitButton className="primary" pendingLabel="Saving…">
            Save email
          </SubmitButton>
        </form>
      </div>

      {canAdjust ? (
        <div className="card">
          <h2>Adjust points</h2>
          <p className="lede">
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
        <div className="spread">
          <h2>Ledger</h2>
          <span className="muted sm">
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

      {canDelete ? (
        <div className="card danger">
          <h2>Delete this member</h2>
          {orderCount > 0 ? (
            <p className="lede">
              {member.full_name ?? 'This member'} has{' '}
              <strong>
                {orderCount} order{orderCount === 1 ? '' : 's'}
              </strong>{' '}
              against their name, so they cannot be deleted — that is sales
              history, and it stays. Points can be zeroed from the ledger above
              instead.
            </p>
          ) : (
            <>
              <p className="lede">
                Erases them, their {member.balance} point
                {member.balance === 1 ? '' : 's'} and their whole ledger. There is
                no undo and nothing is kept. Type{' '}
                <strong className="mono">{member.member_code}</strong> to confirm.
              </p>
              <form action={deleteMember} className="row">
                <input type="hidden" name="customerId" value={member.id} />
                <div className="field field-sm">
                  <label htmlFor="confirmCode">Member code</label>
                  <input
                    id="confirmCode"
                    name="confirmCode"
                    type="text"
                    className="mono"
                    autoComplete="off"
                    placeholder={member.member_code}
                    required
                  />
                </div>
                <SubmitButton className="danger" pendingLabel="Deleting…">
                  Delete permanently
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
