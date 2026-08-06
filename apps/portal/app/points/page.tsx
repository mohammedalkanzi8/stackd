import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { formatSar, qrSvg, query, queryOne, walletOptions } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { IconPoints, IconQr, IconRewards, IconSignOut } from '../NavIcons.tsx';
import { InstallButton } from '../InstallButton.tsx';
import { RedeemPanel, type ActiveCode } from './RedeemPanel.tsx';
import { currentMember, endSession } from '@/lib/session.ts';

export const metadata = { title: 'Your points · STACKD Rewards' };
export const dynamic = 'force-dynamic';

interface Reward {
  id: string;
  name_en: string;
  name_ar: string;
  points_cost: number;
  discount_amount: number | null;
  free_item: string | null;
}

interface Entry {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  created_at: Date;
  reward: string | null;
}

const REASON: Record<string, string> = {
  earn_purchase: 'Points from a visit',
  redeem_reward: 'Reward claimed',
  signup_bonus: 'Welcome bonus',
  birthday_bonus: 'Birthday treat',
  manual_adjust: 'Adjusted by the team',
  expiry: 'Expired',
  order_refund: 'Refunded order',
};

async function redeem(formData: FormData): Promise<void> {
  'use server';

  const member = await currentMember();
  if (!member) redirect('/login');

  const rewardId = String(formData.get('rewardId') ?? '');
  try {
    // redeem_reward() checks the balance and writes the ledger row in one go.
    // Doing the check here instead would be a race: two taps on a slow phone
    // could both pass a client-side check and spend the same points twice.
    await queryOne('select redeem_reward($1, $2)', [member.id, rewardId]);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    const raw = err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : '';
    redirect(
      `/points?error=${encodeURIComponent(
        raw.startsWith('insufficient points')
          ? 'You do not have enough points for that yet.'
          : raw || 'Could not claim that reward.',
      )}`,
    );
  }

  revalidatePath('/points');
  redirect('/points?claimed=1');
}

/**
 * Creates a redemption code for the chosen number of points.
 *
 * The points are NOT deducted here. issue_redemption only reserves the amount;
 * the ledger is written when the cashier scans. An abandoned code therefore
 * costs the customer nothing, which matters because most of them will be.
 */
async function issueCode(formData: FormData): Promise<void> {
  'use server';

  const member = await currentMember();
  if (!member) redirect('/login');

  const points = Number(String(formData.get('points') ?? ''));
  if (!Number.isInteger(points) || points < 1) {
    redirect(`/points?error=${encodeURIComponent('Choose how many points to spend.')}`);
  }

  try {
    await queryOne('select issue_redemption($1, $2)', [member.id, points]);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    const raw = err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : '';
    redirect(
      `/points?error=${encodeURIComponent(
        raw.startsWith('insufficient points')
          ? `You only have ${member.balance} points.`
          : raw || 'Could not create a code.',
      )}`,
    );
  }

  revalidatePath('/points');
  redirect('/points#redeem');
}

/** Throws the live code away, so a new one can be made. */
async function cancelCode(): Promise<void> {
  'use server';

  const member = await currentMember();
  if (!member) redirect('/login');
  await query('delete from redemption_tokens where customer_id = $1 and redeemed_at is null', [
    member.id,
  ]);
  revalidatePath('/points');
  redirect('/points#redeem');
}

