/**
 * The strip that says "this is pretend".
 *
 * It is deliberately impossible to miss and impossible to remove from inside the demo: a merchant
 * must never mistake a demo sale for a sale, and a stranger evaluating slip must never think the
 * numbers are live.
 */

import { clearDemo } from '../core/storage';
import { isSkinV2 } from './skin';

export default function DemoBanner() {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b border-warn px-3 py-1.5 text-[11px] text-warn ${isSkinV2() ? 'v2-demo' : 'sticky top-0 z-30 bg-warn/10'}`}
    >
      <span>
        <strong className="text-[11px] uppercase tracking-[0.08em]">Demo</strong> — a pretend shop. Nothing leaves
        this device, no money is involved, and the explorer is simulated.
      </span>
      <button
        type="button"
        onClick={() => {
          clearDemo();
          window.location.href = window.location.pathname;
        }}
        className="rounded border border-warn px-2 py-0.5 text-xs"
      >
        exit demo
      </button>
    </div>
  );
}
