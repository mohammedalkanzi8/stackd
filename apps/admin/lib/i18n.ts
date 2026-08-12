/**
 * Arabic for the staff portal.
 *
 * ⚠ ENGLISH IS THE FALLBACK, AND THAT IS DELIBERATE. `t()` returns the English
 * string when an Arabic one is missing, so a key that has not been translated
 * yet shows readable English rather than the key name or an empty label. A
 * half-translated screen is bad; a screen with `nav.orders` written on a button
 * during a shift is worse.
 *
 * ⚠ NUMBERS STAY WESTERN (0-9) EVERYWHERE IN THIS APP. The print studio uses
 * Arabic-Indic numerals because a poster is typographic and language-led. This
 * portal is not: it shows prices, points, invoice numbers and pickup codes that
 * staff read aloud, key into a till, and compare against a printed receipt and
 * the POS. Two numeral systems for the same figure across those surfaces is a
 * mistake waiting to happen at the counter, so the numerals match the receipt.
 *
 * ⚠ NEVER letter-space or uppercase Arabic. It is cursive: tracking pulls the
 * joins open mid-word, and there is no case to transform. Both are undone under
 * `:lang(ar)` in globals.css — see the rules there before adding a label style.
 */

import type { Lang } from './prefs.ts';

type Dict = Record<string, string>;

/**
 * Arabic strings only. Anything absent falls through to `EN` below, which is the
 * authority for what a key means.
 */
