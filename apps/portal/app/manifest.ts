import type { MetadataRoute } from 'next';

/**
 * Lets the portal install to a phone's home screen.
 *
 * This is the free half of "make the code easy to show at the counter": no
 * developer account, no issuer approval, no annual fee. Installed, it opens
 * straight to /points with the QR already on screen, which removes the browser
 * chrome, the address bar and the sign-in step from the moment someone is stood
 * at the till holding up a phone.
 *
 * `start_url` deliberately points at /points rather than /. A signed-out visitor
 * is redirected to /login from there anyway, so the deep link costs nothing and
 * saves a hop for everyone else.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'STACKD Rewards',
    short_name: 'STACKD',
    description: 'Your points and rewards at STACKD.',
    start_url: '/points',
    scope: '/',
    // standalone hides the browser UI, so it reads as an app rather than a page.
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#141512',
    theme_color: '#141512',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
