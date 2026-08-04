import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { MANAGERIAL, requireRole, requireStaff } from '@/lib/auth.ts';
import { query } from '@/lib/db.ts';
import { formatSar, parseRiyals, toRiyalInput } from '@/lib/money.ts';

export const metadata = { title: 'Rewards · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Reward {
  id: string;
  name_en: string;
  name_ar: string;
  points_cost: number;
  discount_amount: number | null;
  free_item_id: string | null;
  free_item: string | null;
  is_active: boolean;
  redemptions: number;
}

const BACK = '/rewards';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

/**
 * `reward_has_exactly_one_benefit` in the schema means a reward is EITHER a free
 * item OR a flat discount, never both and never neither. The form makes that
 * choice explicit rather than letting someone fill in both and get a constraint
 * violation they cannot interpret.
 */
async function saveReward(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...MANAGERIAL);

  const id = String(formData.get('id') ?? '');
  const nameEn = String(formData.get('nameEn') ?? '').trim();
  const nameAr = String(formData.get('nameAr') ?? '').trim();
  const pointsCost = Number(String(formData.get('pointsCost') ?? '').trim());
  const benefit = String(formData.get('benefit') ?? 'discount');
  const discountRaw = String(formData.get('discount') ?? '').trim();
  const freeItemId = String(formData.get('freeItemId') ?? '').trim();

  if (!nameEn || !nameAr) fail('Both the English and Arabic names are required.');
  if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
    fail('Points cost must be a whole number above zero.');
  }

  let discount: number | null = null;
  let itemId: string | null = null;

  if (benefit === 'item') {
    if (!freeItemId) fail('Pick which item the reward gives away.');
    itemId = freeItemId;
  } else {
    if (!discountRaw) fail('Enter the discount amount in riyals.');
    try {
      discount = parseRiyals(discountRaw);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'That discount is not an amount.');
    }
    if (discount <= 0) fail('The discount must be more than zero.');
  }

  if (id) {
    await query(
      `update rewards
          set name_en = $2, name_ar = $3, points_cost = $4,
              discount_amount = $5, free_item_id = $6
        where id = $1`,
      [id, nameEn, nameAr, pointsCost, discount, itemId],
    );
    done(`Saved “${nameEn}”.`);
  }

  await query(
    `insert into rewards (name_en, name_ar, points_cost, discount_amount, free_item_id)
     values ($1, $2, $3, $4, $5)`,
    [nameEn, nameAr, pointsCost, discount, itemId],
  );
  done(`Added “${nameEn}”.`);
}

/**
 * Rewards are retired, not deleted. A deleted reward would orphan the ledger
 * rows that point at it, and those rows are the record of what a customer
 * actually got for their points.
 */
async function toggleReward(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...MANAGERIAL);

  const id = String(formData.get('id') ?? '');
  const rows = await query<{ name_en: string; is_active: boolean }>(
    `update rewards set is_active = not is_active where id = $1
     returning name_en, is_active`,
    [id],
  );
  if (rows.length === 0) fail('That reward no longer exists.');
  done(`“${rows[0].name_en}” is now ${rows[0].is_active ? 'available' : 'retired'}.`);
}

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const staff = await requireStaff();
  const { ok, error, edit } = await searchParams;
  const canEdit = MANAGERIAL.includes(staff.role);

  const rewards = await query<Reward>(`
    select r.id, r.name_en, r.name_ar, r.points_cost, r.discount_amount,
           r.free_item_id, r.is_active,
           mi.name_en as free_item,
           (select count(*) from loyalty_transactions t where t.reward_id = r.id) as redemptions
      from rewards r
      left join menu_items mi on mi.id = r.free_item_id
     order by r.points_cost
  `);

  const items = await query<{ id: string; name_en: string; price: number }>(
    `select id, name_en, price from menu_items where is_active order by sort_order, name_en`,
  );

  const editing = edit ? rewards.find((r) => r.id === edit) : undefined;

  return (
    <>
      <p className="eyebrow">Loyalty</p>
      <h1>Reward catalogue</h1>
      <p className="lede">
        What points buy. The five seeded rewards are tuned to roughly a 7% return
        at one point per riyal — changing a points cost changes that maths.
      </p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card" style={{ marginBlockEnd: 22 }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reward</th>
                <th>Arabic</th>
                <th className="right">Costs</th>
                <th>Gives</th>
                <th className="right">Redeemed</th>
                <th className="right">Status</th>
                {canEdit ? <th className="right"></th> : null}
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name_en}</b>
                  </td>
                  <td dir="rtl" lang="ar">
                    {r.name_ar}
                  </td>
                  <td className="right num">{r.points_cost}</td>
                  <td>
                    {r.free_item
                      ? `${r.free_item} free`
                      : r.discount_amount
                        ? `${formatSar(r.discount_amount)} off`
                        : '—'}
                  </td>
                  <td className="right num muted">{r.redemptions}</td>
                  <td className="right">
                    <span className={`chip ${r.is_active ? 'on' : 'off'}`}>
                      {r.is_active ? 'Available' : 'Retired'}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <a className="btn" href={`?edit=${r.id}`}>
                        Edit
                      </a>{' '}
                      <form action={toggleReward} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="quiet">
                          {r.is_active ? 'Retire' : 'Restore'}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit ? (
        <div className="card">
          <h2>{editing ? `Edit “${editing.name_en}”` : 'Add a reward'}</h2>
          <p className="lede" style={{ marginBlockEnd: 16 }}>
            A reward gives either a free item or a flat discount — never both.
          </p>

          <form action={saveReward} className="stack" key={editing?.id ?? 'new'}>
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="row">
              <div className="field">
                <label htmlFor="nameEn">Name (English)</label>
                <input
                  id="nameEn"
                  name="nameEn"
                  type="text"
                  required
                  defaultValue={editing?.name_en ?? ''}
                />
              </div>
              <div className="field">
                <label htmlFor="nameAr">Name (Arabic)</label>
                <input
                  id="nameAr"
                  name="nameAr"
                  type="text"
                  required
                  dir="rtl"
                  lang="ar"
                  defaultValue={editing?.name_ar ?? ''}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="pointsCost">Points</label>
                <input
                  id="pointsCost"
                  name="pointsCost"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={editing?.points_cost ?? ''}
                />
              </div>
            </div>

            <div className="row">
              <div className="field field-sm">
                <label htmlFor="benefit">Gives</label>
                <select
                  id="benefit"
                  name="benefit"
                  defaultValue={editing?.free_item_id ? 'item' : 'discount'}
                >
                  <option value="discount">A discount</option>
                  <option value="item">A free item</option>
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="discount">
                  Discount <span className="hint">SAR</span>
                </label>
                <input
                  id="discount"
                  name="discount"
                  type="text"
                  inputMode="decimal"
                  placeholder="9.00"
                  defaultValue={
                    editing?.discount_amount ? toRiyalInput(editing.discount_amount) : ''
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="freeItemId">
                  Free item <span className="hint">— used only if “a free item”</span>
                </label>
                <select id="freeItemId" name="freeItemId" defaultValue={editing?.free_item_id ?? ''}>
                  <option value="">Choose an item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name_en} — {formatSar(i.price)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row">
              <button type="submit" className="primary">
                {editing ? 'Save changes' : 'Add reward'}
              </button>
              {editing ? (
                <a className="btn" href="/rewards">
                  Cancel
                </a>
              ) : null}
            </div>
          </form>
        </div>
      ) : (
        <p className="muted">Only a manager or the owner can change the catalogue.</p>
      )}
    </>
  );
}
