'use client';

import { useEffect, useState } from 'react';
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
}

export function RedeemPanel({
  balance,
  active,
  issue,
  cancel,
}: {
  balance: number;
  active: ActiveCode | null;
  issue: (formData: FormData) => Promise<void>;
  cancel: () => Promise<void>;
}) {
  if (active) return <LiveCode active={active} cancel={cancel} />;
  return <AmountForm balance={balance} issue={issue} />;
}

/** 1 point = 1 halala, so the riyal value is the balance with a decimal point. */
function asRiyals(points: number): string {
  return (points / 100).toFixed(2);
}

function AmountForm({
  balance,
  issue,
}: {
  balance: number;
  issue: (formData: FormData) => Promise<void>;
}) {
  // Defaults to everything, which is what most people want and saves a decision
  // at the counter. Still editable, because sometimes it is not.
  const [points, setPoints] = useState(balance);

  if (balance <= 0) {
    return (
      <p className="empty">
        No points to spend yet. Show your code when you order and 10% of the bill
        comes back.
      </p>
    );
  }

  const invalid = !Number.isInteger(points) || points < 1 || points > balance;

  return (
    /* The server action directly, not wrapped in a client closure. Wrapping it
       means the form only submits when JavaScript is alive, and a customer at a
       counter on bad shop wifi is exactly who cannot afford that. */
    <form action={issue} className="redeem-form">
      <label htmlFor="points">
        How many points? <span className="hint">you have {balance}</span>
      </label>
      <div className="redeem-input">
        <input
          id="points"
          name="points"
          type="number"
          inputMode="numeric"
          min={1}
          max={balance}
          step={1}
          value={Number.isNaN(points) ? '' : points}
          onChange={(e) => setPoints(e.target.valueAsNumber)}
          required
        />
        <button
          type="button"
          className="redeem-all"
          onClick={() => setPoints(balance)}
          disabled={points === balance}
        >
          All
        </button>
      </div>

      <p className="redeem-worth">
        {invalid ? (
          <span className="neg">Enter between 1 and {balance} points.</span>
        ) : (
          <>
            Worth <b>{asRiyals(points)} SAR</b> off your bill
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

function LiveCode({ active, cancel }: { active: ActiveCode; cancel: () => Promise<void> }) {
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
          That code expired. Codes last three minutes so a photo of your screen is
          worthless afterwards.
        </p>
        <form action={cancel}>
          <button type="submit" className="primary wide">
            Create a new one
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
        Show this to the cashier. <b>{active.points} points</b> ({asRiyals(active.points)} SAR)
        comes off your bill.
      </p>
      <div className="member-qr" dangerouslySetInnerHTML={{ __html: active.qrSvg }} />
      <p className="member-code mono">{active.token}</p>
      <p className={`redeem-timer${left <= 30 ? ' urgent' : ''}`}>
        Expires in {mm}:{ss}
      </p>
      <form action={cancel}>
        <button type="submit" className="quiet">
          Cancel
        </button>
      </form>
    </div>
  );
}