const AR: Dict = {
  // ── Chrome ────────────────────────────────────────────────────────────────
  'nav.overview': 'نظرة عامة',
  'nav.scan': 'مسح',
  'nav.orders': 'الطلبات',
  'nav.members': 'الأعضاء',
  'nav.points': 'النقاط',
  'nav.rewards': 'المكافآت',
  'nav.print': 'استوديو الطباعة',
  'nav.menu': 'القائمة',
  'nav.reports': 'التقارير',
  'nav.staff': 'الموظفون',
  'nav.signOut': 'تسجيل الخروج',
  'nav.signingOut': 'جارٍ الخروج',
  'nav.language': 'العربية',
  'nav.languageSwitch': 'English',
  'nav.theme': 'تبديل المظهر',
  'nav.themeLight': 'فاتح',
  'nav.themeDark': 'داكن',
  'nav.themeSystem': 'حسب الجهاز',

  // ── Roles ─────────────────────────────────────────────────────────────────
  'role.cashier': 'كاشير',
  'role.kitchen': 'المطبخ',
  'role.manager': 'مشرف',
  'role.owner': 'المالك',

  // ── Shared actions and words ──────────────────────────────────────────────
  'a.save': 'حفظ',
  'a.saving': 'جارٍ الحفظ',
  'a.cancel': 'إلغاء',
  'a.edit': 'تعديل',
  'a.add': 'إضافة',
  'a.delete': 'حذف',
  'a.search': 'بحث',
  'a.go': 'تنفيذ',
  'a.back': 'رجوع',
  'a.print': 'طباعة',
  'a.close': 'إغلاق',
  'w.points': 'نقطة',
  'w.sar': 'ريال',
  'w.name': 'الاسم',
  'w.phone': 'رقم الجوال',
  'w.email': 'البريد الإلكتروني',
  'w.balance': 'الرصيد',
  'w.total': 'الإجمالي',
  'w.date': 'التاريخ',
  'w.today': 'اليوم',
  'w.none': 'لا يوجد',
  'w.yes': 'نعم',
  'w.no': 'لا',
  'w.active': 'نشط',
  'w.inactive': 'غير نشط',
  'w.loading': 'جارٍ التحميل',

  // ── Sign in ───────────────────────────────────────────────────────────────
  'login.title': 'تسجيل دخول الموظفين',
  'login.email': 'البريد الإلكتروني',
  'login.password': 'كلمة المرور',
  'login.submit': 'تسجيل الدخول',
  'login.pending': 'جارٍ الدخول',
  'login.lede': 'الولاء والمكافآت والقائمة.',
  'login.failed': 'البريد الإلكتروني أو كلمة المرور لا يطابقان حسابًا نشطًا.',

  // ── Overview ──────────────────────────────────────────────────────────────
  'ov.title': 'نظرة عامة',
  'ov.members': 'الأعضاء',
  'ov.pointsOut': 'النقاط المتاحة',
  'ov.earnedAllTime': 'إجمالي ما تم كسبه',
  'ov.ordersToday': 'طلبات اليوم',
  'ov.takingsToday': 'مبيعات اليوم',
  'ov.heading': 'برنامج الولاء',
  'ov.lede': 'النقاط المتاحة التزام على المطعم: كل نقطة منها خصم يمكن للعميل المطالبة به.',
  'ov.lookUp': 'البحث عن عضو',
  'ov.activeRewards': 'المكافآت النشطة',
  'ov.editCatalogue': 'تعديل قائمة المكافآت',
  'ov.itemsLive': 'أصناف القائمة',
  'ov.missingCalories': 'بدون سعرات',
  'ov.allCalories': 'جميع الأصناف بها سعرات',

  // ── Scan ──────────────────────────────────────────────────────────────────
  'scan.title': 'مسح رمز',
  'scan.label': 'امسح أو اكتب الرمز',
  'scan.hint': 'بطاقة عضو، أو رمز استبدال',
  'scan.useCamera': 'استخدام الكاميرا',
  'scan.stopCamera': 'إيقاف الكاميرا',
  'scan.point': 'وجّه الكاميرا نحو الرمز.',
  'scan.noReader':
    'لا يحتوي هذا المتصفح على قارئ رموز، لذلك زر الكاميرا مخفي. يعمل أي قارئ USB أو بلوتوث هنا مثل لوحة المفاتيح، وكتابة الرمز تعمل دائمًا.',
  'scan.cameraDenied': 'تم رفض إذن الكاميرا. اكتب الرمز بدلاً من ذلك.',
  'scan.cameraFailed': 'تعذّر فتح الكاميرا. اكتب الرمز بدلاً من ذلك.',

  // ── Members ───────────────────────────────────────────────────────────────
  'mem.title': 'الأعضاء',
  'mem.addTitle': 'تسجيل عضو جديد',
  'mem.memberCode': 'رمز العضو',
  'mem.joined': 'تاريخ الانضمام',
  'mem.lifetime': 'المكتسب',
  'mem.none': 'لا يوجد أعضاء بعد.',
  'mem.searchPlaceholder': 'الاسم أو الجوال أو الرمز',

  // ── Orders ────────────────────────────────────────────────────────────────
  'ord.title': 'الطلبات',
  'ord.pickupCode': 'رقم الاستلام',
  'ord.status': 'الحالة',
  'ord.source': 'المصدر',
  'ord.none': 'لا توجد طلبات في هذا اليوم.',
  'ord.voided': 'ملغى',

  // ── Points settings ───────────────────────────────────────────────────────
  'pts.title': 'إعدادات النقاط',
  'pts.earnPercent': 'نسبة الكسب',
  'pts.signupBonus': 'مكافأة التسجيل',
  'pts.minRedeem': 'الحد الأدنى للاستبدال',
  'pts.expiryMonths': 'انتهاء الصلاحية بالأشهر',

  // ── Rewards ───────────────────────────────────────────────────────────────
  'rw.title': 'المكافآت',
  'rw.pointsCost': 'التكلفة بالنقاط',

  // ── Staff ─────────────────────────────────────────────────────────────────
  'stf.title': 'الموظفون',
  'stf.role': 'الدور',

  // ── Reports ───────────────────────────────────────────────────────────────
  'rep.title': 'التقارير',
};

/**
 * The English strings, and the authority for what every key means.
 *
 * Kept as a table rather than left inline in the pages so that adding Arabic to
 * a screen is a matter of filling in AR above, and so a reviewer can see the
 * whole vocabulary of the portal in one place.
 */
