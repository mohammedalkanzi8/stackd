import { formatSar, query, queryOne } from '@stackd/server';
import Link from 'next/link';

import { getLang } from '@/lib/prefs.ts';
import { t, tf, fmtDate } from '@/lib/i18n.ts';


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

/* Ledger reasons live in the dictionary, keyed by the database's own enum
   values under `rsn.`. They were a module-level English map in TWO files, which
   is also why "Sign-up bonus" was still showing on an Arabic screen. */

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
            {tf(lang, 'ov.earnedTotal', { n: totals.lifetime_earned.toLocaleString('en') })}
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
                {tf(lang, 'ov.missingCal', { n: totals.items_missing_calories })}
              </span>
            ) : (
              t(lang, 'ov.allCalories')
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>{t(lang, 'ov.latestMovements')}</h2>
          <span className="muted sm">{t(lang, 'ov.newestFirst')}</span>
        </div>

        {recent.length === 0 ? (
          <p className="empty">{t(lang, 'ov.noMovements')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'w.when')}</th>
                  <th>{t(lang, 'ord.member')}</th>
                  <th>{t(lang, 'w.reason')}</th>
                  <th className="right">{t(lang, 'w.points2')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(lang, m.created_at, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Riyadh',
                      })}
                    </td>
                    <td>
                      <Link href={`/members/${m.customer_id}`}>
                        {m.member ?? t(lang, 'mem.unnamed')}
                      </Link>{' '}
                      <span className="mono muted xs">
                        {m.member_code}
                      </span>
                    </td>
                    <td>
                      {t(lang, `rsn.${m.reason}`)}
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
        {tf(lang, 'ov.foot', { sar: formatSar(6000), pts: 52, gross: 60 })}
      </p>
    </>
  );
}
