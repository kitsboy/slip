/**
 * The strip that says "this is pretend".
 *
 * It is deliberately impossible to miss and impossible to remove from inside the demo: a merchant
 * must never mistake a demo sale for a sale, and a stranger evaluating slip must never think the
 * numbers are live.
 */

import { clearDemo } from '../core/storage';

export default function DemoBanner() {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-warn bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
      <span>
        <strong className="uppercase tracking-wider">Demo</strong> — a pretend shop. Nothing leaves
        this device, no money is involved, and the explorer is simulated.
      </span>
      <button
        type="button"
        onClick={() => {
          clearDemo();
          window.location.href = window.location.pathname;
        }}
        className="rounded border border-warn px-2 py-0.5 text-[10px] uppercase tracking-wider"
      >
        exit demo
      </button>
    </div>
  );
}
