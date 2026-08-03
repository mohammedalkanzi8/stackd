import Link from 'next/link';
import {
  BRAND,
  BRANCH,
  MENU,
  formatAmount,
  t,
  assertLocale,
  toArabicDigits,
} from '@stackd/shared';
import { OpenStatus } from '../components/OpenStatus';
import { SloganBand } from '../components/SloganBand';
import { CardMedia } from '../components/CardMedia';

export function generateStaticParams() {
  return [{ locale: 'ar' }, { locale: 'en' }];
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const isAr = locale === 'ar';
  const num = (v: number | string) => (isAr ? toArabicDigits(v) : String(v));

  // Big-Stackd sits in the MIDDLE, not first — it is the hero item and the
  // centre column is where the eye lands in a three-up grid. The gradient
  // treatment follows the slug rather than the index for the same reason.
  const HERO_SLUG = 'big-stackd';
  const featured = ['scoopy-doo', HERO_SLUG, 'fire-attack']
    .map((slug) => MENU.flatMap((c) => c.items).find((i) => i.slug === slug)!)
    .filter(Boolean);

  return (
    <>
      {/* ---- Hero -------------------------------------------------------- */}
      <section className="hero">
        <div className="glow-bg" />
        <div className="wrap hero-grid above">
          <div className="hero-copy">
            <h1 className="display h-xl hero-title">
              {isAr ? (
                <>
                  دجاج <span className="accent">مرصوص</span>
                  <br />
                  بإتقان
                </>
              ) : (
                <>
                  Chicken,
                  <br />
                  <span className="accent">Stacked</span> Right.
                </>
              )}
            </h1>

            <p className="hero-sub">{isAr ? BRAND.taglineAr : BRAND.taglineEn}</p>
            <p className="hero-slogan">{isAr ? BRAND.sloganAr : BRAND.sloganEn}</p>

            <div className="hero-actions">
              <Link href={`/${locale}/menu/`} className="btn btn-primary">
                {t(locale, 'hero.viewMenu')}
              </Link>
              <a href={`tel:${BRANCH.phone}`} className="btn btn-ghost">
                {t(locale, 'visit.call')}
              </a>
              <OpenStatus locale={locale} />
            </div>
          </div>

          <div className="hero-art">
            <img src="/brand/rooster.svg" alt="" width={636} height={884} aria-hidden="true" />
          </div>
        </div>
      </section>

      <SloganBand locale={locale} />

      {/* ---- Signatures --------------------------------------------------- */}
      <section className="section">
        <div className="wrap">
          <div className="stack reveal">
            <p className="eyebrow">{isAr ? 'الأكثر طلباً' : 'Most ordered'}</p>
            <h2 className="display h-lg">{isAr ? 'ابدأ من هنا' : 'Start Here'}</h2>
            <p className="lede lede-1">
              {isAr
                ? 'ثلاثة أطباق تختصر ستاكد، ابدأ بواحد منها.'
                : 'Three dishes that sum us up, start with one of these.'}
            </p>
          </div>

          <div className="grid reveal" style={{ marginBlockStart: 26 }}>
            {featured.map((item) => (
              <article
                className={`card${item.slug === HERO_SLUG ? ' card-feature' : ''}`}
                key={item.slug}
              >
                <CardMedia item={item} locale={locale} />
                <div className="card-top">
                  <h3 className="card-name">{isAr ? item.nameAr : item.nameEn}</h3>
                  <span className="price">
                    {formatAmount(item.price)}
                    <small>SAR</small>
                  </span>
                </div>
                <p className="card-desc">{isAr ? item.descAr : item.descEn}</p>
                <div className="tags">
                  {item.calories !== null && (
                    <span className="tag">
                      {num(item.calories)} {t(locale, 'menu.calories')}
                    </span>
                  )}
                  {item.spicy && (
                    <span className="tag tag-spicy">{t(locale, 'menu.spicy')}</span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="link-row link-row-center" style={{ marginBlockStart: 30 }}>
            <Link href={`/${locale}/menu/`} className="btn btn-primary btn-cta">
              {t(locale, 'hero.viewMenu')}
              <svg
                className="btn-arrow"
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Late night --------------------------------------------------- */}
      <section className="section">
        <div className="wrap">
          <div className="night reveal">
            <p className="eyebrow" style={{ color: 'var(--gold-soft)' }}>
              {isAr ? 'كل أيام الأسبوع' : 'Seven days a week'}
            </p>
            <div className="clock">
              <span className="clock-t">3 PM</span>
              <span className="clock-sep">{isAr ? 'حتى' : 'until'}</span>
              <span className="clock-t">3 AM</span>
            </div>
            <p className="lede">
              {isAr
                ? 'مفتوحين لين الثالثة فجراً. متى ما جاك الجوع، إحنا موجودين.'
                : 'Open until three in the morning. Whenever the craving lands, we are still open.'}
            </p>
            <div className="link-row" style={{ marginBlockStart: 24 }}>
              <a
                href={BRANCH.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ borderColor: 'rgba(254,254,254,0.4)', color: 'var(--paper)' }}
              >
                {t(locale, 'visit.directions')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Loyalty ------------------------------------------------------ */}
      <section className="section">
        <div className="wrap loyal reveal">
          <div className="stack">
            <p className="eyebrow">{t(locale, 'loyalty.title')}</p>
            <h2 className="display h-lg">
              {isAr ? 'كل ريال يرجع لك' : 'Every Riyal Comes Back'}
            </h2>
            <p className="lede">{t(locale, 'loyalty.lead')}</p>
            <span className="status" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
              {t(locale, 'loyalty.comingSoon')}
            </span>
          </div>
          <div className="ring" aria-hidden="true">
            <div className="ring-inner">
              <span className="ring-num">{num(1)}</span>
              <span className="ring-lbl">{isAr ? 'نقطة / ريال' : 'Point / Riyal'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="checker" role="presentation" />

      {/* ---- Visit -------------------------------------------------------- */}
      <section className="section">
        <div className="wrap">
          <div className="stack reveal">
            <p className="eyebrow">{isAr ? 'المكان' : 'Find us'}</p>
            <h2 className="display h-lg">{t(locale, 'visit.title')}</h2>
          </div>

          <div className="info reveal">
            <div className="card">
              <h3 className="info-title">{t(locale, 'visit.address')}</h3>
              <p>{isAr ? BRANCH.addressAr : BRANCH.addressEn}</p>
              <div className="link-row">
                <a
                  href={BRANCH.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  {t(locale, 'visit.directions')}
                </a>
              </div>
            </div>

            <div className="card">
              <h3 className="info-title">{t(locale, 'visit.phone')}</h3>
              <span className="info-big">{BRANCH.phoneDisplay}</span>
              <div className="link-row">
                <a href={`tel:${BRANCH.phone}`} className="btn btn-primary btn-sm">
                  {t(locale, 'visit.call')}
                </a>
              </div>
            </div>

            <div className="card">
              <h3 className="info-title">{t(locale, 'visit.hours')}</h3>
              <div className="hours-row">
                <span>{t(locale, 'visit.everyDay')}</span>
                <span className="hours-time">3 PM – 3 AM</span>
              </div>
              <div className="link-row">
                <OpenStatus locale={locale} />
              </div>
            </div>
          </div>

          <div className="link-row" style={{ marginBlockStart: 24 }}>
            <Link href={`/${locale}/visit/`} className="btn btn-ghost btn-sm">
              {t(locale, 'nav.visit')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
