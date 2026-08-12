'use client';

import { useEffect, useState } from 'react';

import { t, tf } from '@/lib/i18n.ts';
import type { Lang } from '@/lib/prefs.ts';
import { useFormStatus } from 'react-dom';

/**
 * The redemption QR and its countdown.
 *
 * Client-side because a code that expires in three minutes needs a ticking
 * clock, and because the amount field defaults to the whole balance but has to
 * stay editable. The QR itself is rendered on the server and handed down as
 * markup — generating it in the browser would mean shipping an encoder to every
 * phone for one image.
 *
 * When the clock runs out the code is not merely hidden: the panel returns to
 * the form. An expired QR still on screen is something a cashier will try to
 * scan, and the refusal would look like a broken system rather than a stale one.
 */

export interface ActiveCode {
  token: string;
  points: number;
  qrSvg: string;
  expiresAt: string;
  /**
   * Set when the code is a catalogue reward rather than points off a bill.
   * The customer has to be told WHICH thing they claimed — "3.00 SAR comes off
   * your bill" is wrong and alarming when what they claimed was a free sauce.
   */
  rewardName?: string | null;
}

export function RedeemPanel({
  balance,
  minRedeem,
  active,
  issue,
  cancel,
  lang,
}: {
  /* Passed down: the language lives in a cookie, and cookies are a server
     concern. `t()` is safe here because lib/i18n.ts imports Lang as a TYPE
     only and so pulls in no server code. */
  lang: Lang;
  balance: number;
  /** Fewest points that may be spent in one go. 0 means no floor. */
  minRedeem: number;
  active: ActiveCode | null;
  issue: (formData: FormData) => Promise<void>;
  cancel: () => Promise<void>;
}) {
  if (active) return <LiveCode active={active} cancel={cancel} lang={lang} />;
  return <AmountForm balance={balance} minRedeem={minRedeem} issue={issue} lang={lang} />;
}

/** 1 point = 1 halala, so the riyal value is the balance with a decimal point. */
function asRiyals(points: number): string {
  return (points / 100).toFixed(2);
}

function AmountForm({
  balance,
  minRedeem,
  issue,
  lang,
}: {
  lang: Lang;
  balance: number;
  minRedeem: number;
  issue: (formData: FormData) => Promise<void>;
}) {
  // Defaults to everything, which is what most people want and saves a decision
  // at the counter. Still editable, because sometimes it is not.
  const [points, setPoints] = useState(balance);

  if (balance <= 0) {
    return (
      <p className="empty">
        {t(lang, 'rp.noPoints')}
      </p>
    );
  }

  // Below the floor there is nothing to fill in, so the form is replaced rather
  // than shown disabled. Telling somebody exactly how far off they are is more
  // use than telling them the rule.
  if (minRedeem > 0 && balance < minRedeem) {
    return (
      <p className="empty">
        {tf(lang, 'rp.needMore', { n: minRedeem })}{' '}
        {tf(lang, 'rp.thatIs', { n: minRedeem - balance })}
      </p>
    );
  }

  const floor = minRedeem > 0 ? minRedeem : 1;
  const invalid = !Number.isInteger(points) || points < floor || points > balance;

  return (
    /* The server action directly, not wrapped in a client closure. Wrapping it
       means the form only submits when JavaScript is alive, and a customer at a
       counter on bad shop wifi is exactly who cannot afford that. */
    <form action={issue} className="redeem-form">
      <label htmlFor="points">
        {t(lang, 'rp.howMany')}{' '}
        <span className="hint">
          {tf(lang, 'rp.youHave', { n: balance })}
          {minRedeem > 0 ? ` · ${tf(lang, 'rp.minimum', { n: minRedeem })}` : ''}
        </span>
      </label>
      <div className="redeem-input">
        {/* The line below the field is this input's description in both states:
            the riyal value when the amount is good, the reason when it is not.
            Without aria-describedby it was neither announced nor connected to
            the field, so a screen reader hit a disabled Redeem button with no
            way to find out why. */}
        <input
          id="points"
          name="points"
          type="number"
          inputMode="numeric"
          min={floor}
          max={balance}
          step={1}
          value={Number.isNaN(points) ? '' : points}
          onChange={(e) => setPoints(e.target.valueAsNumber)}
          aria-describedby="points-worth"
          aria-invalid={invalid || undefined}
          required
        />
        <button
          type="button"
          className="redeem-all"
          onClick={() => setPoints(balance)}
          disabled={points === balance}
        >
          {t(lang, 'rp.all')}
        </button>
      </div>

      <p className="redeem-worth" id="points-worth">
        {invalid ? (
          <span className="neg">
            {tf(lang, 'rp.between', { a: floor, b: balance })}
          </span>
        ) : (
          <>
            {tf(lang, 'rp.worthOff', { sar: asRiyals(points) })}
          </>
        )}
      </p>

      <RedeemSubmit disabled={invalid} />
    </form>
  );
}

/** Split out so useFormStatus can see the form it lives inside. */
function RedeemSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary wide" disabled={pending || disabled}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Creating your code…
        </>
      ) : (
        'Redeem'
      )}
    </button>
  );
}

function LiveCode({ active, cancel, lang }: { active: ActiveCode; cancel: () => Promise<void>; lang: Lang }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.round((new Date(active.expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    // Recomputed from the expiry timestamp each tick rather than decremented.
    // A phone that sleeps mid-countdown would otherwise resume with a clock that
    // is wrong by however long the screen was off.
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round((new Date(active.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [active.expiresAt]);

  if (left <= 0) {
    return (
      <div className="redeem-expired">
        <p>
          {t(lang, 'rp.expired')}
        </p>
        <form action={cancel}>
          <button type="submit" className="primary wide">
            {t(lang, 'rp.newOne')}
          </button>
        </form>
      </div>
    );
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="redeem-live">
      <p className="redeem-instruction">
        {active.rewardName ? (
          <>
            {tf(lang, 'rp.showReward', { what: active.rewardName, n: active.points })}
          </>
        ) : (
          <>
            {tf(lang, 'rp.showCashier', { n: active.points, sar: asRiyals(active.points) })}
          </>
        )}
      </p>
      <div className="member-qr" dangerouslySetInnerHTML={{ __html: active.qrSvg }} />
      <p className="member-code mono">{active.token}</p>
      <p className={`redeem-timer${left <= 30 ? ' urgent' : ''}`}>
        {tf(lang, 'rp.expiresIn', { t: `${mm}:${ss}` })}
      </p>
      <form action={cancel}>
        <button type="submit" className="quiet">
          {t(lang, 'a.cancel')}
        </button>
      </form>
    </div>
  );
}
