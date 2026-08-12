/**
 * Arabic for the customer portal.
 *
 * ⚠ ARABIC IS THE DEFAULT, not a secondary language. `customers.locale` has
 * defaulted to `'ar'` since the schema was written and is set at registration
 * and at the counter, so the shop has been recording this preference for every
 * member while the portal served everyone English. See lib/prefs.ts.
 *
 * ⚠ ENGLISH IS THE FALLBACK for a key with no Arabic yet, so a missing string
 * shows readable English rather than `pt.title` on a customer's phone.
 *
 * ⚠ NUMBERS STAY WESTERN (0-9). A customer reads points and riyals against a
 * printed receipt and reads a member code aloud to a cashier; two numeral
 * systems for the same figure is a mistake waiting to happen at the counter.
 * The same rule as the staff portal, for the same reason.
 *
 * ⚠ NEVER letter-space or uppercase Arabic. It is cursive, so tracking pulls
 * the joins open mid-word, and there is no case to transform. Both are undone
 * under `:lang(ar)` in globals.css.
 *
 * Phrases that must not break across a line carry a non-breaking space. Width
 * moves a break; only a bound space pins it.
 */

import type { Lang } from './prefs.ts';

type Dict = Record<string, string>;

const AR: Dict = {
  'nav.points': 'نقاطي',
  'nav.myCode': 'رمزي',
  'nav.rewards': 'المكافآت',
  'nav.signOut': 'تسجيل الخروج',
  'nav.lang': 'English',
  'brand.rewards': 'مكافآت ستاكد',
  'brand.tagline': 'نقاطك، ومكافآتك.',
  'a.working': 'جارٍ التنفيذ…',
  'a.cancel': 'إلغاء',
  'a.signIn': 'تسجيل الدخول',
  'a.continue': 'متابعة',
  'w.email': 'البريد الإلكتروني',
  'w.password': 'كلمة المرور',
  'w.points': 'نقطة',
  'w.worth': 'القيمة',
  'login.title': 'تسجيل الدخول',
  'login.lede': 'نقاطك، وما يمكنك استبداله بها.',
  'login.id': 'الجوال أو البريد الإلكتروني',
  'login.failed': 'رقم الجوال أو البريد الإلكتروني وكلمة المرور لا يطابقان أي حساب.',
  'login.forgot': 'نسيت كلمة المرور؟',
  'login.notMember': 'لست عضوًا بعد؟',
  'login.join': 'انضم خلال دقيقة',
  'login.receiptWaiting': 'سجّل الدخول وستجد نقاط فاتورتك في انتظارك.',
  'reg.title': 'انضم إلى مكافآت ستاكد',
  'reg.lede': 'انضم وابدأ بجمع النقاط',
  'reg.name': 'الاسم',
  'reg.mobile': 'رقم الجوال',
  'reg.create': 'إنشاء حسابي',
  'reg.already': 'عضو بالفعل؟',
  'reg.errName': 'من فضلك أدخل اسمك.',
  'reg.errEmail': 'عنوان البريد الإلكتروني لا يبدو صحيحًا.',
  'reg.errPw': 'يجب ألا تقل كلمة المرور عن 8 أحرف.',
  'reg.dupPhone': 'رقم الجوال مسجل بالفعل. سجّل الدخول بدلًا من ذلك.',
  'reg.dupEmail': 'البريد الإلكتروني مسجل بالفعل. سجّل الدخول بدلًا من ذلك.',
  'fg.title': 'نسيت كلمة المرور؟',
  'fg.lede': 'اكتب البريد الإلكتروني المسجل في حسابك وسنرسل لك رمزًا للدخول مرة أخرى.',
  'fg.send': 'أرسل لي رمزًا',
  'fg.remembered': 'تذكرتها؟',
  'fg.badEmail': 'عنوان البريد الإلكتروني لا يبدو صحيحًا.',
  'fg.checkTitle': 'تحقّق من بريدك',
  'fg.codeLabel': 'الرمز',
  'fg.noMail': 'لم يصلك البريد؟ تحقّق من الرسائل غير المرغوبة، أو',
  'fg.expired': 'انتهت صلاحية الرمز. الرموز تدوم 15 دقيقة، اطلب رمزًا جديدًا.',
  'fg.wrong': 'الرمز غير صحيح. راجع البريد وحاول مرة أخرى.',
  'fg.locked': 'محاولات خاطئة كثيرة، لذا أُلغي الرمز. اطلب رمزًا جديدًا.',
  'pw.chooseTitle': 'اختر كلمة مرور جديدة',
  'pw.changeTitle': 'تغيير كلمة المرور',
  'pw.forcedLede': 'نجح الرمز. اختر كلمة مرور وستعود إلى حسابك، ونقاطك كما تركتها تمامًا.',
  'pw.lede': 'اختر شيئًا تتذكره. ستبقى مسجّل الدخول على هذا الجهاز.',
  'pw.current': 'كلمة المرور الحالية',
  'pw.new': 'كلمة المرور الجديدة',
  'pw.again': 'أعدها للتأكيد',
  'pw.save': 'حفظ ومتابعة',
  'pw.back': 'العودة إلى نقاطي',
  'pw.notCurrent': 'هذه ليست كلمة المرور الحالية.',
  'pw.mismatch': 'كلمتا المرور غير متطابقتين.',
  'pw.tooShort': 'يجب ألا تقل كلمة المرور عن 8 أحرف.',
  'pw.saved': 'تم حفظ كلمة المرور. استخدمها في المرة القادمة.',
  'pt.title': 'نقاطي',
  'pt.myCode': 'رمزي',
  'pt.showCounter': 'اعرض هذا عند الكاشير',
  'pt.showMyCode': 'اعرض رمز عضويتي',
  'pt.scannedNote': 'يُمسح عند الطلب، فتُضاف نقاطك تلقائيًا.',
  'pt.earnedSince': 'مكتسبة منذ انضمامك',
  'pt.moreFor': 'نقطة إضافية لـ',
  'pt.welcome': 'أهلًا بك في مكافآت ستاكد. اعرض الرمز أدناه في كل طلب.',
  'pt.claimedBanner': 'تمت المطالبة. اعرض الرمز أعلاه عند الكاشير وهو لك. تُخصم النقاط عند مسحه.',
  'pt.spendTitle': 'اخصم نقاطك من فاتورتك',
  'pt.yourCode': 'رمزك',
  'pt.yourThing': '{what}',
  'pt.spendLede': 'اختر المبلغ، واعرض الرمز على الكاشير، ويُخصم مباشرة من المبلغ المستحق. كل 100 نقطة تساوي 1.00 ريال.',
  'pt.swapTitle': 'أو استبدلها بصنف',
  'pt.noRewards': 'لا توجد مكافآت متاحة حاليًا.',
  'pt.claim': 'استبدال',
  'pt.claiming': 'جارٍ الاستبدال…',
  'pt.more': 'نقطة متبقية',
  'pt.free': 'مجانًا',
  'pt.off': 'خصم',
  'pt.historyTitle': 'سجلي',
  'pt.noHistory': 'لا شيء بعد. اعرض رمزك في طلبك القادم وستبدأ النقاط بالظهور هنا.',
  'pt.orderingSoon': 'الطلب من هنا قادم قريبًا. حاليًا: النقاط والمكافآت.',
  'pt.addTo': 'أضف إلى',
  'pt.notEnough': 'ليس لديك نقاط كافية لذلك بعد.',
  'pt.claimFailed': 'تعذّر استبدال هذه المكافأة.',
  'pt.codeFailed': 'تعذّر إنشاء الرمز.',
  'pt.chooseAmount': 'اختر عدد النقاط التي تريد خصمها.',
  'rsn.earn_purchase': 'نقاط من زيارة',
  'rsn.redeem_reward': 'مكافأة تم استبدالها',
  'rsn.redeem_counter': 'خُصمت من فاتورة',
  'rsn.signup_bonus': 'مكافأة الترحيب',
  'rsn.birthday_bonus': 'هدية عيد الميلاد',
  'rsn.manual_adjust': 'تعديل من الفريق',
  'rsn.expiry': 'منتهية الصلاحية',
  'rsn.order_refund': 'طلب مسترجع',
  'rp.noPoints': 'لا توجد نقاط للخصم بعد. اعرض رمزك عند الطلب ويعود إليك 10% من الفاتورة.',
  'rp.needMore': 'تحتاج {n} نقطة قبل أن تتمكن من الخصم من الفاتورة.',
  'rp.thatIs': 'أي {n} نقطة إضافية.',
  'rp.howMany': 'كم نقطة؟',
  'rp.youHave': 'لديك {n}',
  'rp.minimum': 'الحد الأدنى {n}',
  'rp.all': 'الكل',
  'rp.worthOff': 'بقيمة {sar} ريال تُخصم من فاتورتك',
  'rp.between': 'أدخل رقمًا بين {a} و{b} نقطة.',
  'rp.redeem': 'استبدال',
  'rp.creating': 'جارٍ إنشاء الرمز…',
  'rp.showCashier': 'اعرض هذا على الكاشير. تُخصم {n} نقطة ({sar} ريال) من فاتورتك.',
  'rp.showReward': 'اعرض هذا على الكاشير للحصول على {what}. تُخصم {n} نقطة عند مسحه.',
  'rp.expiresIn': 'تنتهي خلال {t}',
  'rp.expired': 'انتهت صلاحية الرمز. تدوم الرموز ثلاث دقائق، فلا قيمة لصورة الشاشة بعدها.',
  'rp.newOne': 'أنشئ رمزًا جديدًا',
  'cl.title': 'استلم نقاطك',
  'cl.fromTicket': 'من التذكرة',
  'cl.inAccount': 'أصبحت في حسابك الآن.',
  'cl.seePoints': 'عرض نقاطي',
  'cl.already': 'تم استلامها من قبل',
  'cl.expired': 'انتهت صلاحية هذه الفاتورة',
  'cl.unknown': 'لا نعرف هذا الرمز',
  'cl.checkCode': 'تحقّق من الرمز المطبوع تحت رمز QR في فاتورتك. لا يحتوي أبدًا على الرقمين 0 أو 1، ولا الأحرف O أو I أو L.',
  'cl.yourMemberCode': 'رمز عضويتك',
  'cl.enterMemberCode': 'أدخل رمز عضويتك.',
  'cl.failed': 'تعذّر استلام هذه النقاط.',
  'ins.add': 'أضف إلى الشاشة الرئيسية',
  'ins.tap': 'اضغط',
};

