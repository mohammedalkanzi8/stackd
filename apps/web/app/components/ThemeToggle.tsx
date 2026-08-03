'use client';

import { t, type Locale } from '@stackd/shared';

/**
 * Dark / light switch that sits beside the language toggle.
 *
 * The theme itself is pure CSS: `globals.css` defines the dark ground on
 * `:root` for every visitor, and `:root[data-theme='light']` overrides it. The
 * device's `prefers-color-scheme` is deliberately NOT consulted — dark is the
 * brand's ground regardless. All this button does is stamp `data-theme` onto
 * <html> and remember the choice.
 *
 * Which icon shows is decided in CSS, not here, using those same selectors. That
 * matters: the server render happens at BUILD time and cannot know the visitor's
 * theme, so choosing the icon in JS would either mismatch on hydration or force
 * a blank frame until mount. Letting CSS pick means the correct icon is painted
 * immediately and this component renders identically everywhere.
 *
 * The no-flash script in the layout <head> applies the stored choice before
 * first paint, so a returning visitor never sees the wrong theme flash.
 */
export function ThemeToggle({ locale }: { locale: Locale }) {
  function toggle() {
    const root = document.documentElement;
    // No data-theme yet means nobody has chosen, and the CSS default is dark for
    // everyone. This must NOT consult prefers-color-scheme: on a light-mode
    // device that would report 'light' while the page is visibly dark, so the
    // first click would compute 'dark' and appear to do nothing.
    const current = root.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';

    root.dataset.theme = next;
    try {
      localStorage.setItem('stackd-theme', next);
    } catch {
      // Private mode or blocked storage: the toggle still works for this page
      // view, it just will not be remembered. Not worth surfacing.
    }
  }

  return (
    <button
      type="button"
      className="themesw"
      onClick={toggle}
      // A static label, because the button's meaning ("switch theme") does not
      // depend on the current theme. An action-specific label would have to be
      // computed in JS and would mismatch on hydration.
      aria-label={t(locale, 'nav.theme')}
      title={t(locale, 'nav.theme')}
    >
      {/* Both icons ship; CSS reveals exactly one. Each shows the theme you
          would switch TO, which is the convention users expect. */}
      <svg
        className="themesw-i themesw-sun"
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </svg>
      <svg
        className="themesw-i themesw-moon"
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1z" />
      </svg>
    </button>
  );
}
