import {
  BRAND,
  BRANCH,
  MENU,
  STACKD_HOURS,
  formatAmount,
  groupHoursForDisplay,
  type Locale,
} from '@stackd/shared';

/** schema.org wants day names; STACKD_HOURS carries `extract(dow)` numbers. */
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * schema.org JSON-LD. This is what earns the rich result in Google — hours,
 * price range, and the menu appearing directly in search. For a local
 * restaurant it is the single highest-leverage SEO item on the site.
 *
 * `openingHoursSpecification` encodes the overnight window correctly: closes is
 * "04:00" against an opens of "16:00", which schema.org reads as next-day.
 */
export function RestaurantSchema({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: isAr ? BRAND.nameAr : BRAND.nameEn,
    alternateName: isAr ? BRAND.nameEn : BRAND.nameAr,
    slogan: isAr ? BRAND.taglineAr : BRAND.taglineEn,
    servesCuisine: isAr ? ['أمريكي', 'دجاج', 'برجر'] : ['American', 'Fried Chicken', 'Burgers'],
    currenciesAccepted: 'SAR',
    address: {
      '@type': 'PostalAddress',
      streetAddress: isAr ? BRANCH.addressAr : BRANCH.addressEn,
      addressLocality: isAr ? BRANCH.cityAr : BRANCH.cityEn,
      addressRegion: isAr ? 'المنطقة الشرقية' : 'Eastern Province',
      postalCode: BRANCH.postalCode,
      addressCountry: 'SA',
    },
    telephone: BRANCH.phone,
    email: BRANCH.email,
    hasMap: BRANCH.mapsUrl,
    sameAs: [
      `https://instagram.com/${BRANCH.instagram}`,
      `https://tiktok.com/@${BRANCH.tiktok}`,
    ],
    // Derived from STACKD_HOURS rather than restated here. These times were
    // written out twice and drifted apart the first time the hours changed —
    // Google would have kept serving the old ones. Schema.org treats a closes
    // value earlier than opens as running past midnight, which is exactly what
    // groupHoursForDisplay already produces.
    openingHoursSpecification: groupHoursForDisplay(STACKD_HOURS).map((row) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: row.weekdays.map((d) => DAY_NAMES[d]),
      opens: row.opens,
      closes: row.closes,
    })),
    acceptsReservations: false,
    hasMenu: {
      '@type': 'Menu',
      name: isAr ? 'قائمة الطعام' : 'Menu',
      hasMenuSection: MENU.map((cat) => ({
        '@type': 'MenuSection',
        name: isAr ? cat.nameAr : cat.nameEn,
        hasMenuItem: cat.items.map((item) => ({
          '@type': 'MenuItem',
          name: isAr ? item.nameAr : item.nameEn,
          ...(item.descEn && { description: isAr ? item.descAr : item.descEn }),
          offers: {
            '@type': 'Offer',
            price: formatAmount(item.price, { alwaysDecimals: true }),
            priceCurrency: 'SAR',
          },
          // Omitted where the printed figure is known-bad rather than published
          // as a wrong number. See docs/DISCREPANCIES.md §4.
          ...(item.calories !== null && {
            nutrition: {
              '@type': 'NutritionInformation',
              calories: `${item.calories} cal`,
            },
          }),
        })),
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      // Static, developer-authored data — no user input reaches this string.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
