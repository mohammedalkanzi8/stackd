import { formatSar, query, queryOne } from '@stackd/server';
import { pointsForAmount } from '@stackd/shared';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { SUPER_ADMIN, requireRole, requireStaff } from '@/lib/auth.ts';

import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';

export const metadata = { title: 'Points · STACKD admin' };
export const dynamic = 'force-dynamic';

interface Settings {
  earn_percent: string;
  /** false: the rate is taken on the total paid. true: on the pre-VAT net. */
  earn_excludes_vat: boolean;
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
  // Super Admin only, on the owner's instruction (12 Aug 2026). These numbers
  // set what every riyal spent in the shop is worth; changing the earn rate
  // reprices the whole programme retroactively for everyone still holding a
  // balance.
  await requireRole(...SUPER_ADMIN);

  const percent = Number(String(formData.get('earnPercent') ?? '').trim());
  // ⚠ COMPARED AGAINST 'net', NOT COERCED WITH Boolean(). A select posts a
  // string, and every non-empty string is truthy — Boolean(formData.get(...))
  // would read "incl" as "exclude the VAT" and quietly cut the programme by a
  // seventh with no error anywhere.
  const exclVat = String(formData.get('earnBasis') ?? 'incl').trim() === 'net';
  const expiry = Number(String(formData.get('expiryMonths') ?? '').trim());
  const claimDays = Number(String(formData.get('claimWindowDays') ?? '').trim());
  const redeemSecs = Number(String(formData.get('redeemWindowSecs') ?? '').trim());
  const signup = Number(String(formData.get('signupBonus') ?? '').trim());
  const minRedeem = Number(String(formData.get('minRedeemPoints') ?? '').trim());

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    fail(t(await getLang(), 'err.earnPct'));
  }
  if (!Number.isInteger(expiry) || expiry < 1) fail(t(await getLang(), 'err.expiryMin'));
  if (!Number.isInteger(claimDays) || claimDays < 1) fail(t(await getLang(), 'err.claimMin'));
  if (!Number.isInteger(redeemSecs) || redeemSecs < 30 || redeemSecs > 3600) {
    fail('A redemption code must last between 30 seconds and an hour.');
  }
  if (!Number.isInteger(signup) || signup < 0) fail(t(await getLang(), 'err.bonusNeg'));
  if (!Number.isInteger(minRedeem) || minRedeem < 0) {
    fail(t(await getLang(), 'err.minRedeemNeg'));
  }

  await query(
    `update loyalty_settings
        set earn_percent = $1, expiry_months = $2, claim_window_days = $3,
            redeem_window_secs = $4, signup_bonus = $5, min_redeem_points = $6,
            earn_excludes_vat = $7, updated_at = now()`,
    [percent, expiry, claimDays, redeemSecs, signup, minRedeem, exclVat],
  );
  done(t(await getLang(), 'err.saved'));
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
    if (!Number.isInteger(n) || n < 0) fail(t(await getLang(), 'err.pointsWhole'));
    award = n;
  }

  const rows = await query<{ name_en: string }>(
    'update menu_items set points_award = $2 where id = $1 returning name_en',
    [id, award],
  );
  if (rows.length === 0) fail(t(await getLang(), 'err.noItem'));
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
  const lang = await getLang();
  const staff = await requireStaff();
  const { ok, error } = await searchParams;
  const canEdit = SUPER_ADMIN.includes(staff.role);

  const settings = (await queryOne<Settings>('select * from loyalty_settings'))!;
  const items = await query<ItemRow>(`
    select mi.id, mi.slug, mi.name_en, mi.price, mi.points_award,
           c.name_en as category, c.slug as category_slug,
           -- On the live basis, so this column and the till never disagree.
           points_for_amount(mi.price, s.earn_percent, s.earn_excludes_vat) as by_value
      from menu_items mi
      join categories c on c.id = mi.category_id
      cross join loyalty_settings s
     where mi.is_active
     order by c.sort_order, mi.sort_order
  `);

  // A 115.00 SAR bill, which is 100.00 net plus its VAT.
  const example = pointsForAmount(11500, Number(settings.earn_percent), {
    excludeVat: settings.earn_excludes_vat,
  });

  const categories = [...new Map(items.map((i) => [i.category_slug, i.category])).entries()];
  const overridden = items.filter((i) => i.points_award !== null).length;

  return (
    <>
      <p className="eyebrow">{t(lang, 'pts.eyebrow')}</p>
      <h1>{t(lang, 'pts.heading')}</h1>
      <p className="lede">{t(lang, 'pts.lede')}</p>

      {ok ? <div className="banner ok">{ok}</div> : null}
      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card">
        <h2>{t(lang, 'pts.programme')}</h2>
        <p className="lede">{t(lang, 'pts.programmeLede')}</p>
        <p className="lede">{t(lang, 'pts.minRedeemLede')}</p>

        {canEdit ? (
          <form action={saveSettings} className="stack">
            <div className="row">
              <div className="field field-sm">
                <label htmlFor="earnPercent">
                  {t(lang, 'pts.earnPercent')} <span className="hint">{t(lang, 'pts.pctOfBill')}</span>
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
              <div className="field">
                <label htmlFor="earnBasis">
                  {t(lang, 'pts.earnBasis')} <span className="hint">{t(lang, 'pts.basisHint')}</span>
                </label>
                {/* Menu prices are VAT-inclusive, so these two are not the same
                    money: at 15% VAT the net basis pays about 13% less. */}
                <select
                  id="earnBasis"
                  name="earnBasis"
                  defaultValue={settings.earn_excludes_vat ? 'net' : 'incl'}
                >
                  <option value="incl">{t(lang, 'pts.basisIncl')}</option>
                  <option value="net">{t(lang, 'pts.basisExcl')}</option>
                </select>
              </div>
              <div className="field field-sm">
                <label htmlFor="signupBonus">{t(lang, 'pts.signupBonus')}</label>
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
                  {t(lang, 'pts.minRedemption')} <span className="hint">{t(lang, 'pts.pointsZeroNone')}</span>
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
                  {t(lang, 'pts.expiry')} <span className="hint">{t(lang, 'pts.monthsIdle')}</span>
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
                  {t(lang, 'pts.billQrLasts')} <span className="hint">{t(lang, 'pts.days')}</span>
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
                  {t(lang, 'pts.redeemQrLasts')} <span className="hint">{t(lang, 'pts.seconds')}</span>
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
                {t(lang, 'a.save')}
              </button>
            </div>
            {/* ⚠ THE EXAMPLE IS COMPUTED, NOT WRITTEN. It uses the same
                pointsForAmount() the till earns through, so the sentence under
                the form cannot promise a number the database would not mint.
                The 115.00 bill is chosen because it is 100.00 plus its VAT:
                both bases land on a round figure. */}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {tf(lang, settings.earn_excludes_vat ? 'pts.halalaNoteExcl' : 'pts.halalaNoteIncl', {
                pct: Number(settings.earn_percent),
                bill: formatSar(11500),
                pts: example,
                worth: formatSar(example),
              })}
            </p>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {t(lang, 'pts.basisNote')}
            </p>
          </form>
        ) : (
          <p className="muted">
            {tf(lang, 'pts.readOnly', {
              pct: Number(settings.earn_percent),
              basis: t(lang, settings.earn_excludes_vat ? 'pts.basisExcl' : 'pts.basisIncl'),
              months: settings.expiry_months,
              days: settings.claim_window_days,
              secs: settings.redeem_window_secs,
            })}
          </p>
        )}
      </div>

      <div className="spread">
        <h2>{t(lang, 'pts.perDish')}</h2>
        <span className="muted sm">
          {overridden} {t(lang, 'pts.of')} {items.length} {t(lang, 'pts.overridden')}
        </span>
      </div>

      {categories.map(([slug, name]) => (
        <div className="card" key={slug}>
          <h2 style={{ marginBlockEnd: 12, fontSize: 15 }}>{name}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t(lang, 'pts.item')}</th>
                  <th className="right">{t(lang, 'pts.price')}</th>
                  <th className="right">{t(lang, 'pts.earnsByValue')}</th>
                  <th className="right">{t(lang, 'pts.fixedAward')}</th>
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
                              placeholder={t(lang, 'pts.byValue')}
                              defaultValue={i.points_award ?? ''}
                              style={{ width: 118, textAlign: 'end' }}
                              aria-label={`Fixed points for ${i.name_en}`}
                            />
                            <button type="submit">{t(lang, 'pts.set')}</button>
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

      <p className="muted sm">{t(lang, 'pts.emptyNote')}</p>
    </>
  );
}