async function signOut(): Promise<void> {
  'use server';
  await endSession();
  redirect('/login');
}

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; claimed?: string; welcome?: string }>;
}) {
  const member = await currentMember();
  if (!member) redirect('/login');

  const { error, claimed, welcome } = await searchParams;

  const rewards = await query<Reward>(`
    select r.id, r.name_en, r.name_ar, r.points_cost, r.discount_amount,
           mi.name_en as free_item
      from rewards r
      left join menu_items mi on mi.id = r.free_item_id
     where r.is_active
       and (r.starts_at is null or now() >= r.starts_at)
       and (r.ends_at is null or now() <= r.ends_at)
     order by r.points_cost
  `);

  const entries = await query<Entry>(
    `select t.id, t.delta, t.reason, t.note, t.created_at, r.name_en as reward
       from loyalty_transactions t
       left join rewards r on r.id = t.reward_id
      where t.customer_id = $1
      order by t.id desc
      limit 25`,
    [member.id],
  );

  // The QR the cashier scans is the member code itself, not a URL: the till
  // scanner reads a string and looks it up, and a URL would just be noise.
  const qr = await qrSvg(member.memberCode);

  // A live redemption code, if one exists and has not expired. Expired rows are
  // left for the next issue() to clear rather than deleted on read, so a GET
  // never writes.
  const live = await queryOne<{ token: string; points: number; expires_at: Date }>(
    `select token, points, expires_at from redemption_tokens
      where customer_id = $1 and redeemed_at is null and expires_at > now()`,
    [member.id],
  );
  const activeCode: ActiveCode | null = live
    ? {
        token: live.token,
        points: live.points,
        qrSvg: await qrSvg(live.token),
        expiresAt: new Date(live.expires_at).toISOString(),
      }
    : null;

  // Both wallet buttons stay hidden until their credentials exist. A pass that
  // cannot be signed is worse than no button: it fails silently in the hand.
  const wallet = walletOptions({
    memberCode: member.memberCode,
    fullName: member.fullName,
    balance: member.balance,
  });
  const next = rewards.find((r) => r.points_cost > member.balance);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            STACKD<span>.</span>
          </span>
          {/* Anchors rather than routes: the portal is one page today, so these
              jump within it. They become real links when ordering arrives. */}
          <nav className="main">
            <a href="#balance">
              <IconPoints />
              <span>Points</span>
            </a>
            <a href="#code">
              <IconQr />
              <span>My code</span>
            </a>
            <a href="#rewards">
              <IconRewards />
              <span>Rewards</span>
            </a>
          </nav>
          <form action={signOut}>
            <SubmitButton className="quiet" pendingLabel="…">
              <IconSignOut />
              Sign out
            </SubmitButton>
          </form>
        </div>
      </header>

      <main>
        {welcome ? (
          <div className="banner ok">
            Welcome to STACKD Rewards. Show the code below whenever you order.
          </div>
        ) : null}
        {claimed ? (
          <div className="banner ok">
            Claimed. Show your code at the counter and it is yours.
          </div>
        ) : null}
        {error ? <div className="banner bad">{error}</div> : null}

        <div className="balance" id="balance">
          <div className="k">Your points</div>
          <div className="n num">{member.balance}</div>
          <div className="sub">
            {member.lifetimeEarned} earned since you joined
            {next ? ` · ${next.points_cost - member.balance} more for ${next.name_en}` : ''}
          </div>
        </div>

        <div className="card" id="code" style={{ marginBlockStart: 18 }}>
          <h2 style={{ textAlign: 'center' }}>Show this at the counter</h2>
          <div className="member-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="member-code mono">{member.memberCode}</p>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            Scanned when you order, so your points go on automatically.
          </p>

          {wallet.googleUrl || wallet.appleAvailable ? (
            <div className="wallet-row">
              {wallet.appleAvailable ? (
                <a className="wallet-btn" href="/wallet/apple">
                  <AppleMark />
                  <span>
                    <small>Add to</small>
                    Apple Wallet
                  </span>
                </a>
              ) : null}
              {wallet.googleUrl ? (
                <a className="wallet-btn" href={wallet.googleUrl}>
                  <GoogleMark />
                  <span>
                    <small>Add to</small>
                    Google Wallet
                  </span>
                </a>
              ) : null}
            </div>
          ) : null}

          <InstallButton />
        </div>

        <div className="card" id="redeem" style={{ marginBlockStart: 18 }}>
          <h2>Spend points off your bill</h2>
          <p className="muted" style={{ fontSize: 13.5, marginBlockStart: 0 }}>
            Choose an amount, show the code to the cashier, and it comes straight
            off what you owe. 100 points is 1.00 SAR.
          </p>
          <RedeemPanel
            balance={member.balance}
            active={activeCode}
            issue={issueCode}
            cancel={cancelCode}
          />
        </div>

        <div className="card" id="rewards" style={{ marginBlockStart: 18 }}>
          <h2>Or swap them for an item</h2>
          {rewards.length === 0 ? (
            <p className="empty">No rewards available right now.</p>
          ) : (
            rewards.map((r) => {
              const affordable = member.balance >= r.points_cost;
              return (
                <div className={`reward${affordable ? '' : ' locked'}`} key={r.id}>
                  <div className="body">
                    <div className="name">{r.name_en}</div>
                    <div className="cost">
                      {r.points_cost} points
                      {r.free_item
                        ? ` · ${r.free_item} free`
                        : r.discount_amount
                          ? ` · ${formatSar(r.discount_amount)} off`
                          : ''}
                    </div>
                  </div>
                  {affordable ? (
                    <form action={redeem}>
                      <input type="hidden" name="rewardId" value={r.id} />
                      <SubmitButton className="primary" pendingLabel="Claiming…">
                        Claim
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="chip">{r.points_cost - member.balance} more</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ marginBlockStart: 18 }}>
          <h2>Your history</h2>
          {entries.length === 0 ? (
            <p className="empty">
              Nothing yet. Show your code next time you order and points start
              landing here.
            </p>
          ) : (
            entries.map((e) => (
              <div className="entry" key={e.id}>
                <div>
                  <div>
                    {REASON[e.reason] ?? e.reason}
                    {e.reward ? ` · ${e.reward}` : ''}
                  </div>
                  <div className="when">
                    {new Date(e.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Asia/Riyadh',
                    })}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <div className={e.delta > 0 ? 'pos num' : 'neg num'}>
                  {e.delta > 0 ? '+' : ''}
                  {e.delta}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="muted" style={{ fontSize: 13, marginBlockStart: 22, textAlign: 'center' }}>
          Ordering from here is coming next. For now, points and rewards.
        </p>
      </main>
    </>
  );
}

/* Wordmark-free marks: Apple and Google both restrict use of their official
   "Add to Wallet" artwork, and a plain glyph beside plain text is inside what
   their guidelines permit while still reading correctly. */

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M16.4 12.7c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.6.7 2.8.7 1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4s-2.3-.9-2.3-3.4zM14.2 5.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z" />
    </svg>
  );
}
