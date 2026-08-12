'use client';

import { useEffect, useRef, useState } from 'react';

import { t } from '@/lib/i18n.ts';
import type { Lang } from '@/lib/prefs.ts';

/**
 * The cashier's code reader.
 *
 * Two input paths, deliberately, because a busy counter has two realities:
 *
 *  - A HARDWARE barcode scanner behaves as a keyboard: it types the code, and
 *    MAY OR MAY NOT press Enter afterwards. It is faster and far more reliable
 *    than a camera, and it is what a real till should end up with. The field
 *    below is always focused, so a scan just works with nothing to tap.
 *
 *    ⚠ This originally assumed the Enter. Real scanners ship with the suffix
 *    turned off as often as on, it is a configuration burned into the device,
 *    and on the counter the symptom is a cashier scanning a card and then having
 *    to reach for the mouse — every single time. The code now submits itself
 *    when it recognises a scan, so the suffix stopped mattering. See the
 *    constants below for why that recognition is based on speed, not length.
 *
 *  - The DEVICE CAMERA, for a phone or tablet with nothing plugged in. Chrome on
 *    Android has BarcodeDetector natively; Safari does not, so there the camera
 *    button is simply not offered and the field remains.
 *
 * Typing the code by hand is always possible. Scanners fail, screens crack, and
 * the alphabet was chosen so a code can be read aloud.
 */

/**
 * Every code this page accepts: 8 characters for a member card, 10 for a
 * redemption or a bill claim, all from the alphabet that omits 0/O/1/I/L.
 *
 * Auto-submit is gated on this so a scanner pointed at the wrong thing — a
 * product barcode, a delivery label — leaves what it read in the box for the
 * cashier to see, rather than firing a request that comes back "not one of ours"
 * with nothing on screen explaining what was actually scanned.
 */
const CODE_ALPHABET = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/;
const CODE_LENGTHS = new Set([8, 10]);

/**
 * ⚠ WHY SPEED AND NOT LENGTH.
 *
 * The obvious auto-submit is "fire when the field holds a valid code". It is
 * wrong here: a member code is 8 characters and a redemption token is 10, so the
 * first 8 characters of a token typed by hand ARE a valid member code. That
 * submits half a token and tells the cashier it is not one of ours, mid-word.
 *
 * A hardware scanner is a keyboard that types a whole code in a few
 * milliseconds. Nobody types 8 characters in under a tenth of a second, so the
 * gap between keystrokes separates the two cases completely. Manual typing never
 * auto-submits — Enter and the Go button stay exactly as they were.
 */
