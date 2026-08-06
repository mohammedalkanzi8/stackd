'use client';

import { useEffect, useState } from 'react';

/**
 * A real "add to home screen" button, rather than a line of text telling
 * somebody to go hunting in a browser menu.
 *
 * The three states are genuinely different platforms, not variations:
 *
 *  - Chrome and Edge (so: most Android) fire `beforeinstallprompt`, which lets
 *    us show a button that opens the real install dialog.
 *  - Safari on iOS never fires it and offers no API at all. The only route is
 *    Share, then "Add to Home Screen", so the honest thing is to say exactly
 *    that rather than show a button that cannot work.
 *  - Already installed: say nothing. The app is on their home screen; offering
 *    to put it there again is noise.
 *
 * Renders nothing on the server. Everything here depends on the browser, and
 * guessing at render time would mismatch on hydration.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(true); // assume yes until proven otherwise
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    // `standalone` is the non-standard iOS flag; the media query covers everyone else.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    // iPadOS reports itself as a Mac, so touch support is the distinguishing test.
    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));

    const onPrompt = (e: Event) => {
      // Chrome shows its own banner otherwise, at a moment of its choosing.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  if (prompt) {
    return (
      <button
        type="button"
        className="install-btn"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          // The event is single-use; Chrome will fire a fresh one if it applies.
          setPrompt(null);
        }}
      >
        <PhoneIcon />
        Add to home screen
      </button>
    );
  }

  if (isIos) {
    return (
      <div className="install-ios">
        <button type="button" className="install-btn" onClick={() => setShowIosHelp((v) => !v)}>
          <PhoneIcon />
          Add to home screen
        </button>
        {showIosHelp ? (
          <p className="install-help">
            Tap <ShareIcon /> at the bottom of Safari, then choose{' '}
            <b>Add to Home Screen</b>.
          </p>
        ) : null}
      </div>
    );
  }

  // A browser that supports neither. Nothing useful to offer, so offer nothing.
  return null;
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 6.5v7M8.8 10.3 12 13.5l3.2-3.2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="inline-icon">
      <path d="M12 3v11M8.5 6.5 12 3l3.5 3.5" />
      <path d="M7 11H5.5v9h13v-9H17" />
    </svg>
  );
}
