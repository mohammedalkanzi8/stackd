import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'STACKD Rewards',
  description: 'Your points, your rewards.',
  // Not a page anyone should find in a search result: it is a private account
  // area reached from a receipt, a poster, or the site's Login link.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#141512',
  // Almost every visit is a phone, most of them scanning a QR in the shop.
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
