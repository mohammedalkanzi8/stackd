'use client';

import { useEffect, useState } from 'react';
import { LOCALES, localeSwapPath, type Locale } from '@stackd/shared';

/**
 * Segmented AR | EN switch that keeps you on the SAME page.
 *
 * This has to be a client component. The site is a static export, so there is
 * no request-time way to know the current path — the previous version hardcoded
 * a link to the other locale's home page, which silently threw away the
 * visitor's place whenever they switched language.
 *
 * Both locales are always shown with the active one marked, rather than a single
 * "switch to X" button, so it is obvious at a glance which language you are in
 * and that the other is available.
 */
export function LangToggle({ locale }: { locale: Locale }) {
  // Null until mounted. The server render happens at BUILD time and cannot know
  // the path, so the initial href is the locale home page and is corrected on
  // mount. Path rewriting lives in localeSwapPath, which is unit-tested.
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  const hrefFor = (target: Locale) =>
    pathname === null ? `/${target}/` : localeSwapPath(pathname, target);

  return (
    <div className="langsw" role="group" aria-label="Language">
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <a
            key={l}
            href={hrefFor(l)}
            className="langsw-opt"
            data-active={active}
            aria-current={active ? 'true' : undefined}
            lang={l}
          >
            {l === 'ar' ? 'ع' : 'EN'}
          </a>
        );
      })}
    </div>
  );
}
