import { formatSar, query } from '@stackd/server';
import Link from 'next/link';

import { getLang, type Lang } from '@/lib/prefs.ts';
import { t, fmtDate } from '@/lib/i18n.ts';


export const metadata = { title: 'Orders · STACKD admin' };
export const dynamic = 'force-dynamic';

interface OrderRow {
  id: string;
  pickup_code: string;
  service_date: string;
  source: 'app' | 'pos';
  status: string;
  grand_total: number;
  points_earned: number;
  created_at: Date;
  member: string | null;
  member_code: string | null;
  lines: number;
  claim_token: string | null;
  claimed_at: Date | null;
  voided_at: Date | null;
}

const STATUS_CHIP: Record<string, string> = {
  pending_payment: 'warn',
  paid: 'on',
  accepted: 'on',
  preparing: 'on',
  ready: 'on',
  completed: '',
  cancelled: 'off',
  refunded: 'hot',
};

/* Status wording moved into the dictionary so it reads in Arabic too. The keys
   are the database's own enum values, prefixed `st.`. */
function statusLabel(lang: Lang, status: string): string {
  return t(lang, `st.${status}`);
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; source?: string }>;
}) {
  const lang = await getLang();
  const { day = '', source = '' } = await searchParams;

  const orders = await query<OrderRow>(
    `select o.id, o.pickup_code, o.service_date, o.source, o.status,
            o.grand_total, o.points_earned, o.created_at,
            c.full_name as member, c.member_code,
            o.voided_at,
            (select count(*)::int from order_items i where i.order_id = o.id) as lines,
            cl.token as claim_token, cl.claimed_at
       from orders o
       left join customers c on c.id = o.customer_id
       left join order_claims cl on cl.order_id = o.id
      where ($1 = '' or o.service_date = $1::date)
        and ($2 = '' or o.source = $2::order_source)
      order by o.created_at desc
      limit 100`,
    [day, source],
  );

  const days = await query<{ service_date: string; n: number; total: number }>(
    // Voided tickets are excluded from the money but still counted, so a day
    // whose total drops has a visible reason rather than looking like a bug.
    `select service_date, count(*)::int as n,
            sum(grand_total) filter (where voided_at is null)::int as total
       from orders group by service_date order by service_date desc limit 10`,
  );

  const shown = orders.reduce((sum, o) => sum + (o.voided_at ? 0 : o.grand_total), 0);

  return (
    <>
      <p className="eyebrow">{t(lang, 'ord.title')}</p>
      <h1>{t(lang, 'ord.heading')}</h1>
      {/* ⚠ This said 03:00 until 12 Aug 2026 and had been wrong since the hours
          moved to 16:00-04:00. riyadh_service_date offsets by the closing hour
          plus one, so the boundary is 05:00. */}
      <p className="lede">{t(lang, 'ord.lede')}</p>

      <form className="card row">
        <div className="field field-sm">
          <label htmlFor="day">{t(lang, 'ord.tradingDay')}</label>
          <select id="day" name="day" defaultValue={day}>
            <option value="">{t(lang, 'ord.allDays')}</option>
            {days.map((d) => (
              <option key={d.service_date} value={d.service_date}>
                {d.service_date} · {d.n} {t(lang, 'ord.orders')}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-sm">
          <label htmlFor="source">{t(lang, 'ord.cameFrom')}</label>
          <select id="source" name="source" defaultValue={source}>
            <option value="">{t(lang, 'ord.everything')}</option>
            <option value="pos">{t(lang, 'ord.till')}</option>
            <option value="app">{t(lang, 'ord.app')}</option>
          </select>
        </div>
        <button type="submit" className="primary">
          {t(lang, 'ord.show')}
        </button>
        {day || source ? (
          <Link href="/orders" className="btn">
            {t(lang, 'ord.clear')}
          </Link>
        ) : null}
      </form>

      <div className="card">
        <div className="spread">
          <h2>
            {orders.length} {t(lang, 'ord.orders')}
          </h2>
          <span className="muted sm">
            {formatSar(shown)} {t(lang, 'ord.taken')}
          </span>
        </div>

        {orders.length === 0 ? (
          <p className="empty">{t(lang, 'ord.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'ord.ticket')}</th>
                  <th>{t(lang, 'ord.when')}</th>
                  <th>{t(lang, 'ord.from')}</th>
                  <th>{t(lang, 'ord.member')}</th>
                  <th className="right">{t(lang, 'w.total')}</th>
                  <th className="right">{t(lang, 'nav.points')}</th>
                  <th className="right">{t(lang, 'ord.status')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">
                      <Link href={`/orders/${o.id}`}>
                        <b>{o.pickup_code}</b>
                      </Link>
                      <span className="muted xs">
                        {' '}
                        · {o.lines || '-'} {o.lines === 1 ? 'line' : 'lines'}
                      </span>
                    </td>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(lang, o.created_at, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Riyadh',
                      })}
                    </td>
                    <td>
                      <span className="chip">{o.source === 'pos' ? t(lang, 'ord.till') : t(lang, 'ord.app')}</span>
                    </td>
                    <td>
                      {o.member ? (
                        <>
                          {o.member}{' '}
                          <span className="mono muted xs">
                            {o.member_code}
                          </span>
                        </>
                      ) : o.claim_token && !o.claimed_at ? (
                        <span className="chip warn">{t(lang, 'od.qrUnclaimed')}</span>
                      ) : (
                        <span className="muted">{t(lang, 'ord.walkIn')}</span>
                      )}
                    </td>
                    {/* Struck through, not hidden. A voided ticket still
                        happened, and someone reconciling the till needs to see
                        it sitting there with its number. */}
                    <td className="right num">
                      {o.voided_at ? <s className="muted">{formatSar(o.grand_total)}</s> : formatSar(o.grand_total)}
                    </td>
                    <td className="right num">
                      {o.points_earned > 0 ? o.points_earned : <span className="muted">-</span>}
                    </td>
                    <td className="right">
                      {o.voided_at ? (
                        <span className="chip hot">{t(lang, 'ord.voided')}</span>
                      ) : (
                        <span className={`chip ${STATUS_CHIP[o.status] ?? ''}`}>
                          {statusLabel(lang, o.status)}
                        </span>
                      )}
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
