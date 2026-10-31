/**
 * "Prove it works."
 *
 * A merchant who downloaded one file deserves a way to check that the file still does what it
 * claims. This runs fixed vectors through the parts of slip that must be exact, in the browser,
 * with no network — and says plainly what that does and does not prove.
 */

import { useState } from 'react';
import { allPassed, runSelfTest, type SelfTestResult } from '../core/selftest';

export default function SelfTest() {
  const [results, setResults] = useState<SelfTestResult[] | null>(null);

  return (
    <section className="mt-6 panel" data-panel="selftest">
      <p className="eyebrow">Self test</p>
      <h2 className="panel-title mt-1">Prove it works</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Runs the arithmetic that must be exact — address derivation, money rounding, QR encoding and
        receipt proofs — against fixed answers, on this device, with the network off.
      </p>

      <button
        type="button"
        onClick={() => setResults(runSelfTest())}
        className="mt-3 rounded-lg border border-accent px-3 py-2 text-[11px] uppercase tracking-wider text-accent"
      >
        run the check
      </button>

      {results && (
        <div className="mt-3" data-selftest={allPassed(results) ? 'pass' : 'fail'}>
          <p className={`text-xs ${allPassed(results) ? 'text-ok' : 'text-bad'}`}>
            {allPassed(results) ? 'All checks passed on this copy.' : 'A check failed — do not rely on this copy.'}
          </p>
          <ul className="mt-2 space-y-1">
            {results.map((r) => (
              <li key={r.name} className="flex items-baseline gap-2 text-[11px]">
                <span className={r.ok ? 'text-ok' : 'text-bad'} aria-hidden>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span className="flex-1">{r.name}</span>
                <span className="font-mono text-[10px] text-muted">{r.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            What this proves: the maths in this file has not been altered or half-downloaded. What it
            does not prove: that the whole app is safe. slip still holds no keys, and you can check
            that yourself — there is nowhere to paste one.
          </p>
        </div>
      )}
    </section>
  );
}
