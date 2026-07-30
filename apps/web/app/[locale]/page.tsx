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

  // The three worth leading with: the biggest burger and both Giants.
  const featured = ['big-stackd', 'scoopy-doo', 'fire-attack']
    .map((slug) => MENU.flatMap((c) => c.items).find((i) => i.slug === slug)!)
    .filter(Boolean);

  const num = (v: number | string) => (isAr ? toArabicDigits(v) : String(v));

  return (
    <>
      {/* ---- Hero: the wordmark performs the stacking -------------------- */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              {t(locale, 'hero.est')} · {isAr ? BRANCH.cityAr : BRANCH.cityEn}
            </p>

            {/* Three layers of one word. The visible text is aria-hidden and the
                accessible name comes from the heading's label, so a screen
                reader hears "STACKD" once rather than three times. */}
            <h1 className="stack-mark" aria-label={isAr ? BRAND.nameAr : BRAND.nameEn}>
              <span className="sm-layer sm-1" aria-hidden="true">
                {isAr ? BRAND.nameAr : BRAND.nameEn}
              </span>
              <span className="sm-layer sm-2" aria-hidden="true">
                {isAr ? BRAND.nameAr : BRAND.nameEn}
              </span>
              <span className="sm-layer sm-3" aria-hidden="true">
                {isAr ? BRAND.nameAr : BRAND.nameEn}
              </span>
            </h1>

            <p className="hero-tagline">{isAr ? BRAND.taglineAr : BRAND.taglineEn}</p>
            <p className="hero-slogan">{isAr ? BRAND.sloganAr : BRAND.sloganEn}</p>

            <div className="hero-actions">
              <Link href={`/${locale}/menu/`} className="btn btn-primary">
                {t(locale, 'hero.viewMenu')}
              </Link>
              <a href={`tel:${BRANCH.phone}`} className="btn btn-outline">
                {t(locale, 'visit.call')}
              </a>
              <OpenStatus locale={locale} />
            </div>
          </div>

          {/* Real brand illustration. There is no food photography yet, and a
              grey placeholder box would read worse than the brand's own art. */}
          <div className="hero-art">
            <img
              src="/brand/rooster.svg"
              alt=""
              width={636}
              height={884}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      <div className="checker" role="presentation" />

      {/* ---- Signatures --------------------------------------------------- */}
      <section className="slab slab-ink">
        <div className="wrap">
          <p className="eyebrow">{isAr ? 'الأكثر طلباً' : 'Most Ordered'}</p>
          <h2 className="slab-title">{isAr ? 'ابدأ من هنا' : 'Start Here'}</h2>

          <div className="signatures">
            {featured.map((item, i) => (
              <article className="sig" key={item.slug}>
                <span className="sig-rank">{num(String(i + 1).padStart(2, '0'))}</span>
                <h3 className="sig-name">{isAr ? item.nameAr : item.nameEn}</h3>
                <p className="sig-desc">{isAr ? item.descAr : item.descEn}</p>
                <span className="sig-price">
                  {formatAmount(item.price)}
                  <small
                    style={{
                      fontSize: '0.3em',
                      letterSpacing: '0.12em',
                      fontWeight: 800,
                      verticalAlign: '0.5em',
                      marginInlineStart: '0.3em',
                      opacity: 0.7,
                    }}
                  >
                    SAR
                  </small>
                </span>
              </article>
            ))}
          </div>

          <div className="link-row" style={{ marginBlockStart: 28 }}>
            <Link href={`/${locale}/menu/`} className="btn btn-outline btn-sm">
              {t(locale, 'hero.viewMenu')}
            </Link>
          </div>
        </div>
      </section>

      <div className="checker" role="presentation" />

      {/* ---- Late night. The 3 AM close is the genuine differentiator, so it
              gets a slab of its own rather than a line in an hours table. --- */}
      <section className="slab slab-red">
        <div className="wrap">
          <p className="eyebrow" style={{ color: 'rgba(254,254,254,0.75)' }}>
            {isAr ? 'كل أيام الأسبوع' : 'Seven days a week'}
          </p>
          <div className="latenight" style={{ marginBlockStart: 16 }}>
            <span className="latenight-num" dir="ltr">3 PM</span>
            <span className="latenight-label">{isAr ? 'حتى' : 'until'}</span>
            <span className="latenight-num" dir="ltr">3 AM</span>
          </div>
          <p className="lede" style={{ marginBlockStart: 22 }}>
            {isAr
              ? 'مفتوحين لين الثالثة فجراً، كل أيام الأسبوع. متى ما جاك الجوع، إحنا موجودين.'
              : 'Open until three in the morning, every day. Whenever the craving lands, we are still open.'}
          </p>
          <div className="link-row" style={{ marginBlockStart: 26 }}>
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
      </section>

      <div className="checker" role="presentation" />

      {/* ---- Loyalty ------------------------------------------------------ */}
      <section className="slab slab-ink">
        <div className="wrap loyalty-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p className="eyebrow">{t(locale, 'loyalty.title')}</p>
            <h2 className="slab-title">
              {isAr ? 'كل ريال يرجع لك' : 'Every Riyal Comes Back'}
            </h2>
            <p className="lede">{t(locale, 'loyalty.lead')}</p>
            <div>
              <span
                className="status"
                style={{ borderColor: 'var(--gold-500)', color: 'var(--gold-500)' }}
              >
                {t(locale, 'loyalty.comingSoon')}
              </span>
            </div>
          </div>
          <div className="points-demo" aria-hidden="true">
            <span className="points-num">{num(1)}</span>
            <span className="points-unit">{isAr ? 'نقطة لكل ريال' : 'point per riyal'}</span>
          </div>
        </div>
      </section>

      <div className="checker" role="presentation" />

      {/* ---- Visit -------------------------------------------------------- */}
      <section className="slab slab-paper">
        <div className="wrap">
          <p className="eyebrow" style={{ color: 'var(--accent)' }}>
            {isAr ? 'المكان' : 'Find us'}
          </p>
          <h2 className="slab-title">{t(locale, 'visit.title')}</h2>

          <div className="info-grid">
            <div className="card">
              <h3 className="card-title">{t(locale, 'visit.address')}</h3>
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
              <h3 className="card-title">{t(locale, 'visit.phone')}</h3>
              <span className="card-big">{BRANCH.phoneDisplay}</span>
              <div className="link-row">
                <a href={`tel:${BRANCH.phone}`} className="btn btn-primary btn-sm">
                  {t(locale, 'visit.call')}
                </a>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">{t(locale, 'visit.hours')}</h3>
              <div className="hours-row">
                <span>{t(locale, 'visit.everyDay')}</span>
                <span className="hours-time">3 PM – 3 AM</span>
              </div>
              <div style={{ marginBlockStart: 6 }}>
                <OpenStatus locale={locale} />
              </div>
            </div>
          </div>

          <div className="link-row" style={{ marginBlockStart: 26 }}>
            <Link href={`/${locale}/visit/`} className="btn btn-primary btn-sm">
              {t(locale, 'nav.visit')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
