'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The nav, with the current page marked.
 *
 * ⚠ `globals.css` has styled `nav.main a[aria-current='page']` since the portal
 * was built, and nothing ever set the attribute — so the rule could not match
 * and the nav has never shown where you are. On a tool used mid-shift with a
 * queue waiting, that is the one piece of state the chrome exists to carry.
 *
 * A client component only because `usePathname` needs one. Everything here is
 * still a plain `<Link>`: with JavaScript broken the nav navigates exactly as
 * before and only the highlight is missing, which is the right thing to lose.
 *
 * Labels arrive already translated. The language lives in a cookie and cookies
 * are a server concern, so the server resolves the strings and this component
 * stays ignorant of the dictionary.
 */
export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({
  items,
  Icons,
}: {
  items: NavItem[];
  Icons: Record<string, React.ReactNode>;
}) {
  const pathname = usePathname();

  return (
    <>
      {items.map(({ href, label }) => {
        // Exact match for the overview, prefix match for everything else, so
        // /orders/AB12 still highlights Orders. Without the special case for
        // '/', every route would match it and two links would look current.
        const current = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} title={label} aria-current={current ? 'page' : undefined}>
            {Icons[href]}
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </>
  );
}
