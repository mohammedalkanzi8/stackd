import { redirect } from 'next/navigation';

import { getLang } from '@/lib/prefs.ts';
import { t, tf, fmtDate } from '@/lib/i18n.ts';
import { LangSwitch } from '../LangSwitch.tsx';
import { revalidatePath } from 'next/cache';
import { formatSar, qrSvg, query, queryOne, walletOptions } from '@stackd/server';

import { SubmitButton } from '../SubmitButton.tsx';
import { IconPoints, IconQr, IconRewards, IconSignOut } from '../NavIcons.tsx';
import { InstallButton } from '../InstallButton.tsx';
import { RedeemPanel, type ActiveCode } from './RedeemPanel.tsx';
import { currentMember, endSession, requireMember } from '@/lib/session.ts';

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
  reward_ar: string | null;
}

/* Ledger reasons come from the dictionary under `rsn.`, keyed by the database
   enum. This was a module-level English map, which is why every line of a
   customer's history stayed English on an Arabic screen. */

async function redeem(formData: FormData): Promise<void> {
  'use server';

  const member = await currentMember();
  if (!member) redirect('/login');

  const rewardId = String(formData.get('rewardId') ?? '');
  try {
    // ⚠ ISSUES A CODE. It does NOT spend the points — the ledger row is written
    // when the cashier scans, exactly as it is for points off a bill.
    //
    // This used to call redeem_reward(), which wrote the ledger row immediately
    // and produced no code at all. The customer lost the points and had nothing
    // to present, while the banner below told them to show a code that did not
    // exist. See migration 0008.
    //
    // The balance check stays in the database: two taps on a slow phone could
    // both pass a check made here and claim twice.
    await queryOne('select issue_reward_redemption($1, $2)', [member.id, rewardId]);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    const raw = err instanceof Error ? err.message.replace(/^[^:]*:\s*/, '') : '';
    redirect(
      `/points?error=${encodeURIComponent(
        raw.startsWith('insufficient points')
          ? t(await getLang(), 'pt.notEnough')
          : raw || t(await getLang(), 'pt.claimFailed'),
      )}`,
    );
  }

  revalidatePath('/points');
  // No fragment: the card renders at the top of the page while a code is live,
  // so there is nothing to scroll to. Hash scrolling after a server-action
  // redirect is unreliable in the App Router anyway.
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
    redirect(`/points?error=${encodeURIComponent(t(await getLang(), 'pt.chooseAmount'))}`);
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
          : // issue_redemption() raises this when the amount is under the floor.
            // Rephrased for a customer: the database says "minimum redemption is
            // 500 points", which is accurate and reads like an error code.
            raw.startsWith('minimum redemption is')
            ? `You need at least ${raw.replace(/\D/g, '')} points to spend any.`
            : raw || t(await getLang(), 'pt.codeFailed'),
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
  searchParams: Promise<{ error?: string; claimed?: string; welcome?: string; password?: string }>;
}) {
  const lang = await getLang();
  // requireMember, not currentMember: it also bounces anyone who arrived by a
  // one-time code and has not chosen a password yet.
  const member = await requireMember();

  const { error, claimed, welcome, password } = await searchParams;

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
    `select t.id, t.delta, t.reason, t.note, t.created_at,
            r.name_en as reward, r.name_ar as reward_ar
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
  const live = await queryOne<{
    token: string;
    points: number;
    expires_at: Date;
    reward_name: string | null;
    reward_name_ar: string | null;
  }>(
    `select t.token, t.points, t.expires_at,
            r.name_en as reward_name, r.name_ar as reward_name_ar
       from redemption_tokens t
       left join rewards r on r.id = t.reward_id
      where t.customer_id = $1 and t.redeemed_at is null and t.expires_at > now()`,
    [member.id],
  );
  const activeCode: ActiveCode | null = live
    ? {
        token: live.token,
        points: live.points,
        qrSvg: await qrSvg(live.token),
        expiresAt: new Date(live.expires_at).toISOString(),
        // Resolved here rather than passing both names into the client panel:
        // the language is a server concern and the panel only needs the answer.
        rewardName: lang === 'ar' && live.reward_name_ar ? live.reward_name_ar : live.reward_name,
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

  // The floor on spending points off a bill. Read here rather than hardcoded in
  // the panel so changing it in the admin portal changes what the customer is
  // told, in the same breath as changing what the database will allow.
  const minRedeem =
    (await queryOne<{ min_redeem_points: number }>(
      'select min_redeem_points from loyalty_settings',
    ))?.min_redeem_points ?? 0;

  /**
   * The redeem card, held in a variable because WHERE it goes depends on whether
   * a code is live.
   *
   * ⚠ A live code has a three-minute countdown, so it is the most urgent thing
   * on the page by a wide margin. It goes FIRST while it lasts, above the
   * balance and the member QR. Anything else is a scroll away from a customer
   * standing at a till with a cashier waiting.
   *
   * This replaced a `#redeem` anchor on the post-claim redirect. Hash scrolling
   * after a server-action redirect is unreliable in the App Router, and even
   * when it worked the customer watched the page jump past a full-height QR
   * card to get there. Putting the card where it needs to be read beats
   * scrolling to it.
   */
  const redeemCard = (
    <div className="card" id="redeem">
      <h2>
        {activeCode?.rewardName
          ? tf(lang, 'pt.yourThing', { what: activeCode.rewardName })
          : activeCode
            ? t(lang, 'pt.yourCode')
            : t(lang, 'pt.spendTitle')}
      </h2>
      {activeCode ? null : (
        <p className="muted" style={{ fontSize: 13.5, marginBlockStart: 0 }}>
          {t(lang, 'pt.spendLede')}
        </p>
      )}
          <RedeemPanel
            minRedeem={minRedeem}
            balance={member.balance}
            active={activeCode}
            lang={lang}
            issue={issueCode}
            cancel={cancelCode}
          />
        </div>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            STACKD<span>.</span>
          </span>
          {/* Anchors rather than routes: the portal is one page today, so these
              jump within it. They become real links when ordering arrives. */}
          {/* `title` on each: below 560px the words are hidden and only the
              glyph shows, so the tooltip is the only thing left naming it. */}
          <nav className="main">
            <a href="#balance" title={t(lang, 'nav.points')}>
              <IconPoints />
              <span>{t(lang, 'nav.points')}</span>
            </a>
            <a href="#code" title={t(lang, 'nav.myCode')}>
              <IconQr />
              <span>{t(lang, 'nav.myCode')}</span>
            </a>
            <a href="#rewards" title={t(lang, 'nav.rewards')}>
              <IconRewards />
              <span>{t(lang, 'nav.rewards')}</span>
            </a>
          </nav>
          <LangSwitch lang={lang} />
          <form action={signOut}>
            <SubmitButton className="quiet" pendingLabel="…">
              <IconSignOut />
              {t(lang, 'nav.signOut')}
            </SubmitButton>
          </form>
        </div>
      </header>

      <main>
        {welcome ? (
          <div className="banner ok">
            {t(lang, 'pt.welcome')}
          </div>
        ) : null}
        {password ? (
          <div className="banner ok">
            {t(lang, 'pw.saved')}
          </div>
        ) : null}
        {claimed ? (
          <div className="banner ok">
            {t(lang, 'pt.claimedBanner')}
          </div>
        ) : null}
        {error ? <div className="banner bad">{error}</div> : null}

        {/* A live code goes above everything. See the note on `redeemCard`. */}
        {activeCode ? redeemCard : null}

        <div className="balance" id="balance">
          <div className="k">{t(lang, 'pt.title')}</div>
          <div className="n num">{member.balance}</div>
          <div className="sub">
            {member.lifetimeEarned} earned since you joined
            {next ? ` · ${next.points_cost - member.balance} more for ${next.name_en}` : ''}
          </div>
        </div>

        {/*
          ⚠ TWO SCANNABLE CODES ON ONE SCREEN, MEANING OPPOSITE THINGS. The
          member code identifies the customer so a bill ADDS points; the
          redemption code SPENDS them. A cashier with a queue reads a phone, not
          a label, so while a redemption is live this card collapses and the
          screen carries exactly one code.

          It collapses rather than disappearing because giving points for a bill
          needs the member code (see creditBill on the admin scan page). A
          customer redeeming AND earning on the same purchase would otherwise
          have to cancel the code, get scanned, and claim again.

          `<details>` rather than a toggle component: it is native, accessible,
          and works with no JavaScript at all, which is the right dependency for
          something a customer opens on shop wifi at a counter.
        */}
        <details className="card member-card" id="code" open={!activeCode}>
          <summary>
            {activeCode ? t(lang, 'pt.showMyCode') : t(lang, 'pt.showCounter')}
          </summary>
          <div className="member-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="member-code mono">{member.memberCode}</p>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {t(lang, 'pt.scannedNote')}
          </p>

          {wallet.googleUrl || wallet.appleAvailable ? (
            <div className="wallet-row">
              {wallet.appleAvailable ? (
                <a className="wallet-btn" href="/wallet/apple">
                  <AppleMark />
                  <span>
                    <small>{t(lang, 'pt.addTo')}</small>
                    Apple Wallet
                  </span>
                </a>
              ) : null}
              {wallet.googleUrl ? (
                <a className="wallet-btn" href={wallet.googleUrl}>
                  <GoogleMark />
                  <span>
                    <small>{t(lang, 'pt.addTo')}</small>
                    Google Wallet
                  </span>
                </a>
              ) : null}
            </div>
          ) : null}

          <InstallButton lang={lang} />
        </details>

        {activeCode ? null : redeemCard}

        <div className="card" id="rewards">
          <h2>{t(lang, 'pt.swapTitle')}</h2>
          {rewards.length === 0 ? (
            <p className="empty">{t(lang, 'pt.noRewards')}</p>
          ) : (
            rewards.map((r) => {
              const affordable = member.balance >= r.points_cost;
              return (
                <div className={`reward${affordable ? '' : ' locked'}`} key={r.id}>
                  <div className="body">
                    <div className="name">
                      {lang === 'ar' && r.name_ar ? r.name_ar : r.name_en}
                    </div>
                    <div className="cost">
                      {/* One string with holes, not a fragment chain: Arabic
                          orders the parts differently and a chain has no order
                          to change. It also left "points" and "off" untranslated
                          and let bidi reorder the line. */}
                      {r.free_item
                        ? tf(lang, 'pt.costFree', {
                            n: r.points_cost,
                            what: r.free_item,
                          })
                        : r.discount_amount
                          ? tf(lang, 'pt.costOff', {
                              n: r.points_cost,
                              sar: formatSar(r.discount_amount),
                            })
                          : tf(lang, 'pt.costPoints', { n: r.points_cost })}
                    </div>
                  </div>
                  {affordable ? (
                    <form action={redeem}>
                      <input type="hidden" name="rewardId" value={r.id} />
                      <SubmitButton className="primary" pendingLabel={t(lang, 'pt.claiming')}>
                        {t(lang, 'pt.claim')}
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="chip">
                      {r.points_cost - member.balance} {t(lang, 'pt.more')}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <h2>{t(lang, 'pt.historyTitle')}</h2>
          {entries.length === 0 ? (
            <p className="empty">
              {t(lang, 'pt.noHistory')}
            </p>
          ) : (
            entries.map((e) => (
              <div className="entry" key={e.id}>
                <div>
                  <div>
                    {t(lang, `rsn.${e.reason}`)}
                    {e.reward ? ` · ${lang === 'ar' && e.reward_ar ? e.reward_ar : e.reward}` : ''}
                  </div>
                  <div className="when">
                    {/* ⚠ The `note` is deliberately NOT shown. It is an audit
                        field written by and for staff, in English, and it
                        carries strings like "Refund: reward claim gave no code
                        (fix 0008) #19" — an internal reference that means
                        nothing to a customer and cannot be translated. The
                        reason and the reward name already say what happened. */}
                    {fmtDate(lang, e.created_at, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
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
          {t(lang, 'pt.orderingSoon')}
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
