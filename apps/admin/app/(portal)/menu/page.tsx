import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { MANAGERIAL, requireRole, requireStaff } from '@/lib/auth.ts';
import { query } from '@/lib/db.ts';
import { formatSar, parseRiyals, toRiyalInput } from '@/lib/money.ts';

export const metadata = { title: 'Menu · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Item {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  price: number;
  calories: number | null;
  spicy: boolean;
  is_active: boolean;
  available: boolean;
  category_id: string;
  category: string;
  category_slug: string;
  sort_order: number;
}

const BACK = '/menu';

function fail(message: string): never {
  redirect(`${BACK}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(BACK);
  redirect(`${BACK}?ok=${encodeURIComponent(message)}`);
}

/**
 * Edits price, calories, heat and availability for one item.
 *
 * Names and descriptions are deliberately not editable here. They are bilingual,
 * the Arabic came off STACKD's own menu board and launch posters, and getting one
 * wrong from a laptop is a worse outcome than the inconvenience of editing
 * seed.sql. Prices and calories change often and are unambiguous.
 */
async function saveItem(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...MANAGERIAL);

  const id = String(formData.get('id') ?? '');
  const priceRaw = String(formData.get('price') ?? '').trim();
  const caloriesRaw = String(formData.get('calories') ?? '').trim();
  const spicy = formData.get('spicy') === 'on';
  const isActive = formData.get('isActive') === 'on';
  const available = formData.get('available') === 'on';

  let price: number;
  try {
    price = parseRiyals(priceRaw);
  } catch (err) {
    fail(err instanceof Error ? err.message : 'That price is not an amount.');
  }

  // Empty means "we know the printed figure is wrong and will not publish it" —
  // which is why the drinks are null. Zero is a real value (water). They are not
  // the same thing, so an empty box must not become 0.
  let calories: number | null = null;
  if (caloriesRaw !== '') {
    const n = Number(caloriesRaw);
    if (!Number.isInteger(n) || n < 0) fail('Calories must be a whole number, or left blank.');
    calories = n;
  }

  const rows = await query<{ name_en: string }>(
    `update menu_items
        set price = $2, calories = $3, spicy = $4, is_active = $5
      where id = $1
      returning name_en`,
    [id, price, calories, spicy, isActive],
  );
  if (rows.length === 0) fail('That item no longer exists.');

  await query(
    `insert into branch_menu_availability (branch_id, menu_item_id, is_available)
     select b.id, $1, $2 from branches b
     on conflict (branch_id, menu_item_id)
       do update set is_available = excluded.is_available`,
    [id, available],
  );

  done(`Saved ${rows[0].name_en}.`);
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const staff = await requireStaff();
  const { ok, error, edit } = await searchParams;
  const canEdit = MANAGERIAL.includes(staff.role);

  const items = await query<Item>(`
    select mi.id, mi.slug, mi.name_en, mi.name_ar, mi.price, mi.calories,
           mi.spicy, mi.is_active, mi.category_id, mi.sort_order,
           c.name_en as category, c.slug as category_slug,
           coalesce(a.is_available, true) as available
      from menu_items mi
      join categories c on c.id = mi.category_id
      left join branch_menu_availability a on a.menu_item_id = mi.id
     order by c.sort_order, mi.sort_order
  `);

  const editing = edit ? items.find((i) => i.id === edit) : undefined;
  const categories = [...new Map(items.map((i) => [i.category_slug, i.category])).entries()];

  return (
    <>
      <p className="eyebrow">Menu</p>
      <h1>Prices and availability</h1>
      <p className="lede">
        The database is the source of truth for the website. Names stay in{' '}
        <code>seed.sql</code> — the Arabic came off STACKD&rsquo;s own menu board
        and posters, and is not something to retype from here.
      </p>

      <div className="banner note">
        <b>Changes here do not reach the live site on their own.</b> Run{' '}
        <code>npm run sync:menu</code> to regenerate <code>menu.ts</code>, then{' '}
        <code>npm run deploy</code>. Until both run, the site keeps showing the old
        price.
      </div>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      {editing && canEdit ? (
        <div className="card" style={{ marginBlockEnd: 22 }}>
          <h2>
            {editing.name_en}{' '}
            <span className="mono muted" style={{ fontSize: 13 }}>
              {editing.slug}
            </span>
          </h2>
          <p className="lede" style={{ marginBlockEnd: 16 }}>
            <span dir="rtl" lang="ar">
              {editing.name_ar}
            </span>{' '}
            · {editing.category}
          </p>

          <form action={saveItem} className="stack" key={editing.id}>
            <input type="hidden" name="id" value={editing.id} />
            <div className="row">
              <div className="field field-sm">
                <label htmlFor="price">
                  Price <span className="hint">SAR, VAT included</span>
                </label>
                <input
                  id="price"
                  name="price"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={toRiyalInput(editing.price)}
                />
              </div>
              <div className="field field-sm">
                <label htmlFor="calories">
                  Calories <span className="hint">blank = unknown</span>
                </label>
                <input
                  id="calories"
                  name="calories"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={editing.calories ?? ''}
                />
              </div>
              <div className="field" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <span className="check">
                  <input id="spicy" name="spicy" type="checkbox" defaultChecked={editing.spicy} />
                  <label htmlFor="spicy" style={{ margin: 0 }}>
                    Spicy
                  </label>
                </span>
                <span className="check">
                  <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    defaultChecked={editing.is_active}
                  />
                  <label htmlFor="isActive" style={{ margin: 0 }}>
                    On the menu
                  </label>
                </span>
                <span className="check">
                  <input
                    id="available"
                    name="available"
                    type="checkbox"
                    defaultChecked={editing.available}
                  />
                  <label htmlFor="available" style={{ margin: 0 }}>
                    In stock
                  </label>
                </span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              <b>On the menu</b> removes the item from the website entirely.{' '}
              <b>In stock</b> keeps it listed but marks it sold out at the branch.
            </p>
            <div className="row">
              <button type="submit" className="primary">
                Save
              </button>
              <a className="btn" href="/menu">
                Cancel
              </a>
            </div>
          </form>
        </div>
      ) : null}

      {categories.map(([slug, name]) => (
        <div className="card" style={{ marginBlockEnd: 16 }} key={slug}>
          <h2 style={{ marginBlockEnd: 12 }}>{name}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Arabic</th>
                  <th className="right">Price</th>
                  <th className="right">kcal</th>
                  <th className="right">Status</th>
                  {canEdit ? <th className="right"></th> : null}
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.category_slug === slug)
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <b>{i.name_en}</b>{' '}
                        {i.spicy ? <span className="chip hot">Spicy</span> : null}
                      </td>
                      <td dir="rtl" lang="ar">
                        {i.name_ar}
                      </td>
                      <td className="right num">{formatSar(i.price)}</td>
                      <td className="right num">
                        {i.calories === null ? (
                          <span className="chip warn" title="Printed value is known to be wrong">
                            unknown
                          </span>
                        ) : (
                          i.calories
                        )}
                      </td>
                      <td className="right">
                        {!i.is_active ? (
                          <span className="chip off">Off menu</span>
                        ) : !i.available ? (
                          <span className="chip warn">Sold out</span>
                        ) : (
                          <span className="chip on">Live</span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className="right">
                          <a className="btn" href={`?edit=${i.id}`}>
                            Edit
                          </a>
                        </td>
                      ) : null}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!canEdit ? (
        <p className="muted">Only a manager or the owner can change prices.</p>
      ) : null}
    </>
  );
}
