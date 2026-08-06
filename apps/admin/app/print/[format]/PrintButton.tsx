'use client';

import { useEffect, useState } from 'react';

/**
 * Print, but not before the brand faces have actually loaded.
 *
 * The @font-face rules use `font-display: swap`, which is right for the website
 * and wrong here: it means a print fired in the first few hundred milliseconds
 * silently sets the whole sheet in the fallback system font. On screen that
 * self-corrects a moment later and nobody notices. On an 850 x 2000 mm banner
 * it is a wasted print run.
 *
 * So the button waits. `document.fonts.load()` is called explicitly per face
 * rather than relying on `document.fonts.ready` alone, because these faces are
 * split by `unicode-range` and `ready` can resolve before the browser has
 * decided it needs the Arabic subset at all.
 */
export function PrintButton() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await Promise.all([
          // Sample glyphs from each script, so the unicode-range split resolves
          // to a real download rather than being skipped as unneeded.
          document.fonts.load('900 1em Tajawal', 'استرجع'),
          document.fonts.load('800 1em Tajawal', 'مكافآت'),
          document.fonts.load('700 1em Tajawal', 'Get back'),
          document.fonts.load('600 1em Cairo', 'النقاط'),
          document.fonts.load('600 1em Cairo', 'points'),
        ]);
        await document.fonts.ready;
      } catch {
        // A font that will not load is not a reason to block printing outright;
        // better a sheet in the fallback face than no way to print at all. The
        // owner can see the difference on screen before committing to a run.
      }
      if (alive) setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed',
        insetBlockEnd: 20,
        insetInlineEnd: 20,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        className="primary"
        disabled={!ready}
        onClick={() => window.print()}
      >
        {ready ? 'Print / Save as PDF' : 'Loading fonts...'}
      </button>
    </div>
  );
}
