import { SubmitButton } from '@/app/SubmitButton.tsx';
import { formatSar, parseRiyals, query, queryOne, toRiyalInput } from '@stackd/server';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';

import { getLang } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';

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
  image_url: string | null;
  photo_note: string | null;
  show_photos: boolean;
}

/**
 * Where item photos live.
 *
 * They are static build assets, not blobs in a column: the website is a static
 * export, so every image has to be a real file under apps/web/public/ at build
 * time. That is why this writes to the other app's folder — and why a new photo
 * needs `npm run build` before anyone sees it.
 */
/**
 * Where an uploaded photograph is written.
 *
 * ⚠ THE RELATIVE PATH IS ONLY CORRECT IN DEVELOPMENT. `npm run admin` runs with
 * cwd `apps/admin`, so `../web/public/menu` lands where the website's build
 * reads it. The container's WorkingDir is `/app`, where the same expression
 * resolves to `/web/public/menu` — a directory outside the bind mount that
 * mkdir happily creates, so uploads succeeded, wrote nowhere useful, vanished on
 * the next rebuild, and left `image_url` pointing at a file the site does not
 * have.
 *
 * The env var is the deployment's answer and the relative path is the local
 * one; neither guesses.
 */
/**
 * Magic-byte check: does the file actually contain what its extension claims?
 *
 * Deliberately narrow. It is not trying to be a virus scanner — it is closing
 * the gap between "the browser said image/webp" and "the bytes are an image",
 * which is the difference between an upload form and an arbitrary-file-write
 * into a directory that gets published to the public website.
 */
