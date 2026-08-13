import Link from 'next/link';
import { qrSvg, registrationUrl, queryOne } from '@stackd/server';
import { LOCALES, REWARDS_COPY, fillRewards, isLocale, DEFAULT_LOCALE } from '@stackd/shared';

import { requireStaff } from '@/lib/auth.ts';
import { FORMATS, FORMAT_IDS, isFormatId } from '@/lib/poster/formats.ts';
import { Poster } from '@/lib/poster/Poster.tsx';
import { previewScale, sheetCss } from '@/lib/poster/sheet-css.ts';
import '@/app/fonts.generated.css';

import { getLang } from '@/lib/prefs.ts';
import { t, tf } from '@/lib/i18n.ts';

export const metadata = { title: 'Print studio · STACKD admin' };
export const dynamic = 'force-dynamic';

export default async function SignupQrPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; lang?: string }>;
}) {
  // ⚠ `uiLang` is the STAFF INTERFACE language and is a different thing from
  // `lang` below, which is the language of the POSTER being printed. A cashier
  // working in Arabic still prints English-led sheets when that is what the wall
  // needs, so these two must never be collapsed into one variable.
  const uiLang = await getLang();
  await requireStaff();
  const { f: raw, lang } = await searchParams;
  const format = FORMATS[isFormatId(raw) ? raw : 'a3'];
  const lead = lang && isLocale(lang) ? lang : DEFAULT_LOCALE;

  const url = registrationUrl();
  const qr = await qrSvg(url);
  const settings = await queryOne<{ signup_bonus: number; earn_percent: string }>(
    'select signup_bonus, earn_percent from loyalty_settings',
  );
  const earnPercent = Number(settings?.earn_percent ?? 10);

  const onLocalhost = url.includes('localhost');
  const scale = previewScale(format);

  return (
    <>
      <p className="eyebrow">STACKD Rewards</p>
      <h1>{t(uiLang, 'sq.title')}</h1>
      <p className="lede">
        {tf(uiLang, 'sq.lede', {
          pct: fillRewards(REWARDS_COPY[uiLang].percent, uiLang, { n: earnPercent }),
        })}
      </p>

      {onLocalhost ? (
        <div className="banner note">
          <b>{t(uiLang, 'sq.pointsAt')}<code>{url}</code> and will not work on a phone.
          </b>{' '}
          Set <code>STACKD_PORTAL_URL</code> to the portal&rsquo;s real public
          address before sending anything to a printer. Paper cannot be corrected
          afterwards.
        </div>
      ) : null}

      {/* ---- Size picker --------------------------------------------------- */}
      <div className="fmt-row">
        {FORMAT_IDS.map((id) => {
          const item = FORMATS[id];
          const active = item.id === format.id;
          return (
            <Link
              key={id}
              href={`/signup-qr?f=${id}&lang=${lead}`}
              className={`fmt${active ? ' fmt-on' : ''}`}
            >
              <b>{t(uiLang, `fmt.${item.id}`)}</b>
              <span className="mono">
                {item.w} &times; {item.h} mm
              </span>
              <span>{t(uiLang, `fmt.${item.id}.u`)}</span>
            </Link>
          );
        })}
      </div>

      {/* ---- Language ------------------------------------------------------
          Each size prints in two versions. Both carry Arabic AND English; this
          picks which one leads. An Arabic-led sheet for the dining room, an
          English-led one wherever that suits the spot better. */}
      <div className="fmt-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxWidth: 440 }}>
        {LOCALES.map((loc) => (
          <Link
            key={loc}
            href={`/signup-qr?f=${format.id}&lang=${loc}`}
            className={`fmt${loc === lead ? ' fmt-on' : ''}`}
          >
            <b>{loc === 'ar' ? t(uiLang, 'sq.arLeads') : t(uiLang, 'sq.enLeads')}</b>
            <span>
              {loc === 'ar'
                ? t(uiLang, 'sq.arLeadsD')
                : t(uiLang, 'sq.enLeadsD')}
            </span>
          </Link>
        ))}
      </div>

      <div className="row" style={{ marginBlock: 20, alignItems: 'center' }}>
        {/* target=_blank: the print sheet is a separate document, and coming
            back to the picker afterwards should not mean re-choosing a size. */}
        <a
          href={`/print/${format.id}?lang=${lead}`}
          target="_blank"
          rel="noopener"
          className="btn primary"
        >
          {tf(uiLang, 'sq.openFmt', {
            fmt: t(uiLang, `fmt.${format.id}`),
            lead: lead === 'ar' ? t(uiLang, 'sq.arabic') : t(uiLang, 'sq.english'),
          })}
        </a>
        <span className="muted sm">{t(uiLang, 'sq.opensClean')}</span>
      </div>

      {/* ---- Preview -------------------------------------------------------
          The real sheet at its true size, scaled down by CSS transform. There is
          no separate small mockup to keep in sync, so the preview cannot flatter
          the print. */}
      <style dangerouslySetInnerHTML={{ __html: sheetCss(format, scale) }} />
      <div className="sheet-frame">
        <Poster
          lead={lead}
          qrSvg={qr}
          url={url}
          earnPercent={earnPercent}
          signupBonus={settings?.signup_bonus ?? 0}
        />
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <p className="eyebrow">{t(uiLang, 'sq.toPrintShop')}</p>
        <ul className="notes">
          <li>{t(uiLang, 'sq.savePdf')}</li>
          <li>{t(uiLang, 'sq.bleed')}</li>
          <li>{tf(uiLang, 'sq.scanFrom', { r: format.scanRange })}</li>
          {format.id === 'rollup' ? (
            <li>{tf(uiLang, 'sq.footRoom', { n: format.footRoom })}</li>
          ) : null}
          {format.id === 'a5' ? (
            <li>{t(uiLang, 'sq.tableTent')}</li>
          ) : null}
          <li>{t(uiLang, 'sq.bothLangs')}</li>
          <li>{t(uiLang, 'sq.testFirst')}</li>
        </ul>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBlockStart: 18 }}>
        Change the earn rate or the joining bonus on the{' '}
        <Link href="/points">{t(uiLang, 'sq.pointsPage')}</Link> and this artwork follows. Anything
        already printed will not, which is the one thing worth checking before a
        rate change.
      </p>
    </>
  );
}
