import { formatSar, query, queryOne } from '@stackd/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { SUPER_ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';

export const metadata = { title: 'Points · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Settings {
  earn_percent: string;
  expiry_months: number;
  claim_window_days: number;
  redeem_window_secs: number;
  signup_bonus: number;
  min_redeem_points: number;
}

interface ItemRow {
  id: string;
  slug: string;
  name_en: string;
  price: number;
  points_award: number | null;
  category: string;
  category_slug: string;
  by_value: number;
}

const BACK = '/points';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

async function saveSettings(formData: FormData): Promise<void> {
  'use server';
  // Super Admin only, on the owner's instruction (12 Aug 2026). These five
  // numbers set what every riyal spent in the shop is worth; changing the earn
  // rate reprices the whole programme retroactively for everyone still holding
  // a balance.
  await requireRole(...SUPER_ADMIN);

  const percent = Number(String(formData.get('earnPercent') ?? '').trim());
  const expiry = Number(String(formData.get('expiryMonths') ?? '').trim());
  const claimDays = Number(String(formData.get('claimWindowDays') ?? '').trim());
  const redeemSecs = Number(String(formData.get('redeemWindowSecs') ?? '').trim());
  const signup = Number(String(formData.get('signupBonus') ?? '').trim());
  const minRedeem = Number(String(formData.get('minRedeemPoints') ?? '').trim());

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    fail('The earn rate must be a percentage between 0 and 100.');
  }
  if (!Number.isInteger(expiry) || expiry < 1) fail('Expiry must be at least one month.');
  if (!Number.isInteger(claimDays) || claimDays < 1) fail('The claim window must be at least a day.');
  if (!Number.isInteger(redeemSecs) || redeemSecs < 30 || redeemSecs > 3600) {
    fail('A redemption code must last between 30 seconds and an hour.');
  }
  if (!Number.isInteger(signup) || signup < 0) fail('The sign-up bonus cannot be negative.');
  if (!Number.isInteger(minRedeem) || minRedeem < 0) {
    fail('The minimum redemption cannot be negative. Use 0 for no minimum.');
  }

  await query(
    `update loyalty_settings
        set earn_percent = $1, expiry_months = $2, claim_window_days = $3,
            redeem_window_secs = $4, signup_bonus = $5, min_redeem_points = $6,
            updated_at = now()`,
    [percent, expiry, claimDays, redeemSecs, signup, minRedeem],
  );
  done('Programme settings saved.');
}

/**
 * Sets or clears an item's fixed award.
 *
 * Blank means "earn by value at the rate above", which is not the same as zero —
 * zero is a deliberate "this earns nothing", which is what you want on a bottle
 * of water you do not wish to subsidise.
 */