const EN: Dict = {
  'nav.overview': 'Overview',
  'nav.scan': 'Scan',
  'nav.orders': 'Orders',
  'nav.members': 'Members',
  'nav.points': 'Points',
  'nav.rewards': 'Rewards',
  'nav.print': 'Print studio',
  'nav.menu': 'Menu',
  'nav.reports': 'Reports',
  'nav.staff': 'Staff',
  'nav.signOut': 'Sign out',
  'nav.signingOut': 'Signing out',
  'nav.language': 'English',
  'nav.languageSwitch': 'العربية',
  'nav.theme': 'Switch theme',
  'nav.themeLight': 'Light',
  'nav.themeDark': 'Dark',
  'nav.themeSystem': 'Device',

  'role.cashier': 'Cashier',
  'role.kitchen': 'Kitchen',
  'role.manager': 'Admin',
  'role.owner': 'Super Admin',

  'a.save': 'Save',
  'a.saving': 'Saving',
  'a.cancel': 'Cancel',
  'a.edit': 'Edit',
  'a.add': 'Add',
  'a.delete': 'Delete',
  'a.search': 'Search',
  'a.go': 'Go',
  'a.back': 'Back',
  'a.print': 'Print',
  'a.close': 'Close',
  'w.points': 'points',
  'w.sar': 'SAR',
  'w.name': 'Name',
  'w.phone': 'Phone',
  'w.email': 'Email',
  'w.balance': 'Balance',
  'w.total': 'Total',
  'w.date': 'Date',
  'w.today': 'Today',
  'w.none': 'None',
  'w.yes': 'Yes',
  'w.no': 'No',
  'w.active': 'Active',
  'w.inactive': 'Inactive',
  'w.loading': 'Loading',

  'login.title': 'Staff sign in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.pending': 'Signing in',
  'login.lede': 'Loyalty, rewards and the menu.',
  'login.failed': 'That email and password do not match an active staff account.',

  'ov.title': 'Overview',
  'ov.members': 'Members',
  'ov.pointsOut': 'Points outstanding',
  'ov.earnedAllTime': 'earned all time',
  'ov.ordersToday': 'Orders today',
  'ov.takingsToday': 'Takings today',
  'ov.heading': 'The loyalty programme',
  'ov.lede':
    'Points outstanding are a liability: every one of them is a discount somebody can still claim.',
  'ov.lookUp': 'Look someone up',
  'ov.activeRewards': 'Active rewards',
  'ov.editCatalogue': 'Edit the catalogue',
  'ov.itemsLive': 'Menu items live',
  'ov.missingCalories': 'missing calories',
  'ov.allCalories': 'all have calories',

  'scan.title': 'Scan a code',
  'scan.label': 'Scan or type a code',
  'scan.hint': 'member card, or a redemption QR',
  'scan.useCamera': 'Use camera',
  'scan.stopCamera': 'Stop camera',
  'scan.point': 'Point the camera at the code.',
  'scan.noReader':
    'This browser has no built-in barcode reader, so the camera button is hidden. A USB or Bluetooth scanner works here as a keyboard, and typing the code always works.',
  'scan.cameraDenied': 'Camera permission was refused. Type the code instead.',
  'scan.cameraFailed': 'Could not open the camera. Type the code instead.',

  'mem.title': 'Members',
  'mem.addTitle': 'Sign someone up',
  'mem.memberCode': 'Member code',
  'mem.joined': 'Joined',
  'mem.lifetime': 'Earned',
  'mem.none': 'No members yet.',
  'mem.searchPlaceholder': 'Name, phone or code',

  'ord.title': 'Orders',
  'ord.pickupCode': 'Pickup code',
  'ord.status': 'Status',
  'ord.source': 'Source',
  'ord.none': 'No orders on this day.',
  'ord.voided': 'Voided',

  'pts.title': 'Points settings',
  'pts.earnPercent': 'Earn rate',
  'pts.signupBonus': 'Signup bonus',
  'pts.minRedeem': 'Minimum redeem points',
  'pts.expiryMonths': 'Expiry months',

  'rw.title': 'Rewards',
  'rw.pointsCost': 'Points cost',

  'stf.title': 'Staff',
  'stf.role': 'Role',

  'rep.title': 'Reports',
};

export type Key = keyof typeof EN;

/**
 * Translate. Falls back to English, then to the key itself.
 *
 * The final fallback returns the key rather than an empty string on purpose: an
 * empty label is invisible in review and ships, whereas `mem.title` on a heading
 * is caught by whoever looks at the page once.
 */
export function t(lang: Lang, key: Key | string): string {
  if (lang === 'ar') return AR[key] ?? EN[key] ?? String(key);
  return EN[key] ?? String(key);
}

/** Every key with no Arabic yet. Used by the test that guards coverage. */
export function untranslated(): string[] {
  return Object.keys(EN).filter((k) => !(k in AR));
}
