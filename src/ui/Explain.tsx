/**
 * Tap a figure, get one sentence.
 *
 * Off by one switch in Settings → Assistance, because a busy counter does not want popovers and a
 * first-week merchant very much does. When the switch is off this renders the plain number and
 * nothing else — no hidden click target, no dashed underline, no "?" icon.
 */

import { useState } from 'react';
import { explain, type ExplainId } from '../core/explain';
import { loadSettings } from '../core/settings';

export interface ExplainProps {
  readonly id: ExplainId;
  readonly children: React.ReactNode;
}

export default function Explain({ id, children }: ExplainProps) {
  const enabled = loadSettings(window.localStorage).settings.assist.explainNumbers;
  const [open, setOpen] = useState(false);
  if (!enabled) return <>{children}</>;

  const e = explain(id);
  return (
    <span className="relative inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${e.title} — tap for an explanation`}
        className="inline-flex items-baseline gap-1 border-b border-dotted border-line text-left"
      >
        {children}
        <span aria-hidden className="text-[9px] text-muted">?</span>
      </button>
      {open && (
        <span
          role="status"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-line bg-surface-2 p-2 text-[11px] leading-relaxed text-muted shadow-lg"
          data-explain={id}
        >
          <strong className="block text-ink">{e.title}</strong>
          <span className="mt-1 block">{e.plain}</span>
          <span className="mt-1 block text-warn">{e.caveat}</span>
        </span>
      )}
    </span>
  );
}
