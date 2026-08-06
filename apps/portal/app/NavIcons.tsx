/**
 * Nav glyphs for the customer portal.
 *
 * Inline SVG rather than an icon font: a handful of glyphs do not justify a
 * network request, and `currentColor` means they follow the nav's own colour.
 *
 * They sit beside labels, never replacing them. Most visits here are a phone
 * scanned at a counter by someone who has never seen the page before.
 */

// Typed as SVGProps so the literals keep their narrow types when spread. An
// untyped object widens `focusable: 'false'` to `string`, which the JSX prop
// will not accept.
const base: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export function IconPoints() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10h4a1.8 1.8 0 0 1 0 3.6h-4" />
    </svg>
  );
}

export function IconRewards() {
  return (
    <svg {...base}>
      <path d="M3 9.5h18V21H3zM3 9.5 5 4h14l2 5.5M12 4v17" />
    </svg>
  );
}

export function IconQr() {
  return (
    <svg {...base}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h2.5v2.5H14zM19.5 16.5H17v3h3V17" />
    </svg>
  );
}

export function IconSignOut() {
  return (
    <svg {...base}>
      <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" />
      <path d="M19 12H9m10 0-3-3m3 3-3 3" />
    </svg>
  );
}
