/**
 * STACKD menu — typed source for the static website.
 *
 * ⚠ THE `MENU` CONSTANT BELOW IS GENERATED. It is rebuilt from the database by
 * `npm run sync:menu`, and hand edits to it are overwritten on the next run.
 * To change the menu: edit `supabase/seed.sql`, `npm run db:reset`, then
 * `npm run sync:menu`. The database is the single source of truth.
 *
 * Everything outside the `<generated:menu>` markers — the types, BRANCH, BRAND,
 * and the helpers at the bottom — is hand-written and safe to edit. Those aren't
 * modelled in Postgres, and shouldn't be: a phone number and an Instagram handle
 * do not need a table.
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

// <generated:menu> — npm run sync:menu. Do not edit by hand.
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
        // August 2026 shoot, supplied by the owner and the same frame the
        // printed menu uses. Replaces the upscaled crop from the July launch
        // post. Native 4:3 at 1280x960, so the card gets the whole frame with no
        // crop.
        image: '/menu/classic-stackd.webp',
      },
      {
        slug: 'maple-stackd',
        nameEn: 'Maple-Stackd',
        nameAr: 'ميبل - ستاكد',
        descEn: 'Bun, chicken breast, maple sauce, mayo',
        descAr: 'خبز برجر - صدر دجاج - مايونيز - صلصة الميبل',
        price: 2900,
        calories: 685,
        // Same provenance as classic-stackd — August 2026, matches the printed
        // menu.
        image: '/menu/maple-stackd.webp',
      },
      {
        slug: 'big-stackd',
        nameEn: 'Big-Stackd',
        nameAr: 'بيج - ستاكد',
        descEn: 'Bun, chicken breast, brisket, maple sauce, mayo',
        descAr: 'خبز برجر - صدر دجاج - لحم بريسكيت - مايونيز - صلصة الميبل',
        price: 4800,
        calories: 1200,
        // Same provenance as classic-stackd — August 2026, matches the printed
        // menu.
        image: '/menu/big-stackd.webp',
      },
      {
        slug: 'tortilla-strips',
        nameEn: 'Tortilla Strips',
        nameAr: 'تورتيلا الدجاج',
        descEn: 'Tortilla bread, Stackd sauce, lettuce, crispy fresh chicken, cheese, fries',
        descAr: 'خبز تورتيلا - صلصة ستاكد - خس - دجاج طازج مقرمش - جبنة - بطاطس',
        price: 1900,
        calories: 890,
        // July 2026 camera shoot, now from the full-resolution original
        // (DSC07611, 1991x2877) rather than the earlier export. Portrait, so the
        // 4:3 card keeps the cut face top-left and the fries bottom-right — see
        // the crop in scripts/shoot-to-web.mjs.
        image: '/menu/tortilla-strips.webp',
      },
      {
        slug: 'chicken-strips',
        nameEn: 'Chicken Strips',
        nameAr: 'ستربس الدجاج',
        descEn: '4 pcs of fresh, crispy chicken strips with fries and dipping sauce',
        descAr: '٤ قطع من شرائح الدجاج الطازجة المقرمشة مع البطاطس وصلصة الغمس',
        price: 2300,
        calories: 950,
        // July 2026 camera shoot. Full resolution.
        image: '/menu/chicken-strips.webp',
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
        descEn: 'Mac n\' cheese, chicken strips, Stackd sauce, cheddar sauce, coleslaw, pickles, seasoned fries',
        descAr: 'مكرونة بالجبنة - شرائح دجاج - صلصة ستاكد - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
        price: 2500,
        calories: 1100,
        // August 2026 shoot: the kraft bowl as actually served, with the
        // coleslaw and pickle pots beside it. This REPLACES the launch-post
        // poster the owner preferred on 3 Aug 2026 — that preference was against
        // an older, worse bowl photo, and this frame is the one the printed menu
        // now uses. Revert to the poster here if the owner disagrees.
        image: '/menu/scoopy-doo.webp',
      },
      {
        slug: 'fire-attack',
        nameEn: 'Fire-Attack',
        nameAr: 'فاير - أتاك',
        descEn: 'Mac n\' cheese, spicy chicken strips, Stackd sauce, Nashville seasoning, cheddar sauce, coleslaw, pickles, seasoned fries',
        descAr: 'مكرونة بالجبنة - شرائح دجاج حارة - صلصة ستاكد - ناشفيل - صلصة شيدر - سلطة كول سلو - مخلل - بطاطا مقلية مبهرة',
        price: 2700,
        calories: 1200,
        spicy: true,
        // The Scoopy-Doo bowl again, because the owner confirmed on 12 Aug 2026
        // that the two Giants are one dish with a different sauce. THE SAME
        // UNCROPPED FRAME as Scoopy-Doo, on the owner's instruction — the
        // difference between the two cards is carried entirely by the sauce,
        // which is what separates the two dishes. The heat is a grade MASKED TO
        // THE BOWL: the sauce and chicken go red, the bowl, table, coleslaw and
        // pickles stay exactly as shot. Two earlier attempts were rejected —
        // grading the whole frame read as a warm filter over a mild dish, and a
        // tighter crop changed the framing when only the sauce should change.
        // The drawn-in jalapenos from the 3 Aug composite are GONE; they were
        // never in the recipe. Nothing is added to the food.
        image: '/menu/fire-attack.webp',
      },
    ],
  },
  {
    slug: 'sides',
    showPhotos: true,
    nameEn: 'Sides',
    nameAr: 'أطباق جانبية',
    items: [
      {
        slug: 'fries',
        nameEn: 'Fries',
        nameAr: 'بطاطس مقلية',
        price: 900,
        calories: 420,
        // August 2026 packshot in the branded scoop, chosen by the owner on 12
        // Aug over the July camera shot. RE-PLATED: lifted off its pale blue
        // studio sweep and stood on a table built from the Scoopy-Doo frame, so
        // the Sides row matches the rest of the menu. ⚠ These read as seasoned,
        // where the July frame was deliberately plain because the owner
        // confirmed the side is plain. The owner picked this one knowing that;
        // the description and 420 kcal still describe plain fries.
        image: '/menu/fries.webp',
      },
      {
        slug: 'coleslaw',
        nameEn: 'Coleslaw',
        nameAr: 'سلطة كول سلو',
        price: 400,
        calories: 384,
        // August 2026 packshot. RE-PLATED onto the menu's own table — the
        // concrete it was shot on could not be graded to match, because the
        // concrete and the tub are the same neutral grey at the same brightness
        // and nothing separates them by colour. The tub is a circle, so its own
        // shape is the mask. First photograph this item has ever had.
        image: '/menu/coleslaw.webp',
      },
      {
        slug: 'cheesy-cheese',
        nameEn: 'Cheesy-Cheese',
        nameAr: 'تشيزي - تشيز',
        price: 600,
        calories: 245,
        // Cheese fries, supplied by the owner on 12 Aug 2026, replacing the
        // composite that stood a cheese pot beside the fries scoop. ⚠⚠ NOT
        // STACKD'S OWN PHOTOGRAPHY. No branded packaging, a metal tray and a
        // marble surface — none of it matches the shoot or how the side is
        // served. If it came from a stock or recipe site, CHECK THE LICENCE
        // BEFORE THIS GOES LIVE. It also keeps its bright ground while Fries and
        // Coleslaw were moved onto the dark table, so it is now the odd card in
        // the Sides row.
        image: '/menu/cheesy-cheese.webp',
      },
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
      { slug: 'soft-drink', nameEn: 'Soft Drink', nameAr: 'مشروبات غازية', price: 800, calories: null },
      { slug: 'kenza', nameEn: 'Kenza', nameAr: 'كينزا', price: 300, calories: null },
      { slug: 'water', nameEn: 'Water', nameAr: 'ماء', price: 200, calories: 0 },
    ],
  },
];
// </generated:menu>

export const BRANCH = {
  nameEn: 'STACKD, North Khobar',
  nameAr: 'ستاكد - الخبر الشمالية',
  addressEn: 'Al Khobar Al Shamalia, Al Khobar 31311',
  addressAr: 'الخبر الشمالية، الخبر ٣١٣١١',
  postalCode: '31311',
  cityEn: 'Al Khobar',
  cityAr: 'الخبر',
  /** E.164 for tel: links. */
  phone: '+966500338808',
  phoneDisplay: '050 033 8808',
  /**
   * Must exist as a real mailbox or alias on MXroute, or mail to it bounces.
   *
   * This is the PUBLIC address — footer, home page, visit page, and the
   * schema.org block Google reads. It stays `info@`. It was briefly changed to
   * mohamed.kanzi@ on 12 Aug 2026 and put back the same day: that address is for
   * signing in to the admin portal, not for customers to write to.
   */
  email: 'info@stackd.com.sa',
  mapsUrl: 'https://maps.app.goo.gl/Kfi1PbLSJwn4LKcf9',
  instagram: 'stackdchicken',
  tiktok: 'Stackd',
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
