/**
 * Connection, install and update state — three facts a till should never hide.
 *
 * A merchant needs to know when payment detection will not work (offline), whether this is
 * an installed app or a tab, and when a new version is ready. The update rule is the
 * important one: never reload mid-sale. Show it, let the human choose.
 */

import { useEffect, useState } from 'react';

interface State {
  online: boolean;
  installed: boolean;
  updateReady: boolean;
}

export default function Status() {
  const [state, setState] = useState<State>({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    installed: false,
    updateReady: false,
  });

  useEffect(() => {
    const sync = () => setState((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setState((s) => ({ ...s, installed: standalone }));

    // A waiting service worker means a new build is downloaded but not active. It must
    // never activate under a live sale, so we only report it.
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        const check = () => setState((s) => ({ ...s, updateReady: Boolean(reg.waiting) }));
        check();
        reg.addEventListener('updatefound', check);
      });
    }

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted">
      <span className={`chip ${state.online ? 'chip-good' : 'border-warn text-warn'}`}>
        {state.online ? 'online' : 'offline — no payment detection'}
      </span>
      <span className="chip">{state.installed ? 'installed app' : 'in a browser tab'}</span>
      {state.updateReady && (
        <button
          type="button"
          onClick={() => {
            void navigator.serviceWorker.getRegistration().then((r) => {
              r?.waiting?.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            });
          }}
          className="chip chip-accent"
        >
          new version ready — reload
        </button>
      )}
    </div>
  );
}
