import type { ReactNode } from 'react';
import {
  REWARDS_COPY,
  REWARDS_MARK_SVG,
  fillRewards,
  otherLocale,
  rewardsNumber,
  type Locale,
} from '@stackd/shared';


/**
 * The printed artefact. One component for all four sizes AND both languages.
 *
 * `lead` decides which language carries the headline; the other follows
 * underneath at a smaller size. Both sheets stay bilingual either way, because
 * a monolingual sign in Al Khobar excludes half the people walking past it —
 * the choice is which language a given piece speaks first, not which language
 * it speaks.
 *
 * Everything on the sheet is sized in `em` against a root of `width / 30`,
 * which `sheet-css.ts` sets. That is what lets one design serve a 105 mm
 * counter card and an 850 mm banner. ⚠ Do not put a fixed px or mm value
 * inside the sheet: it breaks three of the four sizes, and only on paper.
 *
 * No photography, by decision. The only food images available are Instagram
 * crops upscaled roughly 3x (see STATUS.md §4); at A3 they would be visibly
 * soft and on an 850 mm banner they would be a mess. Type, the brand marks and
 * flat colour all print perfectly at any size.
 */
export function Poster({
  lead,
  qrSvg,
  url,
  earnPercent,
  earnExcludesVat,
  signupBonus,
}: {
  /** Which language speaks first. The other still appears, smaller. */
  lead: Locale;
  /** Pre-rendered SVG for the registration URL. Vector, so it stays sharp. */
  qrSvg: string;
  url: string;
  /** Read from loyalty_settings, so paper cannot outlive a change to the rate. */
  earnPercent: number;
  /**
   * Whether the rate is taken on the pre-VAT net. Also from loyalty_settings,
   * and for the same reason: the terms at the foot of the sheet name the basis,
   * and a printed banner is the hardest surface in the business to correct.
   */
  earnExcludesVat: boolean;
  signupBonus: number;
}) {
  const sub = otherLocale(lead);
  const a = REWARDS_COPY[lead];
  const b = REWARDS_COPY[sub];
  const rtl = (l: Locale) => (l === 'ar' ? 'rtl' : 'ltr');

  return (
    <div className="sheet" lang={lead} dir={rtl(lead)}>
      {/* The wordmark is the light-on-dark cut, because this sheet is dark. */}
      <img className="ph-logo" src="/brand/logo.svg" alt="" />

      <div
        className="ph-mark"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: REWARDS_MARK_SVG }}
      />

      {/* Both names, always, in a fixed order so the two language versions of a
          size are recognisably the same piece side by side. Split into two spans
          so only the Latin half gets letter-spacing — tracking Arabic pulls its
          cursive joins open into gaps mid-word. */}
      <p className="ph-name">
        <span lang="ar" dir="rtl">
          {REWARDS_COPY.ar.name}
        </span>
        <span aria-hidden="true">·</span>
        <span className="ph-name-latin" lang="en" dir="ltr">
          STACKD REWARDS
        </span>
      </p>

      {/* ⚠ THE HEADLINE ITSELF IS FILLED, not just the token used to find the
          offer inside it. It previously said "10%" literally while the token
          was built from the live rate, so raising the rate to 11% made the two
          disagree: highlight() searched for "11%" in a line reading "10%",
          found nothing, and printed the stale figure with no gold on it. Both
          now come from the same fill, so they cannot drift apart again. */}
      <h1 className="ph-h1">
        {highlight(
          fillRewards(a.headline, lead, { p: earnPercent }),
          fillRewards(a.percent, lead, { n: earnPercent }),
        )}
      </h1>

      {/*
        lang + dir on every run in the other language. Without it the bidi
        algorithm treats trailing full stops as neutral and resolves them to the
        paragraph direction, so an English line inside an RTL sheet prints with
        its period stranded on the left.
      */}
      <p className="ph-h2" lang={sub} dir={rtl(sub)}>
        {lines(fillRewards(b.headline, sub, { p: earnPercent }))}
      </p>

      <div className="ph-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />

      <p className="ph-scan">{a.scanCta}</p>
      <p className="ph-scan-sub" lang={sub} dir={rtl(sub)}>
        {b.scanCta}
      </p>

      <ol className="ph-steps">
        {a.steps.map((step, i) => (
          <li className="ph-step" key={i}>
            <span className="ph-step-n" aria-hidden="true">
              {rewardsNumber(lead, i + 1)}
            </span>
            <span className="ph-step-t">
              {step}
              <small lang={sub} dir={rtl(sub)}>
                {b.steps[i]}
              </small>
            </span>
          </li>
        ))}
      </ol>

      <div className="ph-foot">
        <p className="ph-rate">
          {a.rate}{' '}
          <span lang={sub} dir={rtl(sub)}>
            · {b.rate}
          </span>
        </p>

        {/* A joining bonus is the strongest line on the sheet when there is one,
            so it is not buried in the small print. It disappears entirely when
            the bonus is zero rather than printing "0 points". */}
        {signupBonus > 0 ? (
          <p className="ph-rate">
            {fillRewards(a.bonus, lead, { n: signupBonus })}{' '}
            <span lang={sub} dir={rtl(sub)}>
              · {fillRewards(b.bonus, sub, { n: signupBonus })}
            </span>
          </p>
        ) : null}

        {/* The address in text as well as in the code. Someone whose camera will
            not focus, or who is reading this from across the room, still has a
            way in. */}
        <p className="ph-url">{displayUrl(url)}</p>

        <p className="ph-fine">
          {fillRewards(a.fine, lead, { v: earnExcludesVat })}
          <br />
          <span lang={sub} dir={rtl(sub)}>
            {fillRewards(b.fine, sub, { v: earnExcludesVat })}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Sets the offer itself in gold, leaving the rest of the headline white.
 *
 * Works off the token rather than a hard-coded string, so the copy stays in
 * `packages/shared`, the number stays whatever the database says, and each
 * language keeps its own numerals.
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
