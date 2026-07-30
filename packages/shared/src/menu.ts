/**
 * STACKD menu — typed source for the static website.
 *
 * Mirrors supabase/seed.sql. Once Supabase is provisioned this file should be
 * GENERATED at build time (`npm run sync:menu`) so the database stays the single
 * source of truth; it is hand-maintained only until then.
 *
 * Prices are halalas: 2700 = 27.00 SAR. Never floats.
 *
 * ⚠ `calories: null` means the printed menus carry a value we know to be wrong.
 * See docs/DISCREPANCIES.md §4 — the drinks column duplicates the sauces column.
 */

export type Locale = 'ar' | 'en';

export interface MenuItem {
  slug: string;
  nameEn: string;
  nameAr: string;
  descEn?: string;
  descAr?: string;
  /** Halalas. */
  price: number;
  /** kcal, or null where the printed value is known-bad. */
  calories: number | null;
  spicy?: boolean;
  /**
   * Path to a photo under `apps/web/public/menu/`, e.g. '/menu/big-stackd.jpg'.
   *
   * Leave undefined and the card renders a branded placeholder instead — no
   * broken image, no grey box. To add a real photo: drop the file in that
   * folder and set this field. Nothing else needs to change.
   *
   * Shoot or crop to 4:3. Anything else is cropped to fit and you lose control
   * of what gets cut.
   */
  image?: string;
  /** Flagged when the Arabic name is our translation, not the owner's. */
  arabicNeedsReview?: boolean;
}

export interface MenuCategory {
  slug: string;
  nameEn: string;
  nameAr: string;
  /**
   * Whether cards in this category get a photo area.
   *
   * Dishes earn a photo; a 3 SAR sauce does not. Without this, seventeen
   * identical placeholder tiles would stack up and the menu would read as
   * unfinished rather than deliberate. Sauces and drinks stay compact text
   * cards, which is also how they appear on the printed menu.
   */
  showPhotos: boolean;
  items: MenuItem[];
}

