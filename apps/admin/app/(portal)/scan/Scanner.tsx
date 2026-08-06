'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The cashier's code reader.
 *
 * Two input paths, deliberately, because a busy counter has two realities:
 *
 *  - A HARDWARE barcode scanner behaves as a keyboard: it types the code and
 *    presses Enter. It is faster and far more reliable than a camera, and it is
 *    what a real till should end up with. The field below is always focused, so
 *    a scan just works with nothing to tap.
 *
 *  - The DEVICE CAMERA, for a phone or tablet with nothing plugged in. Chrome on
 *    Android has BarcodeDetector natively; Safari does not, so there the camera
 *    button is simply not offered and the field remains.
 *
 * Typing the code by hand is always possible. Scanners fail, screens crack, and
 * the alphabet was chosen so a code can be read aloud.
 */

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
}: {
  action: (formData: FormData) => Promise<void>;
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

  useEffect(() => {
    setCanUseCamera(typeof window !== 'undefined' && 'BarcodeDetector' in window);
    if (takeFocus) inputRef.current?.focus();
  }, [takeFocus]);

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
              setCode(found[0].rawValue.trim().toUpperCase());
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
            ? 'Camera permission was refused. Type the code instead.'
            : 'Could not open the camera. Type the code instead.',
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
      <form ref={formRef} action={action} className="scan-form">
        <label htmlFor="code">
          Scan or type a code <span className="hint">member card, or a redemption QR</span>
        </label>
        <div className="scan-row">
          <input
            ref={inputRef}
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
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
            Go
          </button>
          {canUseCamera ? (
            <button type="button" onClick={() => setCameraOn((v) => !v)}>
              {cameraOn ? 'Stop camera' : 'Use camera'}
            </button>
          ) : null}
        </div>
      </form>

      {cameraError ? <div className="banner bad">{cameraError}</div> : null}

      {cameraOn ? (
        <div className="scan-video">
          {/* muted + playsInline or iOS refuses to play it inline at all. */}
          <video ref={videoRef} muted playsInline />
          <p className="muted">Point the camera at the code.</p>
        </div>
      ) : null}

      {!canUseCamera ? (
        <p className="muted" style={{ fontSize: 13 }}>
          This browser has no built-in barcode reader, so the camera button is
          hidden. A USB or Bluetooth scanner works here as a keyboard, and typing
          the code always works.
        </p>
      ) : null}
    </div>
  );
}
