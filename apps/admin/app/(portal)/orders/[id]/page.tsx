import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { MANAGERIAL, requireRole, requireStaff } from '@/lib/auth.ts';
import { query, queryOne } from '@/lib/db.ts';
import { formatSar } from '@/lib/money.ts';
import { claimQrSvg, claimUrl } from '@/lib/qr.ts';

export const dynamic = 'force-dynamic';

interface Order {
  id: string;
  pickup_code: string;
  service_date: string;
  source: 'app' | 'pos';
  status: string;
  subtotal: number;
  discount_total: number;
  vat_total: number;
  vat_rate: string;
  grand_total: number;
  points_earned: number;
  points_redeemed: number;
  notes: string | null;
  created_at: Date;
  customer_id: string | null;
  member: string | null;
  member_code: string | null;
  would_earn: number;
}

interface Line {
  id: string;
  name_en: string;
  name_ar: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  points_award: number | null;
}

interface Claim {
  token: string;
  points: number;
  expires_at: Date;
  claimed_at: Date | null;
  claimed_by_name: string | null;
}

/** Issues the bill QR so the customer can claim the points later. */
async function issueClaim(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...MANAGERIAL, 'cashier');

  const orderId = String(formData.get('orderId') ?? '');
  const back = `/orders/${orderId}`;
  try {
    const row = await queryOne<{ token: string | null }>(
      'select issue_order_claim($1) as token',
      [orderId],
    );
    if (!row?.token) {
      redirect(`${back}?error=${encodeURIComponent('This order earns no points, so there is nothing to claim.')}`);
    }
  } catch (err) {
    // redirect() throws a control-flow signal that must not be swallowed here.
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    redirect(
      `${back}?error=${encodeURIComponent(err instanceof Error ? err.message : 'Could not issue a code.')}`,
    );
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent('Code issued. Print it on the bill.')}`);
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const order = await queryOne<Order>(
    `select o.*, c.full_name as member, c.member_code,
            points_for_order(o.id) as would_earn
       from orders o
       left join customers c on c.id = o.customer_id
      where o.id = $1`,
    [id],
  );
  if (!order) notFound();

  const lines = await query<Line>(
    `select oi.id, oi.name_en, oi.name_ar, oi.unit_price, oi.quantity, oi.line_total,
            mi.points_award
       from order_items oi
       left join menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = $1
      order by oi.name_en`,
    [id],
  );

  const claim = await queryOne<Claim>(
    `select cl.token, cl.points, cl.expires_at, cl.claimed_at,
            c.full_name as claimed_by_name
       from order_claims cl
       left join customers c on c.id = cl.claimed_by
      where cl.order_id = $1`,
    [id],
  );

  const qr = claim && !claim.claimed_at ? await claimQrSvg(claim.token) : null;
  const alreadyEarned = order.points_earned > 0;
  const canIssue = [...MANAGERIAL, 'cashier'].includes(staff.role);

  return (
    <>
      <p className="eyebrow">
        <Link href="/orders">Orders</Link> · {order.service_date}
      </p>
      <h1>
        Ticket <span className="mono">{order.pickup_code}</span>
      </h1>
      <p className="lede">
        {order.source === 'pos' ? 'Rung up at the till' : 'Ordered in the app'} ·{' '}
        {new Date(order.created_at).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Riyadh',
        })}
        {order.member ? ` · ${order.member}` : ' · walk-in'}
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="grid" style={{ marginBlockEnd: 22 }}>
        <div className="card">
          <h2 style={{ marginBlockEnd: 12 }}>What they bought</h2>
          {lines.length === 0 ? (
            <p className="empty" style={{ padding: '10px 0' }}>
              No line detail — the till sent a total only.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.quantity} × {l.name_en}
                        {l.points_award !== null ? (
                          <span className="chip" style={{ marginInlineStart: 6 }}>
                            {l.points_award} pts each
                          </span>
                        ) : null}
                      </td>
                      <td className="right num">{formatSar(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <table className="data" style={{ marginBlockStart: 12 }}>
            <tbody>
              <tr>
                <td className="muted">Subtotal</td>
                <td className="right num">{formatSar(order.subtotal)}</td>
              </tr>
              {order.discount_total > 0 ? (
                <tr>
                  <td className="muted">Reward discount</td>
                  <td className="right num neg">−{formatSar(order.discount_total)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="muted">
                  VAT at {(Number(order.vat_rate) * 100).toFixed(0)}%{' '}
                  <span className="muted">(included, not added)</span>
                </td>
                <td className="right num muted">{formatSar(order.vat_total)}</td>
              </tr>
              <tr>
                <td>
                  <b>Total paid</b>
                </td>
                <td className="right num">
                  <b>{formatSar(order.grand_total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 style={{ marginBlockEnd: 12 }}>Points</h2>

          {alreadyEarned ? (
            <>
              <div className="stat">
                <div className="k">Earned by</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {order.member ?? 'a member'}
                </div>
                <div className="sub">
                  <b>{order.points_earned}</b> points already credited
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBlockStart: 12 }}>
                One sale pays out once. There is no bill QR for an order that has
                already credited someone.
              </p>
            </>
          ) : claim ? (
            claim.claimed_at ? (
              <>
                <div className="stat">
                  <div className="k">Claimed</div>
                  <div className="v" style={{ fontSize: 20 }}>
                    {claim.claimed_by_name ?? 'a member'}
                  </div>
                  <div className="sub">
                    <b>{claim.points}</b> points on{' '}
                    {new Date(claim.claimed_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'Asia/Riyadh',
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <p style={{ marginBlockStart: 0 }}>
                  Print this on the bill. Scanning it adds <b>{claim.points} points</b> to
                  whoever scans.
                </p>
                <div
                  className="qr"
                  dangerouslySetInnerHTML={{ __html: qr ?? '' }}
                  aria-label={`QR code for claim ${claim.token}`}
                />
                <p className="mono" style={{ fontSize: 20, letterSpacing: '0.08em', margin: '10px 0 4px' }}>
                  {claim.token}
                </p>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Expires{' '}
                  {new Date(claim.expires_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'Asia/Riyadh',
                  })}
                  . Anyone holding the receipt can claim it, like a paper voucher.
                </p>
                <p className="muted mono" style={{ fontSize: 11, marginBlockStart: 8, wordBreak: 'break-all' }}>
                  {claimUrl(claim.token)}
                </p>
              </>
            )
          ) : (
            <>
              <div className="stat">
                <div className="k">Would earn</div>
                <div className="v num">{order.would_earn}</div>
                <div className="sub">nobody has been credited yet</div>
              </div>
              {canIssue ? (
                <form action={issueClaim} style={{ marginBlockStart: 14 }}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className="primary">
                    Issue a bill QR
                  </button>
                </form>
              ) : null}
              <p className="muted" style={{ fontSize: 13, marginBlockStart: 12 }}>
                For a walk-in who is not a member yet, or who forgot to scan.
              </p>
            </>
          )}
        </div>
      </div>

      {order.notes ? (
        <div className="card">
          <h2>Note on the order</h2>
          <p style={{ margin: 0 }}>{order.notes}</p>
        </div>
      ) : null}
    </>
  );
}
