/**
 * Language and theme switches for the portal chrome.
 *
 * ⚠ PLAIN FORMS POSTING SERVER ACTIONS, NOT CLIENT HANDLERS. A till is the last
 * place to depend on client JavaScript: if the bundle fails to load on shop
 * wifi, the counter still has to work. These are `<button type="submit">`
 * inside `<form action={...}>`, so they function with JavaScript disabled,
 * still loading, or broken.
 *
 * The cost is a round trip and a re-render per switch, which is the right trade
 * for something touched a few times a day. The scanner, touched a few hundred
 * times a day, is a client component for exactly the opposite reason.
 */

import { setLang, setTheme, type Lang, type Theme } from '@/lib/prefs.ts';
import { t } from '@/lib/i18n.ts';
import { revalidatePath } from 'next/cache';

async function switchLang(formData: FormData): Promise<void> {
  'use server';
  await setLang(formData.get('lang') === 'ar' ? 'ar' : 'en');
  // The whole tree, because the language changes every string on every page —
  // including the nav that is rendered by the layout above this component.
  revalidatePath('/', 'layout');
}

async function switchTheme(formData: FormData): Promise<void> {
  'use server';
  const next = String(formData.get('theme') ?? 'system');
  await setTheme(next === 'light' || next === 'dark' ? (next as Theme) : 'system');
  revalidatePath('/', 'layout');
}

export function LangSwitch({ lang }: { lang: Lang }) {
  const next: Lang = lang === 'ar' ? 'en' : 'ar';
  return (
    <form action={switchLang} className="pref">
      <input type="hidden" name="lang" value={next} />
      <button
        type="submit"
        className="pref-btn"
        // Names the language you would switch TO, which is the convention every
        // bilingual site in the Kingdom uses, and is why the label is always in
        // that other language rather than translated.
        title={t(lang, 'nav.languageSwitch')}
        aria-label={t(lang, 'nav.languageSwitch')}
        lang={next}
      >
        {next === 'ar' ? 'العربية' : 'English'}
      </button>
    </form>
  );
}

/**
 * Three states rather than two: light, dark, and follow the device.
 *
 * Two-state toggles cannot express "I have not chosen", so the moment a switch
 * is added the device preference is silently overridden forever. The shop's
 * tablet may well be set to switch itself at dusk, and that should keep working
 * for anyone who never touches this.
 */
export function ThemeSwitch({ lang, theme }: { lang: Lang; theme: Theme }) {
  const order: Theme[] = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const label =
    theme === 'light'
      ? t(lang, 'nav.themeLight')
      : theme === 'dark'
        ? t(lang, 'nav.themeDark')
        : t(lang, 'nav.themeSystem');

  return (
    <form action={switchTheme} className="pref">
      <input type="hidden" name="theme" value={next} />
      <button type="submit" className="pref-btn" title={t(lang, 'nav.theme')} aria-label={t(lang, 'nav.theme')}>
        {/* The icon shows the state you are IN, and the word beside it names
            that state. A toggle whose icon shows the destination needs no label;
            a three-way cycle does, or nobody can tell dark from device-that-is
            -currently-dark. */}
        <ThemeIcon theme={theme} />
        <span className="pref-word">{label}</span>
      </button>
    </form>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1z" />
      </svg>
    );
  }
  // Device: a monitor, meaning "whatever this screen says".
  return (
    <svg {...common}>
      <rect x="2.8" y="4.2" width="18.4" height="12.4" rx="1.8" />
      <path d="M8.5 20.2h7M12 16.6v3.6" />
    </svg>
  );
}