/** The English strings, and the authority for what every key means. */
const EN: Dict = {
  'nav.points': 'Your points',
  'nav.myCode': 'My code',
  'nav.rewards': 'Rewards',
  'nav.signOut': 'Sign out',
  'nav.lang': 'العربية',
  'brand.rewards': 'STACKD Rewards',
  'brand.tagline': 'Your points, your rewards.',
  'a.working': 'Working…',
  'a.cancel': 'Cancel',
  'a.signIn': 'Sign in',
  'a.continue': 'Continue',
  'w.email': 'Email',
  'w.password': 'Password',
  'w.points': 'points',
  'w.worth': 'Worth',
  'login.title': 'Sign in',
  'login.lede': 'Your points, and what you can swap them for.',
  'login.id': 'Mobile or email',
  'login.failed': 'That mobile number or email and password do not match an account.',
  'login.forgot': 'Forgotten your password?',
  'login.notMember': 'Not a member yet?',
  'login.join': 'Join in a minute',
  'login.receiptWaiting': 'Sign in and the points from your receipt will be waiting.',
  'reg.title': 'Join STACKD Rewards',
  'reg.lede': 'Join and start earning',
  'reg.name': 'Your name',
  'reg.mobile': 'Mobile',
  'reg.create': 'Create my account',
  'reg.already': 'Already a member?',
  'reg.errName': 'Please enter your name.',
  'reg.errEmail': 'That email address does not look right.',
  'reg.errPw': 'Your password needs at least 8 characters.',
  'reg.dupPhone': 'That mobile number is already registered. Sign in instead.',
  'reg.dupEmail': 'That email is already registered. Sign in instead.',
  'fg.title': 'Forgotten your password?',
  'fg.lede': 'Type the email address on your account and we will send you a code to get back in.',
  'fg.send': 'Email me a code',
  'fg.remembered': 'Remembered it?',
  'fg.badEmail': 'That email address does not look right.',
  'fg.checkTitle': 'Check your email',
  'fg.codeLabel': 'Your code',
  'fg.noMail': 'No mail? Check spam, or',
  'fg.expired': 'That code has expired. Codes last 15 minutes, ask for a new one.',
  'fg.wrong': 'That code is not right. Check the email and try again.',
  'fg.locked': 'Too many wrong tries, so that code has been cancelled. Ask for a new one.',
  'pw.chooseTitle': 'Choose a new password',
  'pw.changeTitle': 'Change your password',
  'pw.forcedLede': 'Your code worked. Pick a password and you are back in, and your points are exactly where you left them.',
  'pw.lede': 'Pick something you will remember. You stay signed in on this device.',
  'pw.current': 'Current password',
  'pw.new': 'New password',
  'pw.again': 'Again, to be sure',
  'pw.save': 'Save and continue',
  'pw.back': 'Back to your points',
  'pw.notCurrent': 'That is not your current password.',
  'pw.mismatch': 'Those two passwords are not the same.',
  'pw.tooShort': 'Your password needs at least 8 characters.',
  'pw.saved': 'Password saved. Use it next time you sign in.',
  'pt.title': 'Your points',
  'pt.myCode': 'My code',
  'pt.showCounter': 'Show this at the counter',
  'pt.showMyCode': 'Show my member code',
  'pt.scannedNote': 'Scanned when you order, so your points go on automatically.',
  'pt.earnedSince': 'earned since you joined',
  'pt.moreFor': 'more for',
  'pt.welcome': 'Welcome to STACKD Rewards. Show the code below whenever you order.',
  'pt.claimedBanner': 'Claimed. Show the code above at the counter and it is yours. The points come off when they scan it.',
  'pt.spendTitle': 'Spend points off your bill',
  'pt.yourCode': 'Your code',
  'pt.yourThing': 'Your {what}',
  'pt.spendLede': 'Choose an amount, show the code to the cashier, and it comes straight off what you owe. 100 points is 1.00 SAR.',
  'pt.swapTitle': 'Or swap them for an item',
  'pt.noRewards': 'No rewards available right now.',
  'pt.claim': 'Claim',
  'pt.claiming': 'Claiming…',
  'pt.more': 'more',
  'pt.free': 'free',
  'pt.off': 'off',
  'pt.historyTitle': 'Your history',
  'pt.noHistory': 'Nothing yet. Show your code next time you order and points start landing here.',
  'pt.orderingSoon': 'Ordering from here is coming next. For now, points and rewards.',
  'pt.addTo': 'Add to',
  'pt.notEnough': 'You do not have enough points for that yet.',
  'pt.claimFailed': 'Could not claim that reward.',
  'pt.codeFailed': 'Could not create a code.',
  'pt.chooseAmount': 'Choose how many points to spend.',
  'rsn.earn_purchase': 'Points from a visit',
  'rsn.redeem_reward': 'Reward claimed',
  'rsn.redeem_counter': 'Spent off a bill',
  'rsn.signup_bonus': 'Welcome bonus',
  'rsn.birthday_bonus': 'Birthday treat',
  'rsn.manual_adjust': 'Adjusted by the team',
  'rsn.expiry': 'Expired',
  'rsn.order_refund': 'Refunded order',
  'rp.noPoints': 'No points to spend yet. Show your code when you order and 10% of the bill comes back.',
  'rp.needMore': 'You need {n} points before you can spend any off a bill.',
  'rp.thatIs': 'That is {n} more.',
  'rp.howMany': 'How many points?',
  'rp.youHave': 'you have {n}',
  'rp.minimum': '{n} minimum',
  'rp.all': 'All',
  'rp.worthOff': 'Worth {sar} SAR off your bill',
  'rp.between': 'Enter between {a} and {b} points.',
  'rp.redeem': 'Redeem',
  'rp.creating': 'Creating your code…',
  'rp.showCashier': 'Show this to the cashier. {n} points ({sar} SAR) comes off your bill.',
  'rp.showReward': 'Show this to the cashier for your {what}. The {n} points come off when they scan it.',
  'rp.expiresIn': 'Expires in {t}',
  'rp.expired': 'That code expired. Codes last three minutes so a photo of your screen is worthless afterwards.',
  'rp.newOne': 'Create a new one',
  'cl.title': 'Collect your points',
  'cl.fromTicket': 'From ticket',
  'cl.inAccount': 'They are in your account now.',
  'cl.seePoints': 'See my points',
  'cl.already': 'Already collected',
  'cl.expired': 'That receipt has expired',
  'cl.unknown': 'We do not know that code',
  'cl.checkCode': 'Check the code printed under the QR on your receipt. It never contains the digits 0 or 1, or the letters O, I or L.',
  'cl.yourMemberCode': 'Your member code',
  'cl.enterMemberCode': 'Enter your member code.',
  'cl.failed': 'Could not collect those points.',
  'ins.add': 'Add to Home Screen',
  'ins.tap': 'Tap',
};

