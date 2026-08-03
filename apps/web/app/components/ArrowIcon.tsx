/**
 * Forward arrow for a call-to-action button.
 *
 * Extracted because two section-closing CTAs use it and the inline SVG was
 * fifteen lines each. The nudge-on-hover and the RTL mirroring both live in
 * `.btn-arrow` in globals.css — an arrow pointing against the reading direction
 * reads as "back", so it flips with the document direction.
 */
export function ArrowIcon() {
  return (
    <svg
      className="btn-arrow"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}
