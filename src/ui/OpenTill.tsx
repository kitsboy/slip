/**
 * Opening and closing the till.
 *
 * The shift log existed but nothing ever opened it: the first line appeared only at a hand-off, so a
 * day worked by one person had no beginning and could not be reconciled from the books. Opening the
 * till writes one `open` event (who is on, the float counted); closing writes `return`, which is
 * what actually ends a shift.
 *
 * It is collapsed by default — a one-line invitation with a button. Opening the till is admin, and
 * admin must never push the counter off the first screen.
 */

import { useState } from 'react';
import { isSkinV2 } from './skin';

export interface OpenShift {
  readonly staff: string;
  readonly since: string;
  readonly floatMinor: bigint | null;
}

interface Props {
  readonly staff: readonly string[];
  readonly shift: OpenShift | null;
  readonly counter?: string;
  readonly currency: string;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onOpen: (staffName: string, floatMinor: bigint | null) => void;
  readonly onClose: () => void;
  /** Name whoever the first sale opened the till for. Writes a hand-off line, not a second open. */
  readonly onHandoff?: (staffName: string) => void;
}

/** `12000n` → `120.00`, without pulling in a formatter for one number. */
function minorText(minor: bigint, currency: string): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '−' : ''}${whole}.${cents} ${currency}`;
}

export default function OpenTill({ staff, shift, counter = '', currency, busy = false, error = null, onOpen, onClose, onHandoff }: Props) {
  const [name, setName] = useState(staff[0] ?? '');
  const [float, setFloat] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [naming, setNaming] = useState(false);

  if (shift) {
    const since = shift.since.slice(11, 16);
    return (
      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
        data-shift="open"
      >
        <p className="text-[11px] text-muted">
          <span className="text-ink">
            {shift.staff === 'unassigned' ? 'The till is open' : `${shift.staff} has the till`}
            {counter ? ` · ${counter}` : ''}
          </span>{' '}
          since {since}
          {shift.floatMinor !== null ? ` · float ${minorText(shift.floatMinor, currency)}` : ' · no float counted'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {shift.staff === 'unassigned' && onHandoff && (
            naming ? (
              <span className="flex items-center gap-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Who is on"
                  className="w-32 rounded-lg border border-line bg-bg p-1.5 text-xs outline-none focus:border-accent"
                  aria-label="Who is on"
                />
                <button
                  type="button"
                  onClick={() => {
                    onHandoff(name.trim() || 'unassigned');
                    setNaming(false);
                  }}
                  className="btn btn-secondary"
                >
                  That is me
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setNaming(true)} className="btn btn-ghost">
                Say who&rsquo;s on
              </button>
            )
          )}
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">
            Close the till
          </button>
          {busy && <p className="w-full text-xs text-warn" role="status" data-blocker>Wait — the till is still closing.</p>}
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div
        className={isSkinV2() ? 'v2-shift' : 'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2'}
        data-shift="closed"
      >
        {isSkinV2() ? null : (
          <p className="text-[11px] text-muted">
            <span className="text-ink">The till isn&rsquo;t open yet.</span> Your first sale opens it —
            or open it now to say who is on.
          </p>
        )}
        <button type="button" onClick={() => setExpanded(true)} className="btn btn-secondary">
          Open the till
        </button>
      </div>
    );
  }

  const parsed = float.trim() === '' ? null : Number.parseFloat(float.replace(',', '.'));
  const floatMinor =
    parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? BigInt(Math.round(parsed * 100)) : null;

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4" data-shift="closed">
      <p className="eyebrow">Before the first customer</p>
      <h3 className="mt-1 text-sm text-ink">Open the till</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Who is on, and what you started with. Optional, and reversible: closing writes the matching
        line.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <label className="block" htmlFor="tl-staff-open">
          <span className="eyebrow">Who is on</span>
          <input
            id="tl-staff-open"
            value={name}
            onChange={(e) => setName(e.target.value)}
            list={staff.length > 0 ? 'tl-staff-names' : undefined}
            placeholder="Your name, or a staff name"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
          {staff.length > 0 && (
            <datalist id="tl-staff-names">
              {staff.map((person) => (
                <option key={person} value={person} />
              ))}
            </datalist>
          )}
        </label>

        <label className="block" htmlFor="tl-float">
          <span className="eyebrow">Float ({currency}), if counted</span>
          <input
            id="tl-float"
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            inputMode="decimal"
            placeholder="120.00"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>

        <button
          type="button"
          onClick={() => void onOpen(name.trim() || 'unassigned', floatMinor)}
          disabled={busy}
          className="btn btn-primary"
        >
          Open the till
        </button>
        {busy && <p className="text-xs text-warn" role="status" data-blocker>Wait — the till is still opening.</p>}
      </div>

      {error && <p className="mt-2 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
