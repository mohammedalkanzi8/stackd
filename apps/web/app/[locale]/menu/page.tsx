import type { Metadata } from 'next';
import { MENU, formatAmount, t, toArabicDigits, assertLocale } from '@stackd/shared';
import { SloganBand } from '../../components/SloganBand';

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
  return {
    title: locale === 'ar' ? 'قائمة الطعام | ستاكد' : 'Menu | STACKD',
    description:
      locale === 'ar'
        ? 'قائمة ستاكد: برجر دجاج، أطباق العماليق، ستربس، صلصات ومشروبات. الأسعار تشمل الضريبة.'
        : 'The STACKD menu: chicken burgers, Giants, strips, sauces and drinks. Prices include VAT.',
  };
}

export default async function MenuPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = assertLocale(raw);
  const isAr = locale === 'ar';
  const num = (v: number | string) => (isAr ? toArabicDigits(v) : String(v));

  return (
    <>
      <section className="hero" style={{ paddingBlockEnd: 'clamp(30px, 5vw, 56px)' }}>
        <div className="glow-bg" />
        <div className="wrap stack above">
          <p className="eyebrow">{isAr ? 'الأسعار بالريال السعودي' : 'Prices in Saudi Riyal'}</p>
          <h1 className="display h-xl">{t(locale, 'menu.title')}</h1>
          <p className="lede">{t(locale, 'menu.subtitle')}</p>
        </div>
      </section>

      <SloganBand locale={locale} />

      <section className="section">
        <div className="wrap">
          {MENU.map((cat) => (
            <div className="cat reveal" key={cat.slug}>
              <div className="cat-head">
                <h2 className="cat-name display">{isAr ? cat.nameAr : cat.nameEn}</h2>
                <span className="cat-rule" />
                <span className="cat-count">
                  {num(cat.items.length)} {isAr ? 'أطباق' : 'items'}
                </span>
              </div>

              <div className="grid">
                {cat.items.map((item) => {
                  const desc = isAr ? item.descAr : item.descEn;
                  return (
                    <article className="card" key={item.slug}>
                      <div className="card-top">
                        <h3 className="card-name">{isAr ? item.nameAr : item.nameEn}</h3>
                        <span className="price">
                          {formatAmount(item.price)}
                          <small>SAR</small>
                        </span>
                      </div>
                      {desc && <p className="card-desc">{desc}</p>}
                      {(item.calories !== null || item.spicy) && (
                        <div className="tags">
                          {/* Calories are omitted where the printed figure is
                              known wrong rather than shown as a wrong number.
                              Saudi labelling rules require accuracy. */}
                          {item.calories !== null && (
                            <span className="tag">
                              {num(item.calories)} {t(locale, 'menu.calories')}
                            </span>
                          )}
                          {item.spicy && (
                            <span className="tag tag-spicy">{t(locale, 'menu.spicy')}</span>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
