import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { formatSar, qrSvg, query, queryOne } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { IconPoints, IconQr, IconRewards, IconSignOut } from '../NavIcons.tsx';
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
          <p className="muted" style={{ textAlign: 'center', fontSize: 13, marginBlockEnd: 0 }}>
            Scanned when you order, so your points go on automatically.
          </p>
        </div>

        <div className="card" id="rewards" style={{ marginBlockStart: 18 }}>
          <h2>Swap your points</h2>
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
