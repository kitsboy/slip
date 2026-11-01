/**
 * The week, written as a letter.
 *
 * One page, plain sentences, printable. The point is that a shopkeeper reads it — a dashboard of
 * twelve tiles gets closed. It never leaves the device, because there is nowhere for it to go.
 */

import { useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { weeklyLetter } from '../core/letter';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';
import { openPrintable, escapeHtml } from './print';

export default function WeeklyLetter() {
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const ledger = useMemo(() => createLedger(appStore()), []);
  const [note, setNote] = useState<string | null>(null);

  const letter = useMemo(() => {
    const data = ledger.load();
    const tabs = (() => {
      try {
        return (JSON.parse(appStore().getItem('slip.tabs.v1') ?? '[]') as unknown[]).length;
      } catch {
        return 0;
      }
    })();
    return weeklyLetter({
      invoices: data.invoices,
      refunds: data.refunds,
      parkedTabs: tabs,
      shopName: settings.businessName,
    });
  }, [ledger, settings.businessName]);

  function print() {
    const html =
      `<!doctype html><title>${escapeHtml(letter.title)}</title>` +
      '<style>@page{margin:18mm}body{font:13px/1.7 Georgia,serif;color:#000;background:#fff;margin:0}h1{font-size:20px;margin:0 0 12px}p{margin:8px 0}</style>' +
      `<h1>${escapeHtml(letter.title)}</h1>` +
      letter.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
      '<p style="margin-top:24px;color:#555;font-size:11px">slip · watch-only · generated on this device</p>';
    if (!openPrintable(html, 'slip-letter')) setNote('allow pop-ups to print the letter');
  }

  return (
    <section className="mt-6 panel" data-panel="letter">
      <p className="eyebrow">Weekly letter</p>
      <h2 className="panel-title mt-1">{letter.title}</h2>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed">
        {letter.lines.map((line) => (
          <li key={line} className="text-muted">
            {line}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={print}
        className="mt-3 rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink"
      >
        print the letter
      </button>
      {note && <p className="mt-1 text-[11px] text-warn">{note}</p>}
    </section>
  );
}
