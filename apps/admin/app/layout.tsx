import type { Metadata } from 'next';

import { dirFor, getLang, getTheme } from '@/lib/prefs.ts';
import './globals.css';

export const metadata: Metadata = {
  title: 'STACKD admin',
  description: 'Loyalty, rewards and menu for STACKD',
  robots: { index: false, follow: false },
  // The rooster, same as the website. A blank tab among several open STACKD
  // tabs is genuinely hard to find; the icon is what makes them distinguishable
  // at a glance during a shift.
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read per request, so the HTML that leaves the server is already in the right
  // language, direction and theme. The website has to do this with a blocking
  // <head> script because it is a static export with no request to read; this
  // app has one, and using it means no flash and no reflow.
  //
  // `dir` in particular MUST be server-rendered. Applied by JavaScript after
  // paint it would mirror the entire page in front of whoever is reading it.
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);

  return (
    // suppressHydrationWarning applies to THIS element's attributes only, one
    // level deep — children are still fully hydration-checked.
    //
    // Browser extensions stamp classes onto <html> before React loads
    // (Modernizr-style `no-touch`, dark-mode forcers, password managers). The
    // server cannot know about them, so React reports a mismatch it can never
    // reconcile. Same fix as the website's root layout, which hit this first.
    <html
      lang={lang}
      dir={dirFor(lang)}
      // Absent when the staff member has not chosen, which is what lets the
      // `prefers-color-scheme` block in globals.css stay in charge. Writing
      // data-theme="system" instead would match neither override block and read
      // as a bug the first time somebody greps for it.
      data-theme={theme === 'system' ? undefined : theme}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
