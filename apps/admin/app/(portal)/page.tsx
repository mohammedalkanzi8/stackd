import { formatSar, query, queryOne } from '@stackd/server';
import Link from 'next/link';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';


export const metadata = { title: 'Overview · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Totals {
  members: number;
  points_outstanding: number;
  lifetime_earned: number;
  active_rewards: number;
  active_items: number;
  items_missing_calories: number;
}

interface Movement {
  id: number;
  delta: number;
  reason: string;
  created_at: Date;
  member: string | null;
  member_code: string | null;
  customer_id: string;
  reward: string | null;
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

export default async function OverviewPage() {
  const lang = await getLang();
  const totals = (await queryOne<Totals>(`
    select
      (select count(*) from customers) as members,
      (select coalesce(sum(balance), 0) from loyalty_balances) as points_outstanding,
      (select coalesce(sum(lifetime_earned), 0) from loyalty_balances) as lifetime_earned,
      (select count(*) from rewards where is_active) as active_rewards,
      (select count(*) from menu_items where is_active) as active_items,
      (select count(*) from menu_items where is_active and calories is null) as items_missing_calories
  `))!;

  const recent = await query<Movement>(`
    select t.id, t.delta, t.reason, t.created_at,
           c.full_name as member, c.member_code, c.id as customer_id,
           r.name_en as reward
      from loyalty_transactions t
      join customers c on c.id = t.customer_id
      left join rewards r on r.id = t.reward_id
     order by t.id desc
     limit 12
  `);

  return (
    <>
      <p className="eyebrow">{t(lang, 'ov.title')}</p>
      <h1>{t(lang, 'ov.heading')}</h1>
      <p className="lede">{t(lang, 'ov.lede')}</p>

      <div className="grid">
        <div className="card stat">
          <div className="k">{t(lang, 'ov.members')}</div>
          <div className="v num">{totals.members}</div>
          <div className="sub">
            <Link href="/members">{t(lang, 'ov.lookUp')}</Link>
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'ov.pointsOut')}</div>
          <div className="v num">{totals.points_outstanding.toLocaleString('en')}</div>
          <div className="sub">
            {totals.lifetime_earned.toLocaleString('en')} {t(lang, 'ov.earnedAllTime')}
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'ov.activeRewards')}</div>
          <div className="v num">{totals.active_rewards}</div>
          <div className="sub">
            <Link href="/rewards">{t(lang, 'ov.editCatalogue')}</Link>
          </div>
        </div>
        <div className="card stat">
          <div className="k">{t(lang, 'ov.itemsLive')}</div>
          <div className="v num">{totals.active_items}</div>
          <div className="sub">
            {totals.items_missing_calories > 0 ? (
              <span className="warn-text" style={{ color: 'var(--warn)' }}>
                {totals.items_missing_calories} {t(lang, 'ov.missingCalories')}
              </span>
            ) : (
              t(lang, 'ov.allCalories')
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>Latest point movements</h2>
          <span className="muted sm">
            newest first
          </span>
        </div>

        {recent.length === 0 ? (
          <p className="empty">
            No points have moved yet. They appear here as soon as an order earns or
            a reward is redeemed.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Member</th>
                  <th>Reason</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(m.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Riyadh',
                      })}
                    </td>
                    <td>
                      <Link href={`/members/${m.customer_id}`}>
                        {m.member ?? 'Unnamed'}
                      </Link>{' '}
                      <span className="mono muted xs">
                        {m.member_code}
                      </span>
                    </td>
                    <td>
                      {REASON_LABEL[m.reason] ?? m.reason}
                      {m.reward ? <span className="muted"> · {m.reward}</span> : null}
                    </td>
                    <td className={`right num ${m.delta > 0 ? 'pos' : 'neg'}`}>
                      {m.delta > 0 ? '+' : ''}
                      {m.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, marginBlockStart: 24 }}>
        Points are earned on the pre-VAT net, so a {formatSar(6000)} ticket earns
        52, not 60. Nothing in this portal mints points directly. Orders do, and
        the ledger is append-only.
      </p>
    </>
  );
}
