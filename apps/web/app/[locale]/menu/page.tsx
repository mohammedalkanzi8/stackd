import type { Metadata } from 'next';
import {
  MENU,
  formatPrice,
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

  return (
    <section className="section">
      <div className="wrap">
        <div className="menu-head">
          <h1>{t(locale, 'menu.title')}</h1>
        </div>
        <p className="menu-note">{t(locale, 'menu.subtitle')}</p>

        {MENU.map((cat) => (
          <div className="category" key={cat.slug}>
            <div className="category-title">{isAr ? cat.nameAr : cat.nameEn}</div>
            <div className="items">
              {cat.items.map((item) => {
                const desc = isAr ? item.descAr : item.descEn;
                return (
                  <div className="item" key={item.slug}>
                    <div className="item-name">{isAr ? item.nameAr : item.nameEn}</div>
                    <div className="item-price">{formatPrice(item.price, locale)}</div>
                    {desc && <div className="item-desc">{desc}</div>}
                    <div className="item-meta">
                      {/* Calories are omitted entirely where the printed value is
                          known to be wrong, rather than shown as a wrong number.
                          Saudi labelling rules require accuracy. */}
                      {item.calories !== null && (
                        <span className="chip">
                          {isAr
                            ? `${toArabicDigits(item.calories)} ${t(locale, 'menu.calories')}`
                            : `${item.calories} ${t(locale, 'menu.calories')}`}
                        </span>
                      )}
                      {item.spicy && (
                        <span className="chip chip-spicy">{t(locale, 'menu.spicy')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
