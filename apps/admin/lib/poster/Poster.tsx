import type { ReactNode } from 'react';
import { REWARDS_COPY, REWARDS_MARK_SVG, toArabicDigits } from '@stackd/shared';

import type { Format } from './formats.ts';

/**
 * The printed artefact. One component for all four sizes — the layout is
 * identical and only the root font-size differs, which `sheet-css.ts` sets.
 *
 * Bilingual with Arabic leading. That ordering is the same call made everywhere
 * else in this system: the restaurant is in Al Khobar, Arabic is the default
 * locale, and English is the second voice rather than a co-equal translation.
 *
 * No photography, by decision. The only food images available are Instagram
 * crops upscaled roughly 3x (see STATUS.md §4); at A3 they would be visibly
 * soft, and on an 850 mm banner they would be a mess. Type, the brand marks and
 * flat colour all print perfectly at any size.
 */
export function Poster({
  format,
  qrSvg,
  url,
  earnPercent,
  signupBonus,
}: {
  format: Format;
  /** Pre-rendered SVG for the registration URL. Vector, so it stays sharp. */
  qrSvg: string;
  url: string;
  /** Read from loyalty_settings, so paper cannot outlive a change to the rate. */
  earnPercent: number;
  signupBonus: number;
}) {
  const ar = REWARDS_COPY.ar;
  const en = REWARDS_COPY.en;

  return (
    <div className="sheet" lang="ar" dir="rtl">
      {/* The wordmark is the light-on-dark cut, because this sheet is dark. */}
      <img className="ph-logo" src="/brand/logo.svg" alt="" />

      <div
        className="ph-mark"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: REWARDS_MARK_SVG }}
      />

      <p className="ph-name">
        {ar.name} · STACKD REWARDS
      </p>

      <h1 className="ph-ar">
        {highlight(ar.headline, `${toArabicDigits(earnPercent)}٪`)}
      </h1>
      {/* lang + dir on every English run inside this RTL sheet. Without it the
          bidi algorithm treats the trailing full stop as neutral and resolves
          it to the paragraph direction, so "Every single order." prints with
          the period stranded on the left. */}
      <p className="ph-en" lang="en" dir="ltr">
        {lines(en.headline)}
      </p>

      <div className="ph-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />

      <p className="ph-scan">{ar.scanCta}</p>
      <p className="ph-scan-en" lang="en" dir="ltr">
        {en.scanCta}
      </p>

      <ol className="ph-steps">
        {ar.steps.map((step, i) => (
          <li className="ph-step" key={i}>
            <span className="ph-step-n" aria-hidden="true">
              {toArabicDigits(i + 1)}
            </span>
            <span className="ph-step-t">
              {step}
              <small lang="en" dir="ltr">
                {en.steps[i]}
              </small>
            </span>
          </li>
        ))}
      </ol>

      <div className="ph-foot">
        <p className="ph-rate">
          {ar.rate} <span>· {en.rate}</span>
        </p>
        {/* A joining bonus is the strongest line on the sheet when there is one,
            so it is not buried in the small print. It disappears entirely when
            the bonus is zero rather than printing "0 points". */}
        {signupBonus > 0 ? (
          <p className="ph-rate">
            {toArabicDigits(signupBonus)} نقطة هدية عند التسجيل{' '}
            <span>· {signupBonus} points just for joining</span>
          </p>
        ) : null}
        <p className="ph-url">{displayUrl(url)}</p>
        <p className="ph-fine">
          {ar.fine}
          <br />
          <span lang="en" dir="ltr">
            {en.fine}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Sets the offer itself in gold, leaving the rest of the headline white.
 *
 * Works off the token rather than a hard-coded string so the copy stays in
 * `packages/shared` and the number stays whatever the database says.
 */
function highlight(headline: string, token: string): ReactNode {
  return headline.split('\n').map((line, i) => {
    const at = line.indexOf(token);
    return (
      <span key={i} style={{ display: 'block' }}>
        {at === -1 ? (
          line
        ) : (
          <>
            {line.slice(0, at)}
            <span className="ph-pct">{token}</span>
            {line.slice(at + token.length)}
          </>
        )}
      </span>
    );
  });
}

/**
 * Renders the copy's own line breaks as blocks.
 *
 * Both headlines break where the sense breaks, in both languages. Letting them
 * reflow to the sheet's width puts the fold in a different place on each of the
 * four sizes, and on the A6 card it lands mid-phrase.
 */
function lines(headline: string): ReactNode {
  return headline.split('\n').map((line, i) => (
    <span key={i} style={{ display: 'block' }}>
      {line}
    </span>
  ));
}

/** `https://my.stackd.com.sa/registration` reads better without the scheme. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