export type Key = keyof typeof EN;

/** Translate. Falls back to English, then to the key itself. */
export function t(lang: Lang, key: Key | string): string {
  if (lang === 'ar') return AR[key] ?? EN[key] ?? String(key);
  return EN[key] ?? String(key);
}

/**
 * Translate with {placeholders} filled in.
 *
 * Sentences that wrap numbers must be ONE string with named holes. Assembled
 * from JSX fragments they cannot be translated at all: Arabic orders the parts
 * differently and a fragment list has no order to change.
 */
export function tf(lang: Lang, key: Key | string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
    t(lang, key),
  );
}

/**
 * Dates, in the customer's language.
 *
 * ⚠ `ar-SA` DEFAULTS TO THE ISLAMIC CALENDAR, and Arabic locales default to
 * Arabic-Indic digits. A customer comparing a date here against a printed
 * receipt needs the same calendar and the same digits, so both are forced.
 * Times are pinned to Riyadh rather than the container clock, which runs UTC.
 */
export function fmtDate(
  lang: Lang,
  value: string | Date,
  opts: Intl.DateTimeFormatOptions,
): string {
  const locale = lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
  return new Date(value).toLocaleString(locale, {
    ...opts,
    hourCycle: 'h23',
    timeZone: 'Asia/Riyadh',
  });
}
