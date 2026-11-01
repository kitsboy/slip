import { useEffect, useRef } from 'react';

import { describeSweep } from '../core/reconcile';
import { sweepNow } from '../core/reconcile-run';
import { loadSettings } from '../core/settings';
import { isDemo, store as appStore } from '../core/storage';

/** How often to re-ask while the shop screen is in front of somebody. */
const VISIBLE_MS = 20_000;
/** Slower when the tab is hidden — still watching, without hammering a public explorer. */
const HIDDEN_MS = 90_000;

/**
 * Watches for money from every panel, not just the open till.
 *
 * slip has no server, so "background" means "while the app is open somewhere". This mounts once at
 * the app shell: it sweeps on load, when the network returns, when the tab comes back to the front,
 * and on a timer — slowly when hidden. When a payment lands while the tab is in the background the
 * page title gets a count, because a merchant shouldn't have to stare at the till to notice.
 *
 * Failure is silent on purpose: a sweep is a courtesy, never a transaction.
 */
export default function Watcher() {
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  const unseen = useRef(0);

  useEffect(() => {
    // The demo shop runs its own simulation; sweeping it too would race that timer.
    if (isDemo) return;

    let stopped = false;
    const setTitle = (n: number) => {
      document.title = n > 0 ? `● ${n} paid — slip` : 'slip';
    };

    const run = async () => {
      if (stopped || running.current) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      running.current = true;
      try {
        const { settings } = loadSettings(appStore());
        const out = await sweepNow(appStore(), settings);
        if (!out || stopped) return;
        window.dispatchEvent(new CustomEvent('slip:swept', { detail: describeSweep(out.result) }));
        if (!out.changed) return;
        window.dispatchEvent(new Event('slip:data-changed'));
        const paid = out.result.changes.filter((c) => c.to === 'complete' || c.to === 'confirmed').length;
        if (document.hidden && paid > 0) {
          unseen.current += paid;
          setTitle(unseen.current);
        }
      } catch {
        /* a sweep that fails changes nothing */
      } finally {
        running.current = false;
      }
    };

    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (stopped) return;
      timer.current = window.setTimeout(() => {
        void run();
        schedule();
      }, document.hidden ? HIDDEN_MS : VISIBLE_MS);
    };

    const wake = () => {
      if (!document.hidden) {
        unseen.current = 0;
        setTitle(0);
        void run();
      }
      schedule();
    };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void run();
    schedule();

    return () => {
      stopped = true;
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, []);

  return null;
}