function looksLikeImage(b: Buffer, ext: string): boolean {
  if (b.length < 12) return false;
  // PNG: \x89PNG\r\n\x1a\n
  if (ext === 'png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  // JPEG: FF D8 FF, and it must end FF D9
  if (ext === 'jpg' || ext === 'jpeg') {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  // WebP is a RIFF container: 'RIFF' <size> 'WEBP'
  if (ext === 'webp') {
    return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

const PHOTO_DIR =
  process.env.STACKD_PHOTO_DIR ?? path.resolve(process.cwd(), '../web/public/menu');

/** webp first — that is what the eight existing photos are. */
const ALLOWED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const MAX_BYTES = 4 * 1024 * 1024;

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
  await requireRole(...ADMIN);

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
    fail(err instanceof Error ? err.message : t(await getLang(), 'err.badPrice'));
  }

  // Empty means "we know the printed figure is wrong and will not publish it" —
  // which is why the drinks are null. Zero is a real value (water). They are not
  // the same thing, so an empty box must not become 0.
  let calories: number | null = null;
  if (caloriesRaw !== '') {
    const n = Number(caloriesRaw);
    if (!Number.isInteger(n) || n < 0) fail(t(await getLang(), 'err.calWhole'));
    calories = n;
  }

  const rows = await query<{ name_en: string }>(
    `update menu_items
        set price = $2, calories = $3, spicy = $4, is_active = $5
      where id = $1
      returning name_en`,
    [id, price, calories, spicy, isActive],
  );
  if (rows.length === 0) fail(t(await getLang(), 'err.noItem'));

  await query(
    `insert into branch_menu_availability (branch_id, menu_item_id, is_available)
     select b.id, $1, $2 from branches b
     on conflict (branch_id, menu_item_id)
       do update set is_available = excluded.is_available`,
    [id, available],
  );

  done(`Saved ${rows[0].name_en}.`);
}

/**
 * Replaces an item's photo.
 *
 * Named by slug, so uploading again overwrites in place and no stale file is
 * left behind. The filename carries no user input at all — a slug comes from the
 * database and matches [a-z0-9-], which is what keeps a crafted upload from
 * escaping the folder.
 */
async function uploadPhoto(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...ADMIN);

  const id = String(formData.get('id') ?? '');
  const file = formData.get('photo');

  const item = await queryOne<{ slug: string; name_en: string; image_url: string | null }>(
    'select slug, name_en, image_url from menu_items where id = $1',
    [id],
  );
  if (!item) fail(t(await getLang(), 'err.noItem'));
  if (!/^[a-z0-9-]+$/.test(item.slug)) fail(t(await getLang(), 'err.badSlug'));

  if (!(file instanceof File) || file.size === 0) fail(t(await getLang(), 'err.pickImage'));
  const ext = ALLOWED[file.type];
  if (!ext) fail(`${file.type || 'That file'} is not an image we can use. Try webp, jpg or png.`);
  if (file.size > MAX_BYTES) {
    fail(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 4 MB.`);
  }

  // ⚠ `file.type` IS CLIENT-SUPPLIED and was the only check. Anyone with an
  // Admin account could send arbitrary bytes labelled image/webp and have them
  // written into the website's public folder, published to stackd.com.sa by the
  // next auto-publish. Verify the actual container instead of the claim.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(bytes, ext)) {
    fail('That file is not a real image. Re-export it as webp, jpg or png.');
  }

  await mkdir(PHOTO_DIR, { recursive: true });
  const filename = `${item.slug}.${ext}`;
  await writeFile(path.join(PHOTO_DIR, filename), bytes);

  // Uploading a jpg over an existing webp would otherwise leave the old file
  // sitting in public/ forever, still served to anyone with the URL.
  const previous = item.image_url?.split('/').pop();
  if (previous && previous !== filename) {
    await unlink(path.join(PHOTO_DIR, previous)).catch(() => {});
  }

  await query('update menu_items set image_url = $2, photo_note = $3 where id = $1', [
    id,
    `/menu/${filename}`,
    `Uploaded through the admin portal on ${new Date().toISOString().slice(0, 10)}.`,
  ]);

  done(`New photo for ${item.name_en}. Run npm run sync:menu and rebuild to publish it.`);
}

async function removePhoto(formData: FormData): Promise<void> {
  'use server';
  await requireRole(...ADMIN);

  const id = String(formData.get('id') ?? '');
  const item = await queryOne<{ name_en: string; image_url: string | null }>(
    'select name_en, image_url from menu_items where id = $1',
    [id],
  );
  if (!item) fail(t(await getLang(), 'err.noItem'));

  const filename = item.image_url?.split('/').pop();
  if (filename && /^[a-z0-9-]+\.(webp|jpg|png)$/.test(filename)) {
    await unlink(path.join(PHOTO_DIR, filename)).catch(() => {});
  }
  await query('update menu_items set image_url = null, photo_note = null where id = $1', [id]);
  done(`${item.name_en} is back to the branded placeholder.`);
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const lang = await getLang();
  const staff = await requireStaff();
  const { ok, error, edit } = await searchParams;
  const canEdit = ADMIN.includes(staff.role);

  const items = await query<Item>(`
    select mi.id, mi.slug, mi.name_en, mi.name_ar, mi.price, mi.calories,
           mi.spicy, mi.is_active, mi.category_id, mi.sort_order,
           mi.image_url, mi.photo_note,
           c.name_en as category, c.slug as category_slug, c.show_photos,
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
      <p className="eyebrow">{t(lang, 'mnu.title')}</p>
      <h1>{t(lang, 'mnu.heading')}</h1>
      <p className="lede">{t(lang, 'mnu.lede')}<code>seed.sql</code>. The Arabic came off STACKD&rsquo;s own menu board
        and posters, and is not something to retype from here.
      </p>

      <div className="banner note">
        <b>{t(lang, 'mnu.notLive')}</b> Run{' '}
        <code>npm run sync:menu</code> to regenerate <code>menu.ts</code>, then{' '}
        <code>npm run deploy</code>. Until both run, the site keeps showing the old
        price.
      </div>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      {editing && canEdit ? (
        <div className="card">
          <h2>
            {editing.name_en}{' '}
            <span className="mono muted sm">
              {editing.slug}
            </span>
          </h2>
          <p className="lede">
            <span dir="rtl" lang="ar">
              {editing.name_ar}
            </span>{' '}
            · {editing.category}
          </p>

          <form action={saveItem} className="stack" key={editing.id}>
            <input type="hidden" name="id" value={editing.id} />
            <div className="row">
              <div className="field field-sm">
                <label htmlFor="price">{t(lang, 'mnu.price')}<span className="hint">{t(lang, 'mnu.sarVat')}</span>
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
                <label htmlFor="calories">{t(lang, 'mnu.calories')}<span className="hint">blank = unknown</span>
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
                  <label htmlFor="spicy" style={{ margin: 0 }}>{t(lang, 'mnu.spicy')}</label>
                </span>
                <span className="check">
                  <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    defaultChecked={editing.is_active}
                  />
                  <label htmlFor="isActive" style={{ margin: 0 }}>{t(lang, 'mnu.onMenu')}</label>
                </span>
                <span className="check">
                  <input
                    id="available"
                    name="available"
                    type="checkbox"
                    defaultChecked={editing.available}
                  />
                  <label htmlFor="available" style={{ margin: 0 }}>{t(lang, 'mnu.inStock')}</label>
                </span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              <b>{t(lang, 'mnu.onMenu')}</b> removes the item from the website entirely.{' '}
              <b>{t(lang, 'mnu.inStock')}</b> keeps it listed but marks it sold out at the branch.
            </p>
            <div className="row">
              <button type="submit" className="primary">{t(lang, 'a.save')}</button>
              <a className="btn" href="/menu">{t(lang, 'a.cancel')}</a>
            </div>
          </form>

          <hr style={{ border: 0, borderBlockStart: '1px solid var(--rule)', margin: '20px 0' }} />

          <h2 style={{ fontSize: 15 }}>{t(lang, 'mnu.photo')}</h2>
          {!editing.show_photos ? (
            <p className="muted sm">
              {editing.category} are text cards on the website. A 3 SAR sauce does
              not earn a photo, and seventeen placeholder tiles read as unfinished.
              An image uploaded here would be stored but never shown.
            </p>
          ) : null}

          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: '0 0 180px' }}>
              {editing.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/photo/${editing.slug}?v=${Date.now()}`}
                  alt={editing.name_en}
                  style={{
                    width: 180,
                    aspectRatio: '4 / 3',
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '1px solid var(--rule)',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 180,
                    aspectRatio: '4 / 3',
                    borderRadius: 6,
                    border: '1px dashed var(--rule-strong)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--faint)',
                    fontSize: 13,
                  }}
                >{t(lang, 'mnu.noPhoto')}</div>
              )}
            </div>

            <div className="field">
              <form action={uploadPhoto} className="stack">
                <input type="hidden" name="id" value={editing.id} />
                <div>
                  <label htmlFor="photo">{t(lang, 'mnu.replaceIt')}<span className="hint">webp, jpg or png, under 4 MB</span>
                  </label>
                  <input
                    id="photo"
                    name="photo"
                    type="file"
                    accept="image/webp,image/jpeg,image/png"
                    required
                  />
                </div>
                <div className="row">
                  <SubmitButton className="primary" pendingLabel={`${t(lang, 'mnu.uploading')}…`}>
                    {t(lang, 'mnu.upload')}
                  </SubmitButton>
                  {editing.image_url ? (
                    <button type="submit" formAction={removePhoto} className="quiet">{t(lang, 'mnu.removePhoto')}</button>
                  ) : null}
                </div>
              </form>

              <p className="muted" style={{ fontSize: 13, marginBlockStart: 12 }}>
                <b>{t(lang, 'mnu.cropNote')}</b> Anything else is cropped to fit
                and you lose control of what gets cut. The file is saved into{' '}
                <code>apps/web/public/menu/</code> as <code>{editing.slug}.webp</code>{' '}
                . It reaches the site on the next <code>npm run build</code>, not
                immediately.
              </p>
              {editing.photo_note ? (
                <p className="muted sm">
                  <b>{t(lang, 'mnu.photoNote')}</b> {editing.photo_note}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {categories.map(([slug, name]) => (
        <div className="card" key={slug}>
          <h2 style={{ marginBlockEnd: 12 }}>{name}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'pts.item')}</th>
                  <th>{t(lang, 'mnu.arabic')}</th>
                  <th className="right">{t(lang, 'pts.price')}</th>
                  <th className="right">kcal</th>
                  <th className="right">{t(lang, 'ord.status')}</th>
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
                        {i.spicy ? <span className="chip hot">{t(lang, 'mnu.spicy')}</span> : null}
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
                          <span className="chip off">{t(lang, 'mnu.offMenu')}</span>
                        ) : !i.available ? (
                          <span className="chip warn">{t(lang, 'mnu.soldOut')}</span>
                        ) : (
                          <span className="chip on">{t(lang, 'mnu.live')}</span>
                        )}
                      </td>
                      {canEdit ? (
                        <td className="right">
                          <a className="btn" href={`?edit=${i.id}`}>{t(lang, 'a.edit')}</a>
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
        <p className="muted">{t(lang, 'mnu.onlyManager')}</p>
      ) : null}
    </>
  );
}
