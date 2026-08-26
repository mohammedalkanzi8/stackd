import type { Metadata } from 'next';
import Link from 'next/link';
import {
  REWARDS,
  REWARDS_COPY,
  REWARDS_MARK_SVG,
  assertLocale,
  t,
  toArabicDigits, fillRewards } from '@stackd/shared';
import { SloganBand } from '../../components/SloganBand';
import { PORTAL_URL } from '../../portal-url.ts';

export function generateStaticParams() {
  return [{ locale: 'ar' }, { locale: 'en' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const copy = REWARDS_COPY[locale];
  // The rate is built from REWARDS.earnPercent, never typed. A search result
  // and a browser tab promising 10% while the page behind them says 11% is the
  // same stale-number bug, just in the one place nobody thinks to look at.
  const pct = fillRewards(copy.percent, locale, { n: REWARDS.earnPercent });
  return {
    title:
      locale === 'ar'
        ? `مكافآت ستاكد | استرجع ${pct} من كل فاتورة`
        : `STACKD Rewards | ${pct} back on every order`,
    // The offer is the description. Someone deciding from a search result is
    // deciding on the number, not on adjectives.
    description: copy.lead,
  };
}

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const isAr = locale === 'ar';
  const copy = REWARDS_COPY[locale];
  const num = (v: number | string) => (isAr ? toArabicDigits(v) : String(v));

  return (
    <>
      {/* ---- Hero --------------------------------------------------------- */}
      <section className="hero">
        <div className="glow-bg" />
        <div className="wrap rw-hero above">
          <div className="stack">
            <p className="eyebrow">{copy.name}</p>
            {/* The headline carries its own line break — the two halves are a
                claim and its scope, and letting them reflow arbitrarily breaks
                the sense in both languages. */}
            <h1 className="display h-xl rw-headline">
              {copy.headline.split('\n').map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </h1>
            <p className="lede">{copy.lead}</p>
            <div className="link-row">
              <a
                href={`${PORTAL_URL}/registration`}
                className="btn btn-primary btn-cta"
              >
                {copy.joinCta}
              </a>
              <a href={`${PORTAL_URL}/login`} className="btn btn-ghost">
                {copy.signInCta}
              </a>
            </div>
          </div>

          {/* The programme mark, large. Vector and text-free, so it is the same
              artwork the printed poster and the roll-up banner use. */}
          <div
            className="rw-mark"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: REWARDS_MARK_SVG }}
          />
        </div>
      </section>

      <SloganBand locale={locale} />

      {/* ---- Three steps -------------------------------------------------- */}
      <section className="section">
        <div className="wrap">
          {/* `.stack` rather than a loose eyebrow and heading: it is the section
              header pattern the other three pages use, and it carries the gap to
              the block below it, which was an inline clamp here. */}
          <div className="stack reveal">
            <p className="eyebrow">{isAr ? 'ثلاث خطوات' : 'Three steps'}</p>
            <h2 className="display h-lg">{isAr ? 'كيف يشتغل' : 'How it works'}</h2>
          </div>
          <ol className="rw-steps reveal">
            {copy.steps.map((step, i) => (
              <li key={i} className="rw-step">
                <span className="rw-step-n" aria-hidden="true">
                  {num(i + 1)}
                </span>
                <span className="rw-step-t">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- The rate ----------------------------------------------------- */}
      <section className="section">
        {/* The panel is a child of `.wrap`, not `.wrap` itself. Combined, its
            own padding overrode the wrap's gutter, so this was the one block on
            the site that ignored the content margin: 52px wider than every
            other section on desktop, and flush to both screen edges on a phone
            with its rounded corners cut off against them. */}
        <div className="wrap">
          <div className="rw-rate reveal">
            <div className="rw-rate-fig">
              <span className="rw-rate-num">{num(REWARDS.earnPercent)}%</span>
              <span className="rw-rate-lbl">{isAr ? 'ترجع لك' : 'comes back'}</span>
            </div>
            <div className="rw-rate-fig">
              <span className="rw-rate-num">{num(REWARDS.pointsPerRiyal)}</span>
              <span className="rw-rate-lbl">
                {isAr ? 'نقطة = ١ ريال خصم' : 'points = 1 SAR off'}
              </span>
            </div>
            <div className="rw-rate-fig">
              <span className="rw-rate-num">{num(12)}</span>
              <span className="rw-rate-lbl">{isAr ? 'شهراً صلاحية' : 'months to spend'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="checker" role="presentation" />

      {/* ---- What you get ------------------------------------------------- */}
      <section className="section">
        <div className="wrap">
          <div className="grid reveal">
            {copy.points.map((p) => (
              <div className="card" key={p.title}>
                {/* ⚠ THE TITLE IS FILLED TOO. It carries {p} — "{p} back, not a
                    discount" — and was previously printed raw, which is exactly
                    how the literal "10%" survived here after the rate moved to
                    11%. A heading is as much copy as a paragraph. */}
                <h2 className="card-name">
                  {fillRewards(p.title, locale, {
                    n: REWARDS.minRedeemPoints,
                    p: REWARDS.earnPercent,
                  })}
                </h2>
                {/* Both tokens come from REWARDS, which sync:menu writes from
                    loyalty_settings at build time: {n} the redemption floor,
                    {p} the earn rate. Filling them here rather than baking the
                    numbers into the copy is what lets a change made in the
                    admin portal reach this page. */}
                <p className="card-desc">
                  {fillRewards(p.body, locale, {
                    n: REWARDS.minRedeemPoints,
                    p: REWARDS.earnPercent,
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Close -------------------------------------------------------- */}
      <section className="section">
        <div className="wrap stack rw-close reveal">
          <h2 className="display h-lg">{copy.subhead}</h2>
          <div className="link-row link-row-center">
            <a href={`${PORTAL_URL}/registration`} className="btn btn-primary btn-cta">
              {copy.joinCta}
            </a>
            <Link href={`/${locale}/menu/`} className="btn btn-ghost">
              {t(locale, 'hero.viewMenu')}
            </Link>
          </div>
          {/* ⚠ FILLED, NOT PRINTED. The terms name the earn basis, and that is
              a setting — REWARDS.earnExcludesVat, written here by sync:menu. A
              bare {copy.fine} would leave a raw {v} in the small print. */}
          <p className="rw-fine">
            {fillRewards(copy.fine, locale, { v: REWARDS.earnExcludesVat })}
          </p>
        </div>
      </section>
    </>
  );
}
