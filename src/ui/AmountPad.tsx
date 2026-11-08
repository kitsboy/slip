/**
 * The amount pad.
 *
 * A shop's most common non-catalogue sale is "just this much", and typing it on a phone keyboard
 * while somebody waits is the slowest, most error-prone moment of the whole transaction. This is a
 * sheet with keys big enough to hit without looking and four quick amounts.
 *
 * It only ever produces a string for the existing custom-amount field: no new money maths, no second
 * source of truth for totals.
 */

import { useEffect, useState } from 'react';
import { applyPadKey } from '../core/digit-guard';

interface Props {
  readonly currency: string;
  readonly open: boolean;
  readonly quick?: readonly number[];
  readonly onClose: () => void;
  readonly onAmount: (raw: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

export default function AmountPad({ currency, open, quick = [5, 10, 20, 50], onClose, onAmount }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key === 'Backspace' ? '⌫' : event.key;
      if (!/^[0-9.]$/.test(event.key) && event.key !== 'Backspace') return;
      event.preventDefault();
      event.stopPropagation();
      setValue((v) => applyPadKey(v, key));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  const press = (key: string) => {
    setValue((v) => applyPadKey(v, key));
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Amount">
      <div className="rounded-t-2xl border-t border-line bg-bg p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">How much</p>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Cancel
          </button>
        </div>

        <p className="figure mt-2 text-[2.5rem] font-bold leading-none tabular-nums">
          {value || '0'}
          <span className="ml-2 text-lg font-normal text-muted">{currency}</span>
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              className="chip"
              onClick={() => setValue(String(q))}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className="v2-key h-16 min-h-16 min-w-16 rounded-xl border border-line bg-surface text-xl font-semibold"
            >
              {key}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary mt-3 w-full"
          disabled={!value || Number(value) <= 0}
          onClick={() => {
            onAmount(value);
            setValue('');
            onClose();
          }}
        >
          Add to the sale
        </button>
        <p className="mt-1 text-xs text-warn" role="status" data-blocker hidden={Boolean(value && Number(value) > 0) || undefined}>
          Type an amount first.
        </p>
      </div>
    </div>
  );
}
