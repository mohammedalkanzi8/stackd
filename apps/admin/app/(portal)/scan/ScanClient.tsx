'use client';

import { Scanner } from './Scanner.tsx';

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
}: {
  identify: (formData: FormData) => Promise<void>;
  takeFocus: boolean;
}) {
  return <Scanner action={identify} takeFocus={takeFocus} />;
}
