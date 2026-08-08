/**
 * Nav glyphs for the staff portal.
 *
 * Inline SVG rather than an icon font: eight glyphs do not justify a network
 * request, and `currentColor` means they follow the nav's own colour through
 * both themes without a second rule.
 *
 * They sit beside labels, never replacing them. An icon alone is a guessing game
 * for anyone who has not used the tool before, and this is a tool people use
 * mid-shift with a queue in front of them.
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

export function IconOverview() {
  return (
    <svg {...base}>
      <path d="M3 13h6V3H3zM15 21h6V11h-6zM3 21h6v-5H3zM15 8h6V3h-6z" />
    </svg>
  );
}

export function IconOrders() {
  return (
    <svg {...base}>
      <path d="M6 3h12l1.5 17a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1z" />
      <path d="M9 7c0 1.7 1.3 3 3 3s3-1.3 3-3" />
    </svg>
  );
}

export function IconMembers() {
  return (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 20c0-2.4-.9-4.1-2.3-5.1" />
    </svg>
  );
}

export function IconPoints() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10h4a1.8 1.8 0 0 1 0 3.6h-4" />
    </svg>
  );
}

export function IconReports() {
  return (
    <svg {...base}>
      <path d="M3 21h18" />
      <path d="M6 21v-7M11 21V6M16 21v-4M21 21V11" />
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

export function IconMenu() {
  return (
    <svg {...base}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function IconStaff() {
  return (
    <svg {...base}>
      <circle cx="12" cy="7.5" r="3.3" />
      <path d="M5.5 20c0-3.4 2.9-5.7 6.5-5.7s6.5 2.3 6.5 5.7" />
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
