/**
 * Staff preferences: interface language and theme.
 *
 * ⚠ BOTH LIVE IN COOKIES AND ARE READ ON THE SERVER, which is the whole reason
 * this app can do what the website cannot. `apps/web` is a static export: it has
 * no request at render time, so its theme toggle writes localStorage and needs a
 * blocking <head> script to apply the choice before first paint, or a returning
 * visitor sees the wrong theme flash.
 *
 * The admin renders per request. Reading the cookie in the root layout means
 * `lang`, `dir` and `data-theme` are already correct in the HTML that leaves the
 * server — no flash, no hydration mismatch, and no script in <head>. Arabic in
 * particular has to work this way: `dir="rtl"` applied by JavaScript after paint
 * reflows the entire page in front of the person reading it.
 *
 * Not stored in the database on purpose. This is a property of the machine on
 * the counter, not of the person signed in — the tablet by the till can sit in
 * Arabic while the owner's laptop stays English, and the same login is used on
 * both.
 */

import { cookies } from 'next/headers';

export type Lang = 'en' | 'ar';
/** `system` means: no override, follow the device's prefers-color-scheme. */
export type Theme = 'system' | 'light' | 'dark';

export const LANG_COOKIE = 'stackd-admin-lang';
export const THEME_COOKIE = 'stackd-admin-theme';

/**
 * A year. These are conveniences, not credentials — nothing here is worth
 * re-choosing every shift, and a session-length cookie would reset the counter
 * tablet's language every time the browser restarted.
 */
const MAX_AGE = 60 * 60 * 24 * 365;

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === 'ar' ? 'ar' : 'en';
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Direction for the current language. Arabic is the only RTL one here. */
export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export async function setLang(lang: Lang): Promise<void> {
  (await cookies()).set(LANG_COOKIE, lang, {
    maxAge: MAX_AGE,
    path: '/',
    sameSite: 'lax',
    // Not httpOnly: there is nothing to protect, and a future client component
    // that wants to read the language should be able to.
    httpOnly: false,
  });
}

export async function setTheme(theme: Theme): Promise<void> {
  (await cookies()).set(THEME_COOKIE, theme, {
    maxAge: MAX_AGE,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });
}
