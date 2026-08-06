import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'STACKD Rewards',
  description: 'Your points, your rewards.',
  // Not a page anyone should find in a search result: it is a private account
  // area reached from a receipt, a poster, or the site's Login link.
  robots: { index: false, follow: false },
  // The rooster, same as the website. A blank tab among several open STACKD
  // tabs is genuinely hard to find; the icon is what makes them distinguishable
  // at a glance during a shift.
  // iOS does not read `display: standalone` from the manifest. Without this the
  // saved icon opens in Safari with the full browser chrome.
  appleWebApp: {
    capable: true,
    title: 'STACKD',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#141512',
  // The QR sits on a white card; a viewport that stops at the notch would crop
  // it on some phones held up to a scanner.
  viewportFit: 'cover',
  // Almost every visit is a phone, most of them scanning a QR in the shop.
  width: 'device-width',
  initialScale: 1,
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
