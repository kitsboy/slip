/**
 * Scanning straight into the cart.
 *
 * A bar code is read faster than a human can check the result, so a wrong guess is worse than a
 * refusal. Resolution is deliberately strict: exact id, then exact name, then the *only* item whose
 * name contains the code. Two candidates is a question, not an answer. Anything that is a plain
 * amount is offered as an amount instead, because a shop that sells one thing by weight has no
 * catalogue to scan against.
 */

import { useState } from 'react';
import { cameraScannerAvailable, createDetector } from '../core/scanner';
import type { CatalogItem } from '../core/catalog';
import { formatFiat } from '../core/money';

interface Props {
  readonly items: readonly CatalogItem[];
  readonly currency: string;
  readonly onPick: (item: CatalogItem) => void;
  readonly onAmount: (raw: string) => void;
}

const MONEY = /^\d{1,7}([.,]\d{1,2})?$/;

type Note = { kind: 'ok' | 'ask' | 'miss'; text: string } | null;

export default function ScanToCart({ items, currency, onPick, onAmount }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<Note>(null);
  const [cameras, setCameras] = useState(false);

  function resolve(raw: string) {
    const text = raw.trim();
    if (text === '') return;

    // A plain amount is an amount, not a product code.
    if (MONEY.test(text)) {
      onAmount(text.replace(',', '.'));
      setNote({ kind: 'ok', text: `amount in the custom field — ${formatFiat({ minor: BigInt(Math.round(Number(text.replace(',', '.')) * 100)), currency })}` });
      setCode('');
      return;
    }

    const lower = text.toLowerCase();
    const byId = items.find((item) => item.id.toLowerCase() === lower);
    const byName = byId ?? items.find((item) => item.name.toLowerCase() === lower);
    if (byName) {
      onPick(byName);
      setNote({ kind: 'ok', text: `${byName.name} added` });
      setCode('');
      return;
    }

    const partial = items.filter((item) => item.name.toLowerCase().includes(lower));
    if (partial.length === 1 && partial[0]) {
      onPick(partial[0]);
      setNote({ kind: 'ok', text: `${partial[0].name} added` });
      setCode('');
      return;
    }
    if (partial.length > 1) {
      setNote({ kind: 'ask', text: `${partial.length} items match “${text}” — use the search box` });
      return;
    }
    setNote({ kind: 'miss', text: `nothing in your catalog is “${text}”` });
  }

  async function useCamera() {
    const detector = createDetector();
    if (!detector) {
      setNote({ kind: 'miss', text: 'this browser has no built-in scanner — type the code or the item name' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      setCameras(true);
      setNote({ kind: 'ok', text: 'camera open — hold the code steady' });

      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        const found = await detector.detect(video).catch(() => []);
        const first = found[0];
        if (first) {
          stopped = true;
          stream.getTracks().forEach((track) => track.stop());
          setCameras(false);
          resolve(first.rawValue);
          return;
        }
        window.setTimeout(() => void tick(), 400);
      };
      void tick();
    } catch {
      setCameras(false);
      setNote({ kind: 'miss', text: 'no camera — type the code instead' });
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary shrink-0">
        Scan
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-line bg-surface-2 p-2" data-scan="open">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1" htmlFor="tl-scan">
          <span className="eyebrow">Scan or type a code</span>
          <input
            id="tl-scan"
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                resolve(code);
              }
              if (e.key === 'Escape') {
                setOpen(false);
                setCode('');
                setNote(null);
              }
            }}
            placeholder="a bar code, an item name, or an amount"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={() => resolve(code)} className="btn btn-secondary">
          Add
        </button>
        {cameraScannerAvailable() && (
          <button type="button" onClick={() => void useCamera()} className="btn btn-ghost">
            {cameras ? 'Camera on' : 'Use camera'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCode('');
            setNote(null);
          }}
          className="btn btn-ghost"
        >
          Done
        </button>
      </div>

      {note && (
        <p
          className={`mt-1 text-[11px] ${note.kind === 'ok' ? 'text-muted' : note.kind === 'ask' ? 'text-warn' : 'text-bad'}`}
          role="status"
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
