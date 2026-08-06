import type { Metadata } from 'next';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning applies to THIS element's attributes only, one
    // level deep — children are still fully hydration-checked.
    //
    // Browser extensions stamp classes onto <html> before React loads
    // (Modernizr-style `no-touch`, dark-mode forcers, password managers). The
    // server cannot know about them, so React reports a mismatch it can never
    // reconcile. Same fix as the website's root layout, which hit this first.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
