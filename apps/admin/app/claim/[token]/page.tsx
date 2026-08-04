/**
 * Where a scanned bill QR lands. PUBLIC — no session, by design.
 *
 * The person holding the receipt is a customer standing in the street with their
 * phone, not staff. They identify themselves with their member code, which is
 * the same code on their loyalty QR.
 *
 * This lives in the portal only because the portal is the one thing here that
 * runs a server. It belongs on the real site the moment there is one, which is
 * what STACKD_CLAIM_BASE_URL exists to point at — and it must be set before a
 * single receipt is printed, because paper cannot be corrected later.
 */

import { redirect } from 'next/navigation';

import { query, queryOne } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Collect your points · STACKD' };

interface ClaimView {
  token: string;
  points: number;
  expires_at: Date;
  claimed_at: Date | null;
  pickup_code: string;
  service_date: string;
}

async function claim(formData: FormData): Promise<void> {
  'use server';

  const token = String(formData.get('token') ?? '');
  const code = String(formData.get('memberCode') ?? '')
    .trim()
    .toUpperCase();
  const back = `/claim/${token}`;

  if (!code) redirect(`${back}?error=${encodeURIComponent('Enter your member code.')}`);

  const member = await queryOne<{ id: string; full_name: string | null }>(
    'select id, full_name from customers where member_code = $1',
    [code],
  );
  if (!member) {
    redirect(
      `${back}?error=${encodeURIComponent(
        `No member with the code ${code}. It is the eight characters under the QR in your account.`,
      )}`,
    );
  }

  try {
    const row = await queryOne<{ pts: number }>('select claim_order_points($1, $2) as pts', [
      token,
      member.id,
    ]);
    redirect(`${back}?ok=${row?.pts ?? 0}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    redirect(
      `${back}?error=${encodeURIComponent(
        err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : 'Could not collect those points.',
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
  const { token } = await params;
  const { ok, error } = await searchParams;

  const found = await queryOne<ClaimView>(
    `select cl.token, cl.points, cl.expires_at, cl.claimed_at,
            o.pickup_code, o.service_date
       from order_claims cl
       join orders o on o.id = cl.order_id
      where cl.token = upper($1)`,
    [token],
  );

  return (
    <div className="login-wrap">
      <div className="login-card">
        <p className="eyebrow">STACKD</p>

        {ok ? (
          <>
            <h1>{ok} points added</h1>
            <p className="lede">
              They are in your account now. Show your member QR at the counter next
              time to spend them.
            </p>
            <div className="banner ok">Thanks for coming in.</div>
          </>
        ) : !found ? (
          <>
            <h1>We don&rsquo;t know that code</h1>
            <p className="lede">
              Check the code printed under the QR on your receipt. It never contains
              the digits 0 or 1, or the letters O, I and L.
            </p>
          </>
        ) : found.claimed_at ? (
          <>
            <h1>Already collected</h1>
            <p className="lede">
              The points from ticket {found.pickup_code} went to an account on{' '}
              {new Date(found.claimed_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                timeZone: 'Asia/Riyadh',
              })}
              . Each receipt can only be collected once.
            </p>
          </>
        ) : new Date(found.expires_at) < new Date() ? (
          <>
            <h1>That receipt has expired</h1>
            <p className="lede">
              Points had to be collected by{' '}
              {new Date(found.expires_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Asia/Riyadh',
              })}
              . Ask at the counter and we will sort it out.
            </p>
          </>
        ) : (
          <>
            <h1>Collect {found.points} points</h1>
            <p className="lede">
              From ticket <span className="mono">{found.pickup_code}</span>. Enter your
              member code and they are yours.
            </p>

            {error ? <div className="banner bad">{error}</div> : null}

            <div className="card">
              <form action={claim} className="stack">
                <input type="hidden" name="token" value={found.token} />
                <div>
                  <label htmlFor="memberCode">Your member code</label>
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
                    style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}
                  />
                </div>
                <button type="submit" className="primary">
                  Add {found.points} points
                </button>
              </form>
            </div>

            <p className="muted" style={{ fontSize: 13, marginBlockStart: 16 }}>
              Not a member yet? Ask at the counter — it takes a moment and this
              receipt stays valid until{' '}
              {new Date(found.expires_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                timeZone: 'Asia/Riyadh',
              })}
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