const BURST_GAP_MS = 40;
/** Quiet time after the last character before we accept the burst as finished. */
const SETTLE_MS = 120;
/** Characters that must arrive in one burst. Below this it is not a scan. */
const MIN_BURST = 6;

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export function Scanner({
  action,
  takeFocus = true,
  lang,
}: {
  action: (formData: FormData) => Promise<void>;
  lang: Lang;
  /**
   * Whether this field should grab the caret on mount.
   *
   * False while a follow-up form is on screen — the bill total, or a member
   * code for a receipt. A hardware scanner types into whatever is focused, and
   * this effect runs AFTER React applies `autoFocus`, so leaving it unconditional
   * stole the caret back and the cashier's bill total went into the scan box.
   */
  takeFocus?: boolean;
}) {
  const [code, setCode] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canUseCamera, setCanUseCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Scanner detection. Refs, not state: these change on every keystroke and
  // nothing on screen depends on them, so re-rendering the field mid-scan would
  // be work for no visible effect.
  const lastKeyAt = useRef(0);
  const burst = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = useRef(false);
  /**
   * Length of the field as of the previous change.
   *
   * ⚠ Deliberately a ref rather than reading `code` from the render closure.
   * Whether React has re-rendered between two keystrokes is exactly the question
   * this feature turns on, and a stale `code` would misread a scanner's burst as
   * a person typing — failing only at scanner speed, which is the one speed that
   * matters and the hardest to reproduce by hand.
   */
  const prevLen = useRef(0);

  useEffect(() => {
    setCanUseCamera(typeof window !== 'undefined' && 'BarcodeDetector' in window);
    if (takeFocus) inputRef.current?.focus();
  }, [takeFocus]);

  // A pending timer outliving the component would fire requestSubmit on a form
  // that has navigated away.
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  /**
   * Called on every change to the field. Decides whether what just arrived came
   * from a scanner, and submits if so.
   */
  function handleInput(raw: string) {
    // Uppercased here rather than left to the database, so the length and
    // alphabet test below sees the same string the server will.
    const next = raw.toUpperCase();
    const before = prevLen.current;
    prevLen.current = next.length;
    const grew = next.length > before;
    setCode(next);

    // Typing again after a submit means a new code is arriving, so the latch
    // that stopped the last one double-firing is released here rather than on a
    // timer. Without this, a second scan on the same screen never fires.
    submitted.current = false;

    const now = performance.now();
    const gap = now - lastKeyAt.current;
    lastKeyAt.current = now;

    if (!grew) {
      // A correction, a deletion, or the field being cleared. Whatever was
      // happening, it was not an uninterrupted scan.
      burst.current = 0;
    } else if (next.length - before > 1) {
      // Several characters at once: a paste, or a scanner the browser delivers
      // as one event. Both are a scan by any useful definition.
      burst.current = next.length;
    } else {
      burst.current = gap < BURST_GAP_MS ? burst.current + 1 : 1;
    }

    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (submitted.current) return;
      if (burst.current < MIN_BURST) return;
      if (!CODE_LENGTHS.has(next.length) || !CODE_ALPHABET.test(next)) return;
      submitted.current = true;
      // The same form the Go button posts, so there is one code path for the
      // scanner, the camera and the cashier's finger.
      formRef.current?.requestSubmit();
    }, SETTLE_MS);
  }

  // Camera loop. Only mounted while the camera is on, and always torn down —
  // a live camera left running behind a page navigation keeps the indicator lit
  // and drains the battery of whatever is sat on the counter.
  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera. Without this a tablet opens the selfie camera and
          // the cashier has to turn it round, which nobody does twice.
          video: { facingMode: 'environment' },
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(video);
            if (found.length > 0) {
              stopped = true;
              setCameraOn(false);
              // Fill the real field and submit the real form, rather than
              // calling the action directly. One code path for camera and
              // keyboard means one thing to get right.
              const scanned = found[0].rawValue.trim().toUpperCase();
              setCode(scanned);
              prevLen.current = scanned.length;
              submitted.current = true;
              requestAnimationFrame(() => formRef.current?.requestSubmit());
              return;
            }
          } catch {
            // A single failed frame is normal while focusing. Keep going.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        setCameraError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? t(lang, 'scan.cameraDenied')
            : t(lang, 'scan.cameraFailed'),
        );
        setCameraOn(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  return (
    <div className="scanner">
      {/*
        A real server-action form, not a JS handler. A till is the last place to
        depend on client JavaScript: if it fails to load the counter still has to
        work, and a plain form post does. The camera path submits this same form.
      */}
      {/*
        Every route into this form lands here: the Go button, Enter from a
        scanner that appends one, the camera, and the settle timer. Latching on
        submit is what stops a scanner that DOES send Enter from posting twice —
        the native submit fires first, and the timer 120ms later finds the latch
        already closed.
      */}
      <form
        ref={formRef}
        action={action}
        className="scan-form"
        onSubmit={() => {
          submitted.current = true;
          if (settleTimer.current) clearTimeout(settleTimer.current);
        }}
      >
        <label htmlFor="code">
          {t(lang, 'scan.label')} <span className="hint">{t(lang, 'scan.hint')}</span>
        </label>
        <div className="scan-row">
          <input
            ref={inputRef}
            id="code"
            name="code"
            value={code}
            onChange={(e) => handleInput(e.target.value)}
            // A hardware scanner types fast and presses Enter. Autocomplete and
            // autocorrect would both interfere with that.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD2345"
            className="mono"
          />
          <button type="submit" className="primary">
            {t(lang, 'a.go')}
          </button>
          {canUseCamera ? (
            <button type="button" onClick={() => setCameraOn((v) => !v)}>
              {cameraOn ? t(lang, 'scan.stopCamera') : t(lang, 'scan.useCamera')}
            </button>
          ) : null}
        </div>
      </form>

      {cameraError ? <div className="banner bad">{cameraError}</div> : null}

      {cameraOn ? (
        <div className="scan-video">
          {/* muted + playsInline or iOS refuses to play it inline at all. */}
          <video ref={videoRef} muted playsInline />
          <p className="muted">{t(lang, 'scan.point')}</p>
        </div>
      ) : null}

      {!canUseCamera ? (
        <p className="muted sm">{t(lang, 'scan.noReader')}</p>
      ) : null}
    </div>
  );
}
