/**
 * Which language the customer portal speaks.
 *
 * ⚠ THE DEFAULT IS ARABIC, and that is not a guess. `customers.locale` has
 * defaulted to `'ar'` since the schema was written, the registration form asks
 * for it, and the counter signup sets it — so the database has been recording a
 * language preference for every member while the portal served everyone English.
 *
 * Resolution order:
 *
 *   1. the cookie, if this device has been switched deliberately;
 *   2. Arabic.
 *
 * The cookie is SEEDED FROM THE CUSTOMER'S OWN RECORD at sign-in, in
 * `startSession()`. Doing it there rather than reading the customer on every
 * request keeps the root layout free of a database query, and means a member
 * enrolled at the counter as an Arabic speaker opens the portal in Arabic
 * without touching anything.
 *
 * A customer who switches language afterwards keeps their choice: the cookie is
 * only seeded when it is absent.
 */

import { cookies } from 'next/headers';

export type Lang = 'ar' | 'en';

export const LANG_COOKIE = 'stackd-portal-lang';

/** A year. This is a convenience, not a credential. */
const MAX_AGE = 60 * 60 * 24 * 365;

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === 'en' ? 'en' : 'ar';
}

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export async function setLang(lang: Lang): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang, {
    maxAge: MAX_AGE,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });
}

/**
 * Sets the language from the customer's record, unless this device has already
 * chosen. Called once, at sign-in.
 */
export async function seedLangFrom(locale: string | null | undefined): Promise<void> {
  const jar = await cookies();
  if (jar.get(LANG_COOKIE)) return;
  await setLang(locale === 'en' ? 'en' : 'ar');
}
