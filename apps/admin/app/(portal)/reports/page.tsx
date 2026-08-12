/**
 * Management reporting.
 *
 * The question this page exists to answer is "what has the loyalty programme
 * actually cost us", and the answer has to be in riyals, because points are not
 * a currency anyone budgets in.
 *
 * ONE POINT IS ONE HALALA. That equivalence is the programme's design (see the
 * comment on `loyalty_settings` in schema.sql), which is what makes every riyal
 * figure here an exact conversion rather than an assumed exchange rate: a points
 * total IS a halala total, and `sar()` only moves the decimal point.
 *
 * Numbers here are read as management information, not as a curiosity, so
 * anything that cannot be derived honestly is left off rather than estimated.
 */

import { query, queryOne } from '@stackd/server';
import Link from 'next/link';

import { ADMIN, requireStaff } from '@/lib/auth.ts';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';

export const metadata = { title: 'Reports · STACKD admin' };
export const dynamic = 'force-dynamic';

/**
 * Points are halalas, so this is a decimal shift and nothing more.
 *
 * `formatSar` from @stackd/server is deliberately not used: it has no thousands
 * separator, which is right on a 27.00 price tag and unreadable at 38,282.00.
 * Changing the shared helper would change every receipt and menu price with it.
 */
function sar(halalas: number): string {
  const sign = halalas < 0 ? '-' : '';
  const abs = Math.abs(halalas);
  const whole = Math.trunc(abs / 100).toLocaleString('en');
  return `SAR ${sign}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

const pts = (n: number) => n.toLocaleString('en');

/**
 * Every ledger row sorted into one of eight buckets.
 *
 * Spending points at the till writes reason `redeem_counter`, which exists
 * precisely so this page does not have to guess. Before migration 0002 that
 * path wrote `manual_adjust` — the same reason a manager uses to correct a
 * balance by hand — and the two could only be told apart by the note.
 *
 * ⚠ The note match below is a COMPATIBILITY SHIM, not the mechanism. 0002
 * backfills every row it can identify, so against a migrated database it
 * matches nothing. It is here so that running this app against a database that
 * has not had 0002 applied yet does not file real redemptions under "staff
 * corrections". Delete it once every deployment is migrated and 0002's
 * `left_behind` count is 0 everywhere.
 *
 * ⚠ `reason::text = 'redeem_counter'` — the cast is load-bearing, not noise.
 * Comparing an enum column against a label the type does not have RAISES
 * (22P02, `invalid input value for enum`); it does not evaluate to false. So
 * the enum spelling would turn this whole page into a 500 on exactly the
 * un-migrated database the shim exists to survive. Casting to text compares
 * strings and simply finds nothing. The other reasons are deliberately left as
 * enum comparisons, so a typo in one of THEM still fails loudly.
 *
 * `other` exists so that a reason added to the enum later shows up as
 * unclassified on the page instead of being silently folded into a total.
 */
const BUCKET = `
  case
    when t.reason = 'earn_purchase'                     then 'earned'
    when t.reason in ('signup_bonus', 'birthday_bonus') then 'bonus'
    when t.reason = 'expiry'                            then 'expired'
    when t.reason = 'order_refund'                      then 'clawed_back'
    when t.reason = 'redeem_reward'                     then 'consumed_reward'
    when t.reason::text = 'redeem_counter'              then 'consumed_counter'
    when t.reason = 'manual_adjust' and t.delta < 0
         and t.note like 'Redeemed % points at the counter' then 'consumed_counter'
    when t.reason = 'manual_adjust' and t.delta < 0     then 'staff_deduction'
    when t.reason = 'manual_adjust'                     then 'staff_credit'
    else 'other'
  end`;

/** Shared by the headline and the trend, so one definition of "spent" exists. */
/**
 * What counts as trade.
 *
 * Two conditions, and they mean different things. `status` is about fulfilment —
 * a cancelled or unpaid ticket never became a sale. `voided_at` is about the
 * books — a real sale that a Super Admin struck out. Both have to hold, and they
 * live here as one string so a void cannot be excluded from the revenue figure
 * but counted in the daily chart. Prefix with a table alias where the query
 * needs one.
 */
const IS_TRADE = (a = '') =>
  `${a}status not in ('cancelled','pending_payment','refunded') and ${a}voided_at is null`;

const IS_CONSUMED = `(
  t.reason = 'redeem_reward'
  or t.reason::text = 'redeem_counter'
  or (t.reason = 'manual_adjust' and t.delta < 0
      and t.note like 'Redeemed % points at the counter')
)`;

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
  { days: 0, label: 'All time' },
];

interface Points {
  consumed: number;
  consumed_counter: number;
  consumed_reward: number;
  consumption_events: number;
  issued: number;
  earned: number;
  bonus: number;
  staff_credit: number;
  expired: number;
  clawed_back: number;
  staff_deduction: number;
  unclassified: number;
}

interface Trade {
  orders: number;
  revenue: number;
  vat: number;
  avg_ticket: number;
  member_orders: number;
  distinct_members: number;
  refunded: number;
  refunded_value: number;
}

interface Liability {
  outstanding: number;
  holders: number;
  members: number;
  biggest: number;
}

interface Day {
  day: string;
  orders: number;
  revenue: number;
  consumed: number;
}

interface TopMember {
  id: string;
  full_name: string | null;
  member_code: string;
  orders: number;
  spend: number;
  balance: number;
  consumed: number;
}

interface TopItem {
  name_en: string;
  qty: number;
  revenue: number;
}

interface Breakdown {
  bucket: string;
  movements: number;
  points: number;
}

const BUCKET_LABEL: Record<string, { label: string; note: string }> = {
  earned: { label: 'Earned on purchases', note: 'the programme running normally' },
  bonus: { label: 'Sign-up and birthday bonuses', note: 'given, not earned' },
  staff_credit: { label: 'Staff goodwill credits', note: 'added by hand' },
  consumed_counter: { label: 'Spent at the counter', note: 'scanned off a bill' },
  consumed_reward: { label: 'Spent on catalogue rewards', note: 'claimed in the app' },
  expired: { label: 'Expired unused', note: 'liability released, costs nothing' },
  clawed_back: { label: 'Clawed back on refunds', note: 'reversing an earn' },
  staff_deduction: { label: 'Staff corrections', note: 'removed by hand' },
  other: { label: 'Unclassified', note: 'a reason this page does not know' },
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const lang = await getLang();
  const staff = await requireStaff();

  // Revenue, liability and who the best customers are is management
  // information. A cashier has no reason to hold it and the nav does not offer
  // this page to one, but the page is what actually enforces that.
  if (!ADMIN.includes(staff.role)) {
    return (
      <>
        <p className="eyebrow">{t(lang, 'rep.title')}</p>
        <h1>{t(lang, 'rep.heading')}</h1>
        {/* Split around the two links rather than one string with markup in
            it. The connecting word is its own key so Arabic can supply "و",
            which attaches to the following word rather than standing alone. */}
        <p className="lede">
          {t(lang, 'rep.lede')} <Link href="/scan">{t(lang, 'nav.scan')}</Link>{' '}
          {t(lang, 'rep.ledeAnd')}
          <Link href="/members">{t(lang, 'ov.members')}</Link>.
        </p>
      </>
    );
  }

  const raw = (await searchParams).days;
  const days = PERIODS.some((p) => String(p.days) === raw) ? Number(raw) : 30;
  const period = PERIODS.find((p) => p.days === days)!;
  const within = '($1::int = 0 or t.created_at >= now() - make_interval(days => $1::int))';

  const points = (await queryOne<Points>(
    `with tx as (
       select t.delta, ${BUCKET} as bucket
         from loyalty_transactions t
        where ${within}
     )
     select
       coalesce(-sum(delta) filter (where bucket like 'consumed%'), 0)::int      as consumed,
       coalesce(-sum(delta) filter (where bucket = 'consumed_counter'), 0)::int  as consumed_counter,
       coalesce(-sum(delta) filter (where bucket = 'consumed_reward'), 0)::int   as consumed_reward,
       count(*) filter (where bucket like 'consumed%')::int                       as consumption_events,
       coalesce(sum(delta) filter (where bucket in ('earned','bonus','staff_credit')), 0)::int as issued,
       coalesce(sum(delta) filter (where bucket = 'earned'), 0)::int             as earned,
       coalesce(sum(delta) filter (where bucket = 'bonus'), 0)::int              as bonus,
       coalesce(sum(delta) filter (where bucket = 'staff_credit'), 0)::int       as staff_credit,
       coalesce(-sum(delta) filter (where bucket = 'expired'), 0)::int           as expired,
       coalesce(-sum(delta) filter (where bucket = 'clawed_back'), 0)::int       as clawed_back,
       coalesce(-sum(delta) filter (where bucket = 'staff_deduction'), 0)::int   as staff_deduction,
       coalesce(sum(delta) filter (where bucket = 'other'), 0)::int              as unclassified
     from tx`,
    [days],
  ))!;

  const breakdown = await query<Breakdown>(
    `with tx as (
       select t.delta, ${BUCKET} as bucket
         from loyalty_transactions t
        where ${within}
     )
     select bucket, count(*)::int as movements, sum(delta)::int as points
       from tx group by bucket order by sum(delta) desc`,
    [days],
  );

  // Cancelled and unpaid tickets were never revenue; refunded ones stopped
  // being revenue, so they are counted separately rather than quietly dropped.
  const trade = (await queryOne<Trade>(
    `select
       count(*) filter (where ${IS_TRADE()})::int as orders,
       coalesce(sum(grand_total) filter (where ${IS_TRADE()}), 0)::int as revenue,
       coalesce(sum(vat_total) filter (where ${IS_TRADE()}), 0)::int as vat,
       coalesce(avg(grand_total) filter (where ${IS_TRADE()}), 0)::int as avg_ticket,
       count(*) filter (where ${IS_TRADE()} and customer_id is not null)::int as member_orders,
       count(distinct customer_id) filter (where ${IS_TRADE()})::int as distinct_members,
       count(*) filter (where status = 'refunded' and voided_at is null)::int as refunded,
       coalesce(sum(grand_total) filter (where status = 'refunded' and voided_at is null), 0)::int as refunded_value
     from orders t
     where ${within}`,
    [days],
  ))!;

  // Liability is a standing balance, not a flow: it is whatever is owed right
  // now, so the period filter does not apply to it and saying so matters.
  const liability = (await queryOne<Liability>(`
    select coalesce(sum(balance), 0)::int as outstanding,
           count(*) filter (where balance > 0)::int as holders,
           (select count(*)::int from customers) as members,
           coalesce(max(balance), 0)::int as biggest
      from loyalty_balances
  `))!;

  // Empty days must appear as zero, or a quiet Monday looks like it never
  // happened and the trend lies about the shape of the week.
  const span = days === 0 ? 60 : Math.min(days, 60);
  const trend = await query<Day>(
    `with span as (
       select generate_series(riyadh_service_date(now()) - ($1::int - 1),
                              riyadh_service_date(now()), interval '1 day')::date as day
     ), o as (
       select service_date as day, count(*)::int as n, sum(grand_total)::int as revenue
         from orders
        where ${IS_TRADE()}
        group by 1
     ), c as (
       select riyadh_service_date(t.created_at) as day, -sum(t.delta)::int as consumed
         from loyalty_transactions t
        where ${IS_CONSUMED}
        group by 1
     )
     select to_char(s.day, 'YYYY-MM-DD') as day,
            coalesce(o.n, 0) as orders,
            coalesce(o.revenue, 0) as revenue,
            coalesce(c.consumed, 0) as consumed
       from span s
       left join o on o.day = s.day
       left join c on c.day = s.day
      order by s.day`,
    [span],
  );

  const topMembers = await query<TopMember>(
    `select c.id, c.full_name, c.member_code,
            count(o.id)::int as orders,
            coalesce(sum(o.grand_total), 0)::int as spend,
            coalesce(b.balance, 0) as balance,
            coalesce((select -sum(t.delta)::int from loyalty_transactions t
                       where t.customer_id = c.id and ${IS_CONSUMED}), 0) as consumed
       from customers c
       left join loyalty_balances b on b.customer_id = c.id
       left join orders o on o.customer_id = c.id
             and ${IS_TRADE('o.')}
             and ($1::int = 0 or o.created_at >= now() - make_interval(days => $1::int))
      group by c.id, c.full_name, c.member_code, b.balance
     having count(o.id) > 0
      order by sum(o.grand_total) desc nulls last
      limit 10`,
    [days],
  );

  const topItems = await query<TopItem>(
    `select i.name_en,
            sum(i.quantity)::int as qty,
            sum(i.line_total)::int as revenue
       from order_items i
       join orders t on t.id = i.order_id
      where t.status not in ('cancelled','pending_payment','refunded')
        and ${within}
      group by i.name_en
      order by sum(i.line_total) desc
      limit 10`,
    [days],
  );

  const maxRevenue = Math.max(1, ...trend.map((d) => d.revenue));
  const maxConsumed = Math.max(1, ...trend.map((d) => d.consumed));
  const maxItem = Math.max(1, ...topItems.map((i) => i.revenue));
  const maxSpend = Math.max(1, ...topMembers.map((m) => m.spend));

  // What share of what was handed out has come back. Over a short window this
  // compares points spent now against points issued now, which are not the same
  // cohort — the label says so rather than pretending it is a cohort figure.
  const redemptionRate = points.issued > 0 ? (points.consumed / points.issued) * 100 : 0;

  // Summed from the rows actually shown rather than recomputed from the
  // headline figures, so the total always reconciles with the table above it —
  // including the unclassified bucket, which the headline maths does not know
  // about and which would otherwise make this line quietly disagree.
  // Over all time this equals the outstanding liability exactly.
  const netChange = breakdown.reduce((sum, b) => sum + b.points, 0);

  return (
    <>
      <p className="eyebrow">{t(lang, 'rep.title')}</p>
      <h1>{t(lang, 'rep.heading')}</h1>
      <p className="lede">{t(lang, 'rep.halalaNote')}</p>

      <form className="card row">
        <div className="field field-sm">
          <label htmlFor="days">{t(lang, 'rep.period')}</label>
          <select id="days" name="days" defaultValue={String(days)}>
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="primary">{t(lang, 'a.show')}</button>
      </form>

      {points.unclassified !== 0 ? (
        <div className="banner note">
          <b>{pts(points.unclassified)} points are unclassified.</b> A reason was
          added to the ledger that this page does not know about, so it is being
          shown separately rather than folded into a total that would then be
          wrong.
        </div>
      ) : null}

      {/* ---- the headline: what the programme cost ---- */}
      <div className="card">
        <div className="k-lbl">Points consumed · {period.label.toLowerCase()}</div>
        <div className="hero">{pts(points.consumed)}</div>
        <div className="hero-sub">
          points, worth <b>{sar(points.consumed)}</b> taken off bills
        </div>

        <div className="split">
          <div>
            <div className="k-lbl">{t(lang, 'rep.spentCounter')}</div>
            <div className="v2 num">{pts(points.consumed_counter)}</div>
            <div className="sub">{sar(points.consumed_counter)}</div>
          </div>
          <div>
            <div className="k-lbl">{t(lang, 'rep.spentRewards')}</div>
            <div className="v2 num">{pts(points.consumed_reward)}</div>
            <div className="sub">{sar(points.consumed_reward)}</div>
          </div>
          <div>
            <div className="k-lbl">{t(lang, 'rep.redemptions')}</div>
            <div className="v2 num">{pts(points.consumption_events)}</div>
            <div className="sub">
              {points.consumption_events > 0
                ? `${sar(Math.round(points.consumed / points.consumption_events))} each`
                : 'none yet'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card stat">
          <div className="k">{t(lang, 'rep.pointsIssued')}</div>
          <div className="v num">{pts(points.issued)}</div>
          <div className="sub">{sar(points.issued)} handed out</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.outstanding')}</div>
          <div className="v num">{sar(liability.outstanding)}</div>
          <div className="sub">
            {pts(liability.outstanding)} points held by {liability.holders} of{' '}
            {liability.members} members
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.takenUp')}</div>
          <div className="v num">{redemptionRate.toFixed(1)}%</div>
          <div className="sub">of the points issued in this period</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.expiredUnused')}</div>
          <div className="v num">{pts(points.expired)}</div>
          <div className="sub">
            {points.expired > 0 ? `${sar(points.expired)} never claimed` : 'nothing lapsed'}
          </div>
        </div>
      </div>

      {/* ---- the full ledger, so the headline can be checked ---- */}
      <div className="card">
        <div className="spread" style={{ marginBlockEnd: 6 }}>
          <h2>{t(lang, 'rep.whereWent')}</h2>
          <span className="muted sm">
            {period.label.toLowerCase()}
          </span>
        </div>
        <p className="lede">{t(lang, 'rep.ledgerNote')}<b>{t(lang, 'rep.expiredNotCost')}</b> — they are a
          liability that lapsed, which is the opposite.
        </p>

        {breakdown.length === 0 ? (
          <p className="empty">{t(lang, 'rep.noPoints')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'rep.movement')}</th>
                  <th className="right">{t(lang, 'rep.times')}</th>
                  <th className="right">{t(lang, 'w.points2')}</th>
                  <th className="right">{t(lang, 'rep.inRiyals')}</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.bucket}>
                    <td>
                      <b>{BUCKET_LABEL[b.bucket]?.label ?? b.bucket}</b>
                      <span className="muted xs">
                        {' '}
                        · {BUCKET_LABEL[b.bucket]?.note ?? ''}
                      </span>
                    </td>
                    <td className="right num muted">{pts(b.movements)}</td>
                    <td className={`right num ${b.points > 0 ? 'pos' : 'neg'}`}>
                      {b.points > 0 ? '+' : ''}
                      {pts(b.points)}
                    </td>
                    <td className={`right num ${b.points > 0 ? 'pos' : 'neg'}`}>
                      {sar(b.points)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>{t(lang, 'rep.netChange')}</b>
                  </td>
                  <td className="right num muted">-</td>
                  <td className={`right num ${netChange >= 0 ? 'pos' : 'neg'}`}>
                    {netChange > 0 ? '+' : ''}
                    {pts(netChange)}
                  </td>
                  <td className={`right num ${netChange >= 0 ? 'pos' : 'neg'}`}>
                    {sar(netChange)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- trade ---- */}
      <div className="spread">
        <h2>{t(lang, 'rep.trade')}</h2>
        <span className="muted sm">
          {period.label.toLowerCase()}
        </span>
      </div>
      <div className="grid">
        <div className="card stat">
          <div className="k">{t(lang, 'rep.taken')}</div>
          <div className="v num">{sar(trade.revenue)}</div>
          <div className="sub">
            {pts(trade.orders)} {trade.orders === 1 ? 'ticket' : 'tickets'}
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.avgTicket')}</div>
          <div className="v num">{sar(trade.avg_ticket)}</div>
          <div className="sub">{t(lang, 'rep.vatIncluded')}</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.vatWithin')}</div>
          <div className="v num">{sar(trade.vat)}</div>
          <div className="sub">extracted, never added on top</div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'rep.identified')}</div>
          <div className="v num">
            {trade.orders > 0 ? Math.round((trade.member_orders / trade.orders) * 100) : 0}%
          </div>
          <div className="sub">
            {pts(trade.member_orders)} of {pts(trade.orders)} tickets ·{' '}
            {trade.distinct_members} members seen
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBlockStart: 0, marginBlockEnd: 26 }}>
        Cancelled and unpaid tickets are excluded throughout.
        {trade.refunded > 0 ? (
          <>
            {' '}
            {trade.refunded} refunded {trade.refunded === 1 ? 'ticket' : 'tickets'} worth{' '}
            {sar(trade.refunded_value)} {trade.refunded === 1 ? 'is' : 'are'} excluded too.
          </>
        ) : null}{' '}
        The share identified at the till is the ceiling on how much of your trade
        the loyalty programme can ever see.
      </p>

      {/* ---- the trend ----
          Two measures on one pair of axes would be a lie about scale, so revenue
          and points spent get a chart each, over the same days. */}
      <div className="card">
        <div className="spread" style={{ marginBlockEnd: 4 }}>
          <h2>{t(lang, 'rep.dayByDay')}</h2>
          <span className="muted sm">
            last {trend.length} trading days
          </span>
        </div>
        <p className="lede">{t(lang, 'rep.tradingNote')}</p>

        <div className="chart">
          <div className="chart-hd">
            <span className="k-lbl">{t(lang, 'rep.taken')}</span>
            <span className="muted xs">
              peak {sar(maxRevenue)}
            </span>
          </div>
          <div className="cols" aria-hidden="true">
            {trend.map((d) => (
              <div key={d.day} className="col" title={`${d.day} · ${sar(d.revenue)}`}>
                <i
                  style={{
                    height: d.revenue > 0 ? `max(2px, ${(d.revenue / maxRevenue) * 100}%)` : 0,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="chart">
          <div className="chart-hd">
            <span className="k-lbl">{t(lang, 'rep.pointsSpent')}</span>
            <span className="muted xs">
              peak {pts(maxConsumed)} ({sar(maxConsumed)})
            </span>
          </div>
          <div className="cols" aria-hidden="true">
            {trend.map((d) => (
              <div key={d.day} className="col" title={`${d.day} · ${pts(d.consumed)} points`}>
                <i
                  className="alt"
                  style={{
                    height: d.consumed > 0 ? `max(2px, ${(d.consumed / maxConsumed) * 100}%)` : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="chart-ft">
            <span>{trend[0]?.day}</span>
            <span>{trend[trend.length - 1]?.day}</span>
          </div>
        </div>

        <details style={{ marginBlockStart: 16 }}>
          <summary className="muted" style={{ fontSize: 13, cursor: 'pointer' }}>{t(lang, 'rep.sameDays')}</summary>
          <div className="table-wrap" style={{ marginBlockStart: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'ord.tradingDay')}</th>
                  <th className="right">{t(lang, 'rep.tickets')}</th>
                  <th className="right">{t(lang, 'rep.taken')}</th>
                  <th className="right">{t(lang, 'rep.pointsSpent')}</th>
                  <th className="right">{t(lang, 'rep.worth')}</th>
                </tr>
              </thead>
              <tbody>
                {[...trend].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="num">{d.day}</td>
                    <td className="right num muted">{d.orders || '-'}</td>
                    <td className="right num">{d.revenue ? sar(d.revenue) : '-'}</td>
                    <td className="right num">{d.consumed ? pts(d.consumed) : '-'}</td>
                    <td className="right num muted">{d.consumed ? sar(d.consumed) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* ---- who and what ---- */}
      <div className="card">
        <div className="spread">
          <h2>{t(lang, 'rep.bestMembers')}</h2>
          <span className="muted sm">
            by spend, {period.label.toLowerCase()}
          </span>
        </div>
        {topMembers.length === 0 ? (
          <p className="empty">{t(lang, 'rep.noMember')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'ord.member')}</th>
                  <th className="right">{t(lang, 'rep.visits')}</th>
                  <th>{t(lang, 'rep.spend')}</th>
                  <th className="right">{t(lang, 'rep.pointsHeld')}</th>
                  <th className="right">{t(lang, 'rep.spentToDate')}</th>
                </tr>
              </thead>
              <tbody>
                {topMembers.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/members/${m.id}`}>{m.full_name ?? 'Unnamed'}</Link>{' '}
                      <span className="mono muted xs">
                        {m.member_code}
                      </span>
                    </td>
                    <td className="right num muted">{m.orders}</td>
                    <td>
                      <div className="bar-row">
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{ width: `${(m.spend / maxSpend) * 100}%` }}
                          />
                        </span>
                        <span className="num bar-val">{sar(m.spend)}</span>
                      </div>
                    </td>
                    <td className="right num">{pts(m.balance)}</td>
                    <td className="right num muted">{m.consumed ? sar(m.consumed) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="spread">
          <h2>{t(lang, 'rep.whatSells')}</h2>
          <span className="muted sm">
            by revenue, {period.label.toLowerCase()}
          </span>
        </div>
        {topItems.length === 0 ? (
          <p className="empty">{t(lang, 'rep.noLines')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'pts.item')}</th>
                  <th className="right">{t(lang, 'rep.sold')}</th>
                  <th>{t(lang, 'rep.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((i) => (
                  <tr key={i.name_en}>
                    <td>
                      <b>{i.name_en}</b>
                    </td>
                    <td className="right num muted">{pts(i.qty)}</td>
                    <td>
                      <div className="bar-row">
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{ width: `${(i.revenue / maxItem) * 100}%` }}
                          />
                        </span>
                        <span className="num bar-val">{sar(i.revenue)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, marginBlockEnd: 0, marginBlockStart: 14 }}>{t(lang, 'rep.lineNote')}</p>
      </div>
    </>
  );
}
