/**
 * Where a scanned bill QR lands. Public — no session required, by design.
 *
 * Someone standing in the street with a receipt should not have to sign in
 * before they know what the code is worth. So the page shows the points first
 * and asks who they are second: signed in, one tap; signed out, their member
 * code; not a member at all, a link to join that comes straight back here.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { queryOne } from '@stackd/server';

import { SubmitButton } from '../../SubmitButton.tsx';
import { currentMember } from '@/lib/session.ts';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { LangSwitch } from '@/app/LangSwitch.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Collect your points · STACKD' };

interface ClaimView {
  token: string;
  points: number;
  expires_at: Date;
  claimed_at: Date | null;
  pickup_code: string;
}

async function claim(formData: FormData): Promise<void> {
  'use server';

  const token = String(formData.get('token') ?? '');
  const back = `/claim/${token}`;

  // Signed in, so we already know who they are.
  let customerId = (await currentMember())?.id ?? null;

  if (!customerId) {
    const code = String(formData.get('memberCode') ?? '')
      .trim()
      .toUpperCase();
    if (!code) redirect(`${back}?error=${encodeURIComponent(t(await getLang(), 'cl.enterMemberCode'))}`);

    const member = await queryOne<{ id: string }>(
      'select id from customers where member_code = $1',
      [code],
    );
    if (!member) {
      redirect(
        `${back}?error=${encodeURIComponent(
          `No member with the code ${code}. It is the eight characters shown with your QR.`,
        )}`,
      );
    }
    customerId = member.id;
  }

  try {
    const row = await queryOne<{ pts: number }>('select claim_order_points($1, $2) as pts', [
      token,
      customerId,
    ]);
    redirect(`${back}?ok=${row?.pts ?? 0}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    redirect(
      `${back}?error=${encodeURIComponent(
        err instanceof Error
          ? err.message.replace(/^[^:]*:\s*/, '')
          : t(await getLang(), 'cl.failed'),
      )}`,
    );
  }
}

export default async function ClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const lang = await getLang();
  const { token } = await params;
  const { ok, error } = await searchParams;
  const member = await currentMember();

  const found = await queryOne<ClaimView>(
    `select cl.token, cl.points, cl.expires_at, cl.claimed_at, o.pickup_code
       from order_claims cl
       join orders o on o.id = cl.order_id
      where cl.token = upper($1)`,
    [token],
  );

  const when = (d: Date) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Riyadh',
    });

  return (
    <div className="narrow">
      <div className="narrow-inner">
        <p className="eyebrow">STACKD Rewards</p>

        {ok ? (
          <>
            <h1>{ok} points added</h1>
            <p className="lede">{t(lang, 'cl.inAccount')}</p>
            <Link href="/points" className="btn primary wide">
              {t(lang, 'cl.seePoints')}
            </Link>
          </>
        ) : !found ? (
          <>
            <h1>{t(lang, 'cl.unknown')}</h1>
            <p className="lede">
              Check the code printed under the QR on your receipt. It never contains
              the digits 0 or 1, or the letters O, I and L.
            </p>
          </>
        ) : found.claimed_at ? (
          <>
            <h1>{t(lang, 'cl.already')}</h1>
            <p className="lede">
              The points from ticket {found.pickup_code} went onto an account on{' '}
              {when(found.claimed_at)}. Each receipt can only be collected once.
            </p>
          </>
        ) : new Date(found.expires_at) < new Date() ? (
          <>
            <h1>{t(lang, 'cl.expired')}</h1>
            <p className="lede">
              Points had to be collected by {when(found.expires_at)}. Ask at the
              counter and we will sort it out.
            </p>
          </>
        ) : (
          <>
            <h1>Collect {found.points} points</h1>
            <p className="lede">
              {t(lang, 'cl.fromTicket')} <span className="mono">{found.pickup_code}</span>
              {member ? `, onto ${member.fullName}'s account.` : '.'}
            </p>

            {error ? <div className="banner bad">{error}</div> : null}

            <div className="card">
              <form action={claim} className="stack">
                <input type="hidden" name="token" value={found.token} />
                {member ? null : (
                  <div>
                    <label htmlFor="memberCode">{t(lang, 'cl.yourMemberCode')}</label>
                    <input
                      id="memberCode"
                      name="memberCode"
                      type="text"
                      required
                      autoFocus
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="ABCD2345"
                      className="mono"
                      style={{ letterSpacing: '0.18em' }}
                    />
                  </div>
                )}
                <SubmitButton className="primary wide" pendingLabel="Adding your points…">
                  Add {found.points} points
                </SubmitButton>
              </form>
            </div>

            {member ? null : (
              <p className="muted">
                <Link href={`/login?from=claim`}>{t(lang, 'a.signIn')}</Link> instead, or{' '}
                <Link href="/registration">join now</Link>. This receipt stays valid
                until {when(found.expires_at)}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
