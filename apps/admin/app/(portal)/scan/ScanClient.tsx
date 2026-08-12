'use client';

import { Scanner } from './Scanner.tsx';
import type { Lang } from '@/lib/prefs.ts';

/**
 * Client boundary for the scanner.
 *
 * The server action is passed straight through to a real <form action=...>, so
 * typing a code and pressing Enter works with no JavaScript at all. The camera
 * is the enhancement on top, not the mechanism.
 */
export function ScanClient({
  identify,
  takeFocus,
  lang,
}: {
  identify: (formData: FormData) => Promise<void>;
  takeFocus: boolean;
  /* Passed down rather than read here: the language lives in a cookie, and
     cookies are a server concern. `t()` itself is safe on the client because
     lib/i18n.ts imports Lang as a TYPE only and so pulls in no server code. */
  lang: Lang;
}) {
  return <Scanner action={identify} takeFocus={takeFocus} lang={lang} />;
}
