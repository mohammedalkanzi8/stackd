import Link from 'next/link';
import { qrSvg, registrationUrl, queryOne } from '@stackd/server';
import { LOCALES, isLocale, DEFAULT_LOCALE } from '@stackd/shared';

import { requireStaff } from '@/lib/auth.ts';
import { FORMATS, FORMAT_IDS, isFormatId } from '@/lib/poster/formats.ts';
import { Poster } from '@/lib/poster/Poster.tsx';
import { previewScale, sheetCss } from '@/lib/poster/sheet-css.ts';
import '@/app/fonts.generated.css';

export const metadata = { title: 'Print studio · STACKD admin' };
export const dynamic = 'force-dynamic';

export default async function SignupQrPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; lang?: string }>;
}) {
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
      <h1>Print studio</h1>
      <p className="lede">
        The signup artwork, at four sizes. Everything on it is live: the code
        points at the real registration page and the {earnPercent}% is read from
        the Points page, so a printed sheet cannot quietly contradict the system.
      </p>

      {onLocalhost ? (
        <div className="banner note">
          <b>
            This code points at <code>{url}</code> and will not work on a phone.
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
              <b>{item.label}</b>
              <span className="mono">
                {item.w} &times; {item.h} mm
              </span>
              <span>{item.use}</span>
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
            <b>{loc === 'ar' ? 'Arabic leads' : 'English leads'}</b>
            <span>
              {loc === 'ar'
                ? 'Arabic headline, English underneath.'
                : 'English headline, Arabic underneath.'}
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
          Open the {format.label}, {lead === 'ar' ? 'Arabic' : 'English'} first
        </a>
        <span className="muted" style={{ fontSize: 13 }}>
          Opens clean, with no portal chrome. Print from there, or save it as a
          PDF to send to a print shop.
        </span>
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

      <div className="card" style={{ marginBlockStart: 24, maxWidth: 640 }}>
        <p className="eyebrow">Sending this to a print shop</p>
        <ul className="notes">
          <li>
            Save the print sheet as a PDF. The code, the wordmark and the mark are
            all vector, so there is no resolution to get wrong at any size.
          </li>
          <li>
            Ask for <b>3&nbsp;mm bleed</b>. The background is a flat dark fill to
            the edge, so extending it is trivial for them.
          </li>
          <li>
            The code scans from {format.scanRange}. Hang it so it is reachable at
            that distance rather than as high as it will go.
          </li>
          {format.id === 'rollup' ? (
            <li>
              The bottom {format.footRoom}&nbsp;mm is left empty on purpose. That
              stretch rolls into the stand&rsquo;s cassette on most banners, and
              anything printed there is paid for and never seen.
            </li>
          ) : null}
          {format.id === 'a5' ? (
            <li>
              For a table tent, print two of these back to back and fold down the
              middle, or ask the shop for a 148&nbsp;&times;&nbsp;210&nbsp;mm tent
              card carrying this artwork on both faces.
            </li>
          ) : null}
          <li>
            Both language versions are the same artwork with the headline
            languages swapped, so a shop can treat them as one job in two files.
          </li>
          <li>
            Test before the full run: print one on an ordinary printer and scan it
            with a phone that has never seen the portal.
          </li>
        </ul>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBlockStart: 18 }}>
        Change the earn rate or the joining bonus on the{' '}
        <Link href="/points">Points page</Link> and this artwork follows. Anything
        already printed will not, which is the one thing worth checking before a
        rate change.
      </p>
    </>
  );
}
