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
 * Narrows a route param to Locale. Next's typed routes hand back a plain
 * `string`, and the whole i18n layer depends on it actually being 'ar' | 'en' —
 * so validate rather than cast. Throwing at build time surfaces a bad
 * generateStaticParams immediately instead of rendering a broken page.
 */
export function assertLocale(value: string): Locale {
  if (!isLocale(value)) {
    throw new Error(`Unknown locale "${value}" — expected one of ${LOCALES.join(', ')}`);
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
    'nav.menu': 'المنيو',
    'nav.visit': 'زورونا',
    'nav.loyalty': 'برنامج الولاء',
    'nav.lang': 'EN',

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
    'visit.directions': 'الاتجاهات',
    'visit.call': 'اتصل بنا',
    'visit.everyDay': 'كل الأيام',
    'visit.services': 'الخدمات',
    'visit.dineIn': 'تناول في المطعم',
    'visit.takeaway': 'طلبات خارجية',
    'visit.delivery': 'توصيل',
    'visit.avgSpend': 'متوسط الإنفاق للفرد',

    'loyalty.title': 'برنامج الولاء',
    'loyalty.lead': 'اجمع نقطة على كل ريال. استبدلها بوجبات مجانية.',
    'loyalty.comingSoon': 'قريباً على التطبيق',

    'footer.rights': 'جميع الحقوق محفوظة',
    'footer.follow': 'تابعونا',
  },
  en: {
    'nav.menu': 'Menu',
    'nav.visit': 'Visit',
    'nav.loyalty': 'Rewards',
    'nav.lang': 'ع',

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
    'visit.directions': 'Directions',
    'visit.call': 'Call Us',
    'visit.everyDay': 'Every day',
    'visit.services': 'Services',
    'visit.dineIn': 'Dine-in',
    'visit.takeaway': 'Takeaway',
    'visit.delivery': 'Delivery',
    'visit.avgSpend': 'Average spend per person',

    'loyalty.title': 'Rewards',
    'loyalty.lead': 'Earn a point for every riyal. Redeem for free food.',
    'loyalty.comingSoon': 'Coming soon on the app',

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
