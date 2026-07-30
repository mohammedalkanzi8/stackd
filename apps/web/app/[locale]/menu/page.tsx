import type { Metadata } from 'next';
import {
  MENU,
  formatAmount,
  t,
  toArabicDigits,
  assertLocale,
} from '@stackd/shared';

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
      <section className="slab slab-ink">
        <div className="wrap menu-intro" style={{ marginBlockEnd: 0 }}>
          <p className="eyebrow">{isAr ? 'الأسعار بالريال السعودي' : 'Prices in Saudi Riyal'}</p>
          <h1 className="slab-title">{t(locale, 'menu.title')}</h1>
          <p className="lede">{t(locale, 'menu.subtitle')}</p>
        </div>
      </section>

      <div className="checker" role="presentation" />

      <section className="slab slab-paper">
        <div className="wrap">
          {MENU.map((cat) => (
            <div className="category" key={cat.slug}>
              <div className="category-head">
                <h2 className="category-name">{isAr ? cat.nameAr : cat.nameEn}</h2>
                <span className="category-count">
                  {num(cat.items.length)} {isAr ? 'أطباق' : 'items'}
                </span>
              </div>

              <div className="items">
                {cat.items.map((item) => {
                  const desc = isAr ? item.descAr : item.descEn;
                  return (
                    <article className="item" key={item.slug}>
                      <h3 className="item-name">{isAr ? item.nameAr : item.nameEn}</h3>
                      <span className="item-price">
                        {formatAmount(item.price)}
                        <small>SAR</small>
                      </span>
                      {desc && <p className="item-desc">{desc}</p>}
                      {(item.calories !== null || item.spicy) && (
                        <div className="item-tags">
                          {/* Calories are omitted where the printed figure is
                              known to be wrong, rather than shown as a wrong
                              number. Saudi labelling rules require accuracy. */}
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
