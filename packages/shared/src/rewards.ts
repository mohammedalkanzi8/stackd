/**
 * STACKD Rewards — the loyalty programme's own identity and copy.
 *
 * One source of truth for the poster, the website page, the customer portal and
 * anything printed. The offer is a number people will hold you to, so it must
 * not be able to say 10% on a wall and something else on a screen.
 *
 * ⚠ The earn rate here is the DEFAULT. The live figure lives in
 * `loyalty_settings.earn_percent` and is editable from the admin Points page.
 * Anything rendered from the database should read it from there and pass it in;
 * this constant exists for the static website, which has no database.
 */

import type { Locale } from './menu.ts';
import { toArabicDigits } from './i18n.ts';

/**
 * ⚠ GENERATED between the markers by `npm run sync:menu`. Hand edits inside the
 * region are overwritten.
 *
 * These mirror `loyalty_settings`, and they used to be typed in by hand — which
 * meant the earn rate could be changed in the admin portal and the website would
 * go on advertising the old one, with nothing to say so. The auto-publish
 * pipeline rebuilds the site whenever those settings move, so the two stay
 * together on their own now.
 *
 * `pointsPerRiyal` is outside the region on purpose: one point is one halala by
 * the programme's design, not by a setting, and there is no row to read it from.
 */
export const REWARDS = {
  // <generated:rewards>
  earnPercent: 10,
  minRedeemPoints: 500,
  signupBonus: 0,
  // </generated:rewards>
  /** Points per riyal of value when spending. One point is one halala. */
  pointsPerRiyal: 100,
} as const;

/**
 * The programme mark.
 *
 * Three ascending chevrons in the brand's rounded badge — the same badge shape
 * the rooster sits in, so it reads as part of the family rather than a second
 * logo. The chevrons brighten upward, which is the whole idea: points build.
 *
 * Kept as a string rather than a component so `packages/shared` needs no React
 * dependency and the static site, the admin portal and the print sheets all
 * render the identical mark.
 *
 * Pure vector with no text, so it survives being blown up to a 2-metre banner
 * and shrunk to a favicon without a second file.
 */
export const REWARDS_MARK_SVG = `
<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STACKD Rewards">
  <rect width="128" height="128" rx="30" fill="#B82712"/>
  <g fill="none" stroke="#ECA70F" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M38 50 L64 28 L90 50" opacity="1"/>
    <path d="M38 76 L64 54 L90 76" opacity="0.72"/>
    <path d="M38 102 L64 80 L90 102" opacity="0.44"/>
  </g>
</svg>`.trim();

/** The mark on a dark ground, for the poster and the portal. */
export const REWARDS_MARK_SVG_DARK = REWARDS_MARK_SVG.replace(
  '<rect width="128" height="128" rx="30" fill="#B82712"/>',
  '<rect width="128" height="128" rx="30" fill="#1B1C19" stroke="#B82712" stroke-width="4"/>',
);

interface RewardsCopy {
  name: string;
  /** The offer, in as few words as a person reads from a queue. */
  headline: string;
  subhead: string;
  /** Three steps. Any more and nobody finishes reading. */
  steps: [string, string, string];
  scanCta: string;
  /** The exchange rate, stated plainly so nobody has to be told it. */
  rate: string;
  /** Longer copy for the website, where there is room to explain. */
  lead: string;
  points: { title: string; body: string }[];
  joinCta: string;
  signInCta: string;
  /** The terms in one sentence. Small on screen, small on paper, always present. */
  fine: string;
  /**
   * The joining bonus line. `{n}` is replaced with the live figure.
   *
   * A template rather than a built string because the number comes from
   * `loyalty_settings.signup_bonus`, and the two languages put it in different
   * places relative to the noun.
   */
  bonus: string;
  /**
   * How the earn rate is written in this language, e.g. `10%` / `١٠٪`.
   *
   * `{n}` is the figure. Used to find and highlight the offer inside the
   * headline, so the two cannot disagree about which numerals to use.
   */
  percent: string;
}