export const MENU: MenuCategory[] = [
  {
    slug: 'burgers',
    showPhotos: true,
    nameEn: 'Stackd Burgers & Sandwiches',
    nameAr: 'برجر ستاكد',
    items: [
      {
        slug: 'classic-stackd',
        nameEn: 'Classic-Stackd',
        nameAr: 'كلاسيك - ستاكد',
        descEn: 'Bun, chicken breast, coleslaw, mayo',
        descAr: 'خبز برجر - صدر دجاج - سلطة كول سلو - مايونيز',
        price: 2700,
        calories: 550,
      },
      {
        slug: 'maple-stackd',
        nameEn: 'Maple-Stackd',
        nameAr: 'ميبل - ستاكد',
        descEn: 'Bun, chicken breast, maple sauce, mayo',
        descAr: 'خبز برجر - صدر دجاج - مايونيز - صلصة الميبل',
        price: 2900,
        calories: 685,
      },
      {
        slug: 'big-stackd',
        nameEn: 'Big-Stackd',
        nameAr: 'بيج - ستاكد',
        descEn: 'Bun, chicken breast, brisket, maple sauce, mayo',
        descAr: 'خبز برجر - صدر دجاج - لحم بريسكيت - مايونيز - صلصة الميبل',
        price: 4800,
        calories: 1200,
      },
      {
        slug: 'tortilla-strips',
        nameEn: 'Tortilla Strips',
        nameAr: 'تورتيلا ستربس',
        descEn: 'Tortilla bread, Stackd sauce, lettuce, crispy fresh chicken, cheese, fries',
        descAr: 'خبز تورتيلا - صلصة ستاكد - خس - دجاج طازج مقرمش - جبنة - بطاطس',
        price: 1900,
        calories: 890,
        arabicNeedsReview: true,
      },
      {
        slug: 'chicken-strips',
        nameEn: 'Chicken Strips',
        nameAr: 'ستربس دجاج',
        descEn: '4 pcs of fresh, crispy chicken strips with fries and dipping sauce',
        descAr: '٤ قطع من شرائح الدجاج الطازجة المقرمشة مع البطاطس وصلصة الغمس',
        price: 2300,
        calories: 950,
        arabicNeedsReview: true,
      },
    ],
  },
  {
    slug: 'giants',
    showPhotos: true,
    nameEn: 'Giants',
    nameAr: 'العماليق',
    items: [
      {
        slug: 'scoopy-doo',
        nameEn: 'Scoopy-Doo',
        nameAr: 'سكوبي - دو',
        descEn: "Mac n' cheese, chicken strips, Stackd sauce, cheddar sauce, coleslaw, pickles, seasoned fries",
        descAr: 'مكرونة بالجبنة - شرائح دجاج - صلصة ستاكد - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
        price: 2500,
        calories: 1100,
      },
      {
        slug: 'fire-attack',
        nameEn: 'Fire-Attack',
        nameAr: 'فاير - أتاك',
        descEn: "Mac n' cheese, spicy chicken strips, Stackd sauce, Nashville seasoning, cheddar sauce, coleslaw, pickles, seasoned fries",
        descAr: 'مكرونة بالجبنة - شرائح دجاج حارة - صلصة ستاكد - ناشفيل - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
        price: 2700,
        calories: 1200,
        spicy: true,
      },
    ],
  },
  {
    slug: 'sides',
    showPhotos: true,
    nameEn: 'Sides',
    nameAr: 'أطباق جانبية',
    items: [
      { slug: 'fries', nameEn: 'Fries', nameAr: 'بطاطس مقلية', price: 900, calories: 420 },
      { slug: 'coleslaw', nameEn: 'Coleslaw', nameAr: 'سلطة كول سلو', price: 400, calories: 384 },
      { slug: 'cheesy-cheese', nameEn: 'Cheesy-Cheese', nameAr: 'تشيزي - تشيز', price: 600, calories: 245 },
    ],
  },
  {
    slug: 'sauces',
    showPhotos: false,
    nameEn: 'Sauces',
    nameAr: 'صلصات',
    items: [
      { slug: 'stackd-sauce', nameEn: 'Stackd Sauce', nameAr: 'ستاكد', price: 300, calories: 67 },
      { slug: 'ranch', nameEn: 'Ranch', nameAr: 'رانش', price: 300, calories: 62 },
      { slug: 'honey-mustard', nameEn: 'Honey Mustard', nameAr: 'هني مسترد', price: 300, calories: 75 },
      { slug: 'nashville', nameEn: 'Nashville', nameAr: 'ناشفيل', price: 300, calories: 6, spicy: true },
    ],
  },
  {
    slug: 'drinks',
    showPhotos: false,
    nameEn: 'Drinks',
    nameAr: 'مشروبات',
    items: [
      // calories: null — printed values duplicate the sauces column. See DISCREPANCIES §4.
      { slug: 'soft-drink', nameEn: 'Soft Drink', nameAr: 'مشروبات غازية', price: 800, calories: null },
      { slug: 'kenza', nameEn: 'Kenza', nameAr: 'كينزا', price: 300, calories: null },
      { slug: 'water', nameEn: 'Water', nameAr: 'ماء', price: 200, calories: 0 },
    ],
  },
];

export const BRANCH = {
  nameEn: 'STACKD — North Khobar',
  nameAr: 'ستاكد - الخبر الشمالية',
  addressEn: 'Al Khobar Al Shamalia, Al Khobar 31311',
  addressAr: 'الخبر الشمالية، الخبر ٣١٣١١',
  plusCode: '76X9+7P5',
  postalCode: '31311',
  cityEn: 'Al Khobar',
  cityAr: 'الخبر',
  /** E.164 for tel: links. */
  phone: '+966500338808',
  phoneDisplay: '050 033 8808',
  mapsUrl: 'https://maps.app.goo.gl/Kfi1PbLSJwn4LKcf9',
  instagram: 'stackdchicken',
  tiktok: 'Stackd',
  /** Reported average spend per person, from the Google listing. */
  priceRange: 'SAR 40–60',
  services: { dineIn: true, takeaway: true, delivery: true },
} as const;

export const BRAND = {
  nameEn: 'STACKD',
  nameAr: 'ستاكد',
  taglineEn: 'Street food. Real flavor. Stacked right.',
  taglineAr: 'طعام الشارع. نكهة حقيقية. مرصوص بإتقان.',
  sloganEn: "Don't Eat. Get STACKD",
  sloganAr: 'لا تأكل. خذ ستاكد',
} as const;

/** Cheapest and dearest main, for "from X" copy. */
export function priceRange(): { min: number; max: number } {
  const prices = MENU.flatMap((c) => c.items.map((i) => i.price));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function allItems(): MenuItem[] {
  return MENU.flatMap((c) => c.items);
}
