'use client';

import { useEffect, useState } from 'react';
import {
  STACKD_HOURS,
  isOpenAt,
  minutesUntilClose,
  minutesUntilOpen,
  formatDuration,
  t,
  type Locale,
} from '@stackd/shared';

/**
 * Live "Open now / Closed" pill.
 *
 * Must be client-side: this is a static export, so anything computed at build
 * time would be frozen at whatever moment the site was deployed.
 *
 * Renders nothing until mounted. That avoids a hydration mismatch — the server
 * HTML is generated at build time and would otherwise disagree with the
 * browser's clock, which React logs as an error and patches visibly.
 */
export function OpenStatus({ locale }: { locale: Locale }) {
  const [state, setState] = useState<{
    open: boolean;
    detail: string | null;
  } | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const open = isOpenAt(STACKD_HOURS, now);

      let detail: string | null = null;
      if (open) {
        const mins = minutesUntilClose(STACKD_HOURS, now);
        // Only warn when it is genuinely nearly closing — an "8 hours" countdown
        // is noise.
        if (mins !== null && mins <= 60) {
          detail = `${t(locale, 'status.closesIn')} ${formatDuration(mins, locale)}`;
        }
      } else {
        const mins = minutesUntilOpen(STACKD_HOURS, now);
        if (mins !== null) {
          detail = `${t(locale, 'status.opensIn')} ${formatDuration(mins, locale)}`;
        }
      }
      setState({ open, detail });
    };

    compute();
    // Re-check each minute so the pill flips without a reload.
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [locale]);

  if (!state) {
    // Reserve the space so the layout does not jump when the pill appears.
    return <div className="status" aria-hidden="true" style={{ visibility: 'hidden' }}>—</div>;
  }

  return (
    <div className="status" data-open={state.open} role="status">
      <span className="status-dot" />
      <span>{t(locale, state.open ? 'status.open' : 'status.closed')}</span>
      {state.detail && <span className="status-detail">· {state.detail}</span>}
    </div>
  );
}
