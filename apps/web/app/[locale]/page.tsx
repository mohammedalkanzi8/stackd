import Link from 'next/link';
import {
  BRAND,
  BRANCH,
  MENU,
  formatPrice,
  t,
  assertLocale,
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

  // Three signature items for the home page: the two Giants and the Big-Stackd.
  const featuredSlugs = ['big-stackd', 'scoopy-doo', 'fire-attack'];
  const featured = MENU.flatMap((c) => c.items).filter((i) =>
    featuredSlugs.includes(i.slug),
  );

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="hero-est">{t(locale, 'hero.est')}</div>
          <h1>{isAr ? BRAND.nameAr : BRAND.nameEn}</h1>
          <p className="hero-tagline">{isAr ? BRAND.taglineAr : BRAND.taglineEn}</p>
          <div className="hero-slogan">{isAr ? BRAND.sloganAr : BRAND.sloganEn}</div>

          <div className="hero-actions">
            <Link href={`/${locale}/menu/`} className="btn btn-primary">
              {t(locale, 'hero.viewMenu')}
            </Link>
            <a href={`tel:${BRANCH.phone}`} className="btn btn-ghost">
              {t(locale, 'visit.call')}
            </a>
          </div>

          <div style={{ marginBlockStart: 30 }}>
            <OpenStatus locale={locale} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="category">
            <div className="category-title">
              {isAr ? 'الأكثر طلباً' : 'Signatures'}
            </div>
            <div className="items">
              {featured.map((item) => (
                <div className="item" key={item.slug}>
                  <div className="item-name">{isAr ? item.nameAr : item.nameEn}</div>
                  <div className="item-price">{formatPrice(item.price, locale)}</div>
                  {(isAr ? item.descAr : item.descEn) && (
                    <div className="item-desc">{isAr ? item.descAr : item.descEn}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="link-row">
              <Link href={`/${locale}/menu/`} className="btn-sm">
                {t(locale, 'hero.viewMenu')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="loyalty">
        <div className="wrap">
          <h2>{t(locale, 'loyalty.title')}</h2>
          <p>{t(locale, 'loyalty.lead')}</p>
          <div className="loyalty-soon">{t(locale, 'loyalty.comingSoon')}</div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 style={{ fontSize: 32 }}>{t(locale, 'visit.title')}</h2>
          <div className="info-grid">
            <div className="card">
              <h2>{t(locale, 'visit.address')}</h2>
              <p>{isAr ? BRANCH.addressAr : BRANCH.addressEn}</p>
              <div className="link-row">
                <a
                  href={BRANCH.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-sm"
                >
                  {t(locale, 'visit.directions')}
                </a>
              </div>
            </div>
            <div className="card">
              <h2>{t(locale, 'visit.phone')}</h2>
              <p dir="ltr" style={{ fontSize: 20, fontWeight: 700 }}>
                {BRANCH.phoneDisplay}
              </p>
              <div className="link-row">
                <a href={`tel:${BRANCH.phone}`} className="btn-sm">
                  {t(locale, 'visit.call')}
                </a>
              </div>
            </div>
            <div className="card">
              <h2>{t(locale, 'visit.hours')}</h2>
              <div className="hours-row">
                <span>{t(locale, 'visit.everyDay')}</span>
                <span className="hours-time">3 PM – 3 AM</span>
              </div>
              <div style={{ marginBlockStart: 14 }}>
                <OpenStatus locale={locale} />
              </div>
            </div>
          </div>
          <div className="link-row">
            <Link href={`/${locale}/visit/`} className="btn-sm btn-sm-ghost">
              {t(locale, 'nav.visit')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