async function saveAward(formData: FormData): Promise<void> {
  'use server';
  // Super Admin only — a per-item award is the same lever as the earn rate,
  // pointed at one dish.
  await requireRole(...SUPER_ADMIN);

  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('award') ?? '').trim();

  let award: number | null = null;
  if (raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) fail('Points must be a whole number, or left blank.');
    award = n;
  }

  const rows = await query<{ name_en: string }>(
    'update menu_items set points_award = $2 where id = $1 returning name_en',
    [id, award],
  );
  if (rows.length === 0) fail('That item no longer exists.');
  done(
    award === null
      ? `${rows[0].name_en} now earns by value.`
      : `${rows[0].name_en} is worth ${award} points.`,
  );
}

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const { ok, error } = await searchParams;
  const canEdit = SUPER_ADMIN.includes(staff.role);

  const settings = (await queryOne<Settings>('select * from loyalty_settings'))!;
  const items = await query<ItemRow>(`
    select mi.id, mi.slug, mi.name_en, mi.price, mi.points_award,
           c.name_en as category, c.slug as category_slug,
           points_for_amount(mi.price, s.earn_percent) as by_value
      from menu_items mi
      join categories c on c.id = mi.category_id
      cross join loyalty_settings s
     where mi.is_active
     order by c.sort_order, mi.sort_order
  `);

  const categories = [...new Map(items.map((i) => [i.category_slug, i.category])).entries()];
  const overridden = items.filter((i) => i.points_award !== null).length;

  return (
    <>
      <p className="eyebrow">Loyalty</p>
      <h1>How points are earned</h1>
      <p className="lede">
        By default every riyal spent earns points at the rate below, on the pre-VAT
        net. Any dish can override that with a flat number, the lever for pushing
        one item without discounting it.
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card">
        <h2>The programme</h2>
        <p className="lede">
          These apply to every order from the moment you save. Points already
          earned are untouched. The ledger is a record of what was, not a formula.
        </p>
        <p className="lede">
          <b>Min redemption</b> is the fewest points a customer may take off a
          bill in one go — 500 points is 5.00 SAR. It does not apply to the
          rewards below, which are already priced individually; Free Sauce at 300
          stays claimable. The website states this figure in its own copy, so a
          change here needs the site deployed with it.
        </p>

        {canEdit ? (
          <form action={saveSettings} className="stack">
            <div className="row">
              <div className="field field-sm">
                <label htmlFor="earnPercent">
                  Earn rate <span className="hint">% of the bill</span>
                </label>
                <input
                  id="earnPercent"
                  name="earnPercent"
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  required
                  defaultValue={Number(settings.earn_percent)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="signupBonus">Sign-up bonus</label>
                <input
                  id="signupBonus"
                  name="signupBonus"
                  type="number"
                  step="1"
                  min="0"
                  required
                  defaultValue={settings.signup_bonus}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="minRedeemPoints">
                  Min redemption <span className="hint">points, 0 = none</span>
                </label>
                <input
                  id="minRedeemPoints"
                  name="minRedeemPoints"
                  type="number"
                  step="1"
                  min="0"
                  required
                  defaultValue={settings.min_redeem_points}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="expiryMonths">
                  Expiry <span className="hint">months idle</span>
                </label>
                <input
                  id="expiryMonths"
                  name="expiryMonths"
                  type="number"
                  step="1"
                  min="1"
                  required
                  defaultValue={settings.expiry_months}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="claimWindowDays">
                  Bill QR lasts <span className="hint">days</span>
                </label>
                <input
                  id="claimWindowDays"
                  name="claimWindowDays"
                  type="number"
                  step="1"
                  min="1"
                  required
                  defaultValue={settings.claim_window_days}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="redeemWindowSecs">
                  Redeem QR lasts <span className="hint">seconds</span>
                </label>
                <input
                  id="redeemWindowSecs"
                  name="redeemWindowSecs"
                  type="number"
                  step="30"
                  min="30"
                  max="3600"
                  required
                  defaultValue={settings.redeem_window_secs}
                />
              </div>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              <b>One point is one halala.</b> At {Number(settings.earn_percent)}% a{' '}
              {formatSar(11500)} bill earns{' '}
              <b>{Math.floor((11500 * Number(settings.earn_percent)) / 100)}</b> points,
              worth {formatSar(Math.floor((11500 * Number(settings.earn_percent)) / 100))}{' '}
              off a later bill. The basis is the total paid, VAT included, so a
              customer can check it against their own receipt.
            </p>
          </form>
        ) : (
          <p className="muted">
            {Number(settings.earn_percent)}% back · expires after{' '}
            {settings.expiry_months} months idle · bill QR lasts{' '}
            {settings.claim_window_days} days · redeem QR lasts{' '}
            {settings.redeem_window_secs} seconds. Only a manager or the owner can
            change these.
          </p>
        )}
      </div>

      <div className="spread">
        <h2>Points per dish</h2>
        <span className="muted sm">
          {overridden} of {items.length} overridden
        </span>
      </div>

      {categories.map(([slug, name]) => (
        <div className="card" key={slug}>
          <h2 style={{ marginBlockEnd: 12, fontSize: 15 }}>{name}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="right">Price</th>
                  <th className="right">Earns by value</th>
                  <th className="right">Fixed award</th>
                  {canEdit ? <th className="right"></th> : null}
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.category_slug === slug)
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <b>{i.name_en}</b>
                      </td>
                      <td className="right num muted">{formatSar(i.price)}</td>
                      <td className="right num muted">
                        {i.points_award === null ? i.by_value : <s>{i.by_value}</s>}
                      </td>
                      <td className="right">
                        {canEdit ? (
                          <form action={saveAward} className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <input type="hidden" name="id" value={i.id} />
                            <input
                              name="award"
                              type="number"
                              min="0"
                              step="1"
                              placeholder="by value"
                              defaultValue={i.points_award ?? ''}
                              style={{ width: 96, textAlign: 'end' }}
                              aria-label={`Fixed points for ${i.name_en}`}
                            />
                            <button type="submit">Set</button>
                          </form>
                        ) : i.points_award === null ? (
                          <span className="muted">by value</span>
                        ) : (
                          <b className="num">{i.points_award}</b>
                        )}
                      </td>
                      {canEdit ? (
                        <td className="right">
                          {i.points_award !== null ? (
                            <span className="chip on">fixed</span>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="muted sm">
        Leave the box empty to earn by value. Enter <code>0</code> to make an item
        earn nothing at all. They are not the same thing.
      </p>
    </>
  );
}
