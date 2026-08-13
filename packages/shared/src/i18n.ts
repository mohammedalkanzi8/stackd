/**
 * UI strings, Arabic first.
 *
 * Arabic is the DEFAULT locale — the restaurant is in Khobar and most customers
 * will read Arabic. English is the secondary. This ordering is deliberate:
 * building English-first and bolting Arabic on is how you end up with a
 * mirrored-LTR layout that reads badly.
 */

import type { Locale } from './menu.ts';

export const LOCALES: Locale[] = ['ar', 'en'];
export const DEFAULT_LOCALE: Locale = 'ar';

export function dir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

/**
 * Rewrites a pathname to the same page in another locale.
 *
 *   /ar/menu/  -> en  =>  /en/menu/
 *   /ar/       -> en  =>  /en/
 *   /          -> ar  =>  /ar/
 *
 * The language switch has to keep the visitor where they are; sending them back
 * to the home page every time they change language is the bug this replaces.
 * Trailing slashes are preserved because the site is exported with
 * `trailingSlash: true` and Apache serves directory indexes.
 */
export function localeSwapPath(pathname: string, target: Locale): string {
  // Drop a leading locale segment if present, keep everything after it.
  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, '');
  if (rest === '' || rest === '/') return `/${target}/`;
  const withSlash = rest.endsWith('/') ? rest : `${rest}/`;
  return `/${target}${withSlash.startsWith('/') ? '' : '/'}${withSlash}`;
}

/**
 * Narrows a route param to Locale. Next's typed routes hand back a plain
 * `string`, and the whole i18n layer depends on it actually being 'ar' | 'en' —
 * so validate rather than cast. Throwing at build time surfaces a bad
 * generateStaticParams immediately instead of rendering a broken page.
 */
export function assertLocale(value: string): Locale {
  if (!isLocale(value)) {
    throw new Error(`Unknown locale "${value}". Expected one of ${LOCALES.join(', ')}`);
  }
  return value;
}