export const REWARDS_COPY: Record<Locale, RewardsCopy> = {
  en: {
    name: 'STACKD Rewards',
    headline: 'Get 10% back.\nEvery single order.',
    subhead: 'Free to join. Takes about a minute.',
    steps: [
      'Scan the code and sign up',
      'Show your code when you order',
      'Spend the points off a later bill',
    ],
    scanCta: 'Scan to join',
    rate: '100 points = 1 SAR off',
    lead:
      'Every riyal you spend comes back as points, and points come straight off a future bill. No stamps, no card to lose, nothing to remember.',
    points: [
      {
        title: '10% back, not a discount',
        body:
          'Ten percent of every bill returns as points. Spend them whenever you like, on whatever you like. Nothing expires for a year.',
      },
      {
        title: 'Your code is on your phone',
        body:
          'Show it when you order and the points go on automatically. Add it to Apple Wallet or your home screen and it is one swipe away.',
      },
      {
        // ⚠ {n} is the redemption floor, filled by fillRewards() from
        // REWARDS.minRedeemPoints, which sync:menu writes from
        // loyalty_settings. It used to be the literal 500, which meant changing
        // the floor in the admin portal left the website advertising the old
        // one.
        title: 'Save up, then spend',
        body:
          'Once you reach {n} points you can take them off a bill, the whole balance or part of it. 100 points is 1 riyal, so you never need to work out what anything is worth.',
      },
    ],
    joinCta: 'Join now',
    signInCta: 'I already have an account',
    fine:
      'Points are earned on the bill total including VAT, and lapse after 12 months with no activity. STACKD Al Khobar Al Shamalia.',
    bonus: '{n} points just for joining',
    percent: '{n}%',
  },
  ar: {
    name: 'مكافآت ستاكد',
    headline: 'استرجع ١٠٪\nمن كل فاتورة',
    subhead: 'الاشتراك مجاني ولا يستغرق دقيقة.',
    steps: [
      'امسح الرمز وسجّل',
      'اعرض رمزك عند الطلب',
      'اخصم نقاطك من فاتورتك القادمة',
    ],
    scanCta: 'امسح للتسجيل',
    rate: '١٠٠ نقطة = ١ ريال خصم',
    lead:
      'كل ريال تصرفه يرجع لك نقاط، والنقاط تُخصم مباشرة من فاتورتك القادمة. بدون أختام، وبدون بطاقة تضيع، وبدون شي تتذكره.',
    points: [
      {
        title: '١٠٪ ترجع لك، مو خصم',
        body:
          'عشرة بالمئة من كل فاتورة ترجع لك نقاط. اصرفها متى ما تبي وعلى اللي تبي، وتبقى صالحة سنة كاملة.',
      },
      {
        title: 'رمزك في جوالك',
        body:
          'اعرضه عند الطلب وتضاف النقاط تلقائياً. أضفه لمحفظة أبل أو لشاشتك الرئيسية ويصير على بُعد لمسة.',
      },
      {
        title: 'اجمع ثم اصرف',
        body:
          'من {n} نقطة تقدر تخصمها من الفاتورة، كامل الرصيد أو جزء منه. ١٠٠ نقطة تساوي ريال، فما تحتاج تحسب شي.',
      },
    ],
    joinCta: 'سجّل الحين',
    signInCta: 'عندي حساب',
    fine:
      'النقاط تُحتسب على إجمالي الفاتورة شامل الضريبة، وتنتهي بعد ١٢ شهراً من عدم النشاط. ستاكد - الخبر الشمالية.',
    bonus: '{n} نقطة هدية عند التسجيل',
    percent: '{n}٪',
  },
};

/** The other locale. The printed sheets always carry both. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

/**
 * A figure in the numerals the locale actually reads.
 *
 * Arabic copy here uses Arabic-Indic digits throughout, so a Western-numeral
 * figure dropped into an Arabic line is immediately visible as a mistake.
 */
export function rewardsNumber(locale: Locale, n: number): string {
  return locale === 'ar' ? toArabicDigits(n) : String(n);
}

/** Fills a `{n}` template with a locale-appropriate figure. */
export function fillRewards(template: string, locale: Locale, n: number): string {
  return template.replace('{n}', rewardsNumber(locale, n));
}
