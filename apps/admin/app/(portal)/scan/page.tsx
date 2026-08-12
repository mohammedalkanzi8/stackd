import Link from 'next/link';
import { formatSar, queryOne } from '@stackd/server';

import { requireStaff } from '@/lib/auth.ts';
import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { ScanClient } from './ScanClient.tsx';
import { claimForMember, creditBill, identify, takePoints } from './actions.ts';

export const metadata = { title: 'Scan · STACKD admin' };
export const dynamic = 'force-dynamic';

interface MemberView {
  member_code: string;
  full_name: string | null;
  balance: number;
}

interface RedeemView {
  token: string;
  points: number;
  expires_at: Date;
  redeemed_at: Date | null;
  full_name: string | null;
  member_code: string;
}

interface ClaimView {
  token: string;
  points: number;
  expires_at: Date;
  claimed_at: Date | null;
  pickup_code: string;
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    member?: string;
    redeem?: string;
    claim?: string;
  }>;
}) {
  await requireStaff();
  const lang = await getLang();
  const { ok, error, member: memberCode, redeem, claim } = await searchParams;

  const member = memberCode
    ? await queryOne<MemberView>(
        `select c.member_code, c.full_name, coalesce(b.balance, 0) as balance
           from customers c
           left join loyalty_balances b on b.customer_id = c.id
          where c.member_code = $1`,
        [memberCode],
      )
    : null;

  const redemption = redeem
    ? await queryOne<RedeemView>(
        `select t.token, t.points, t.expires_at, t.redeemed_at,
                c.full_name, c.member_code
           from redemption_tokens t join customers c on c.id = t.customer_id
          where t.token = $1`,
        [redeem],
      )
    : null;

  const claimRow = claim
    ? await queryOne<ClaimView>(
        `select cl.token, cl.points, cl.expires_at, cl.claimed_at, o.pickup_code
           from order_claims cl join orders o on o.id = cl.order_id
          where cl.token = $1`,
        [claim],
      )
    : null;

  const expired = redemption ? new Date(redemption.expires_at) < new Date() : false;

  return (
    <>
      <p className="eyebrow">{t(lang, 'scan.eyebrow')}</p>
      <h1>{t(lang, 'scan.title')}</h1>
      <p className="lede">
        {t(lang, 'scan.lede')}
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card">
        {/* A follow-up form takes the caret instead, so a hardware scanner or a
            typed total lands where the cashier is looking. */}
        <ScanClient
          identify={identify}
          takeFocus={!memberCode && !redeem && !claim}
          lang={lang}
        />
      </div>

      {member ? (
        <div className="card">
          <p className="eyebrow">{t(lang, 'scan.givePoints')}</p>
          <h2>
            {member.full_name ?? 'Member'}{' '}
            <span className="mono muted" style={{ fontSize: 14 }}>
              {member.member_code}
            </span>
          </h2>
          <p className="lede">
            Balance {member.balance} points ({formatSar(member.balance)}). Type the
            bill total and 10% of it goes on.
          </p>
          <form action={creditBill} className="row">
            <input type="hidden" name="memberCode" value={member.member_code} />
            <div className="field field-sm">
              <label htmlFor="bill">
                {t(lang, 'scan.billTotal')}{' '}
                <span className="hint" dir="ltr">SAR</span>
              </label>
              <input dir="ltr"
                id="bill"
                name="bill"
                type="text"
                inputMode="decimal"
                required
                autoFocus
                placeholder="115.00"
              />
            </div>
            <button type="submit" className="primary">
              {t(lang, 'scan.addPoints')}
            </button>
            <Link href="/scan" className="btn">
              {t(lang, 'a.cancel')}
            </Link>
          </form>
        </div>
      ) : null}

      {redemption ? (
        <div className="card">
          <p className="eyebrow">{t(lang, 'scan.takeOff')}</p>
          <h2>
            {redemption.points} points ={' '}
            <span style={{ color: 'var(--accent)' }}>{formatSar(redemption.points)}</span> off
          </h2>
          <p className="lede">
            {redemption.full_name ?? 'Member'}{' '}
            <span className="mono">{redemption.member_code}</span>
          </p>

          {redemption.redeemed_at ? (
            <div className="banner bad">
              Already used at{' '}
              {new Date(redemption.redeemed_at).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Riyadh',
              })}
              . Each code works once.
            </div>
          ) : expired ? (
            <div className="banner bad">
              {t(lang, 'scan.expired')}
            </div>
          ) : (
            <form action={takePoints} className="row">
              <input type="hidden" name="token" value={redemption.token} />
              <button type="submit" className="primary">
                Confirm, take {formatSar(redemption.points)} off
              </button>
              <Link href="/scan" className="btn">
                {t(lang, 'a.cancel')}
              </Link>
            </form>
          )}
        </div>
      ) : null}

      {claimRow ? (
        <div className="card">
          <p className="eyebrow">{t(lang, 'scan.receiptCode')}</p>
          <h2>
            {claimRow.points} points from ticket{' '}
            <span className="mono">{claimRow.pickup_code}</span>
          </h2>
          {claimRow.claimed_at ? (
            <div className="banner bad">{t(lang, 'scan.alreadyClaimed')}</div>
          ) : (
            <>
              <p className="lede">
                {t(lang, 'scan.putOnAccount')}
              </p>
              <form action={claimForMember} className="row">
                <input type="hidden" name="token" value={claimRow.token} />
                <div className="field field-sm">
                  <label htmlFor="memberCode">{t(lang, 'mem.memberCode')}</label>
                  <input
                    id="memberCode"
                    name="memberCode"
                    type="text"
                    required
                    autoFocus
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="mono"
                  />
                </div>
                <button type="submit" className="primary">
                  {t(lang, 'scan.addThePoints')}
                </button>
              </form>
            </>
          )}
        </div>
      ) : null}

      <p className="muted sm">{t(lang, 'scan.foot')}</p>
    </>
  );
}
