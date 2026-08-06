import { formatSar, query, queryOne } from '@stackd/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { MANAGERIAL, requireRole, requireStaff } from '@/lib/auth.ts';

export const metadata = { title: 'Points · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Settings {
  points_per_riyal: string;
  expiry_months: number;
  claim_window_days: number;
  signup_bonus: number;
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
  await requireRole(...MANAGERIAL);

  const rate = Number(String(formData.get('pointsPerRiyal') ?? '').trim());
  const expiry = Number(String(formData.get('expiryMonths') ?? '').trim());
  const claimDays = Number(String(formData.get('claimWindowDays') ?? '').trim());
  const signup = Number(String(formData.get('signupBonus') ?? '').trim());

  if (!Number.isFinite(rate) || rate < 0) fail('Points per riyal must be zero or more.');
  if (!Number.isInteger(expiry) || expiry < 1) fail('Expiry must be at least one month.');
  if (!Number.isInteger(claimDays) || claimDays < 1) fail('The claim window must be at least a day.');
  if (!Number.isInteger(signup) || signup < 0) fail('The sign-up bonus cannot be negative.');

  await query(
    `update loyalty_settings
        set points_per_riyal = $1, expiry_months = $2,
            claim_window_days = $3, signup_bonus = $4, updated_at = now()`,
    [rate, expiry, claimDays, signup],
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
  await requireRole(...MANAGERIAL);

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
  const canEdit = MANAGERIAL.includes(staff.role);

  const settings = (await queryOne<Settings>('select * from loyalty_settings'))!;
  const items = await query<ItemRow>(`
    select mi.id, mi.slug, mi.name_en, mi.price, mi.points_award,
           c.name_en as category, c.slug as category_slug,
           points_for_amount(mi.price, 0.15, s.points_per_riyal) as by_value
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

      <div className="card" style={{ marginBlockEnd: 22 }}>
        <h2>The programme</h2>
        <p className="lede" style={{ marginBlockEnd: 16 }}>
          These apply to every order from the moment you save. Points already
          earned are untouched. The ledger is a record of what was, not a formula.
        </p>

        {canEdit ? (
          <form action={saveSettings} className="stack">
            <div className="row">
              <div className="field field-sm">
                <label htmlFor="pointsPerRiyal">Points per riyal</label>
                <input
                  id="pointsPerRiyal"
                  name="pointsPerRiyal"
                  type="number"
                  step="0.25"
                  min="0"
                  required
                  defaultValue={Number(settings.points_per_riyal)}
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
              <button type="submit" className="primary">
                Save
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              At {Number(settings.points_per_riyal)} per riyal a {formatSar(6000)} ticket
              earns{' '}
              <b>{Math.floor((6000 - Math.round(6000 - 6000 / 1.15)) / 100 * Number(settings.points_per_riyal))}</b>{' '}
              points, on the net, not the gross.
            </p>
          </form>
        ) : (
          <p className="muted">
            {Number(settings.points_per_riyal)} per riyal · expires after{' '}
            {settings.expiry_months} months idle · bill QR lasts{' '}
            {settings.claim_window_days} days. Only a manager or the owner can change
            these.
          </p>
        )}
      </div>

      <div className="spread" style={{ marginBlockEnd: 12 }}>
        <h2>Points per dish</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {overridden} of {items.length} overridden
        </span>
      </div>

      {categories.map(([slug, name]) => (
        <div className="card" style={{ marginBlockEnd: 16 }} key={slug}>
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

      <p className="muted" style={{ fontSize: 13 }}>
        Leave the box empty to earn by value. Enter <code>0</code> to make an item
        earn nothing at all. They are not the same thing.
      </p>
    </>
  );
}