export const WEEKDAY_NAMES: Record<Locale, string[]> = {
  // Index 0 = Sunday, matching Postgres extract(dow).
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const strings = {
  ar: {
    'nav.home': 'الرئيسية',
    'nav.login': 'حسابي',
    'nav.menu': 'المنيو',
    'nav.visit': 'زورونا',
    'nav.loyalty': 'برنامج الولاء',
    'nav.lang': 'EN',
    'nav.theme': 'تبديل الوضع الليلي',

    'hero.order': 'اطلب الآن',
    'hero.viewMenu': 'شاهد المنيو',
    'hero.est': 'تأسس ٢٠٢٣',

    'status.open': 'مفتوح الآن',
    'status.closed': 'مغلق حالياً',
    'status.closingSoon': 'يغلق قريباً',
    'status.opensIn': 'يفتح بعد',
    'status.closesIn': 'يغلق بعد',
    'status.hour': 'ساعة',
    'status.hours': 'ساعات',
    'status.minute': 'دقيقة',
    'status.minutes': 'دقيقة',

    'menu.title': 'قائمة الطعام',
    'menu.subtitle': 'كل الأسعار تشمل ضريبة القيمة المضافة',
    'menu.calories': 'سعرة حرارية',
    'menu.spicy': 'حار',
    'menu.caloriesPending': 'قيد التحديث',

    'visit.title': 'زورونا',
    'visit.address': 'العنوان',
    'visit.hours': 'ساعات العمل',
    'visit.phone': 'الهاتف',
    'visit.email': 'البريد الإلكتروني',
    'visit.emailUs': 'راسلنا',
    'visit.directions': 'الاتجاهات',
    'visit.call': 'اتصل بنا',
    'visit.everyDay': 'كل الأيام',
    'visit.services': 'الخدمات',
    'visit.dineIn': 'تناول في المطعم',
    'visit.takeaway': 'طلبات خارجية',
    'visit.delivery': 'توصيل',

    // ⚠ THE RATE IS `{p}`, NEVER A TYPED NUMBER. These strings are read off the
    // home page by people standing in the shop, so they have to match `REWARDS`
    // and the admin Points page exactly — and when they were written as a
    // literal "10%" they did not: raising the rate to 11% in the admin portal
    // moved the figure in the ring above and left this line contradicting it on
    // the same screen. Fill with fillRewards(..., { p: REWARDS.earnPercent }).
    'loyalty.title': 'مكافآت ستاكد',
    'loyalty.lead': 'استرجع {p} من كل فاتورة نقاطاً، واخصمها من طلبك القادم.',
    'loyalty.comingSoon': 'اعرف نقاطك',
    'loyalty.more': 'كيف يشتغل البرنامج',

    'footer.rights': 'جميع الحقوق محفوظة',
    'footer.follow': 'تابعونا',
  },
  en: {
    'nav.home': 'Home',
    'nav.login': 'My points',
    'nav.menu': 'Menu',
    'nav.visit': 'Visit',
    'nav.loyalty': 'Rewards',
    'nav.lang': 'ع',
    'nav.theme': 'Toggle dark mode',

    'hero.order': 'Order Now',
    'hero.viewMenu': 'View Menu',
    'hero.est': 'Est. 2023',

    'status.open': 'Open now',
    'status.closed': 'Closed',
    'status.closingSoon': 'Closing soon',
    'status.opensIn': 'Opens in',
    'status.closesIn': 'Closes in',
    'status.hour': 'hour',
    'status.hours': 'hours',
    'status.minute': 'minute',
    'status.minutes': 'minutes',

    'menu.title': 'Menu',
    'menu.subtitle': 'All prices include VAT',
    'menu.calories': 'cal',
    'menu.spicy': 'Spicy',
    'menu.caloriesPending': 'Being updated',

    'visit.title': 'Visit Us',
    'visit.address': 'Address',
    'visit.hours': 'Opening Hours',
    'visit.phone': 'Phone',
    'visit.email': 'Email',
    'visit.emailUs': 'Email Us',
    'visit.directions': 'Directions',
    'visit.call': 'Call Us',
    'visit.everyDay': 'Every day',
    'visit.services': 'Services',
    'visit.dineIn': 'Dine-in',
    'visit.takeaway': 'Takeaway',
    'visit.delivery': 'Delivery',

    'loyalty.title': 'STACKD Rewards',
    'loyalty.lead': 'Get {p} of every bill back as points, and take them off your next order.',
    'loyalty.comingSoon': 'Check my points',
    'loyalty.more': 'How it works',

    'footer.rights': 'All rights reserved',
    'footer.follow': 'Follow us',
  },
} as const;

export type StringKey = keyof (typeof strings)['en'];

export function t(locale: Locale, key: StringKey): string {
  return strings[locale][key];
}

/**
 * Arabic-Indic digits. Saudi audiences read both, but Arabic-Indic looks native
 * in Arabic body copy. Prices stay Western-Arabic for scannability.
 */
/**
 * "N items" under a menu category heading.
 *
 * ⚠ ARABIC DOES NOT PLURALISE THE WAY ENGLISH DOES, and this label was
 * hard-coded as `${n} أطباق` for every count. Two of them were wrong on the live
 * site: Arabic has a DUAL, so two items is صنفان and not ٢ أصناف, and from
 * eleven upward the counted noun goes back to the singular. Giants has two
 * items, so the dual case was visible on stackd.com.sa.
 *
 *   1      صنف واحد
 *   2      صنفان            ← the dual, which no English-shaped rule produces
 *   3-10   ٣ أصناف          ← plural
 *   11+    ١١ صنفًا          ← singular again, accusative
 *
 * The word is صنف — item — not طبق. A category counts sauces and drinks as well
 * as dishes, and طبق means a dish specifically. It is also the word the staff
 * portal already uses for the same thing.
 */
export function itemCount(locale: Locale, n: number): string {
  if (locale === 'en') return `${n} ${n === 1 ? 'item' : 'items'}`;
  if (n === 1) return 'صنف واحد';
  if (n === 2) return 'صنفان';
  if (n >= 3 && n <= 10) return `${toArabicDigits(n)} أصناف`;
  return `${toArabicDigits(n)} صنفًا`;
}

export function toArabicDigits(input: string | number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(input).replace(/\d/g, (d) => map[Number(d)]);
}

/** "1 hour 20 minutes" / "ساعة و٢٠ دقيقة" from a minute count. */
export function formatDuration(totalMinutes: number, locale: Locale): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts: string[] = [];

  if (locale === 'ar') {
    if (h > 0) parts.push(h === 1 ? 'ساعة' : `${toArabicDigits(h)} ساعات`);
    if (m > 0) parts.push(`${toArabicDigits(m)} دقيقة`);
    return parts.join(' و') || 'أقل من دقيقة';
  }
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || 'less than a minute';
}
