/**
 * The manual, generated from the code that ships.
 *
 * Every panel declares its entry in `src/manual/entries.ts`; this page renders them, searchable,
 * grouped by the moment a merchant needs them. It is the same source `npm run docs:audit` checks,
 * so the page cannot describe a feature that no longer exists.
 */

import { useMemo, useState } from 'react';
import { MANUAL_GROUPS, searchManual } from '../manual/entries';
import { renderQrSvg } from '../core/qr';
import { BRAND_GLYPH, BRAND_NAME } from '../core/brand';
import { loadSettings } from '../core/settings';
import { escapeHtml } from './print';

/**
 * The customer sheet, at the size it is printed at.
 *
 * A code that lives on a screen at 116px is a code nobody can scan from across a counter. This builds a
 * one-page sheet in its own window with the same code drawn at 92mm — measured in millimetres, so the
 * paper, not the device, decides the size — and the same three sentences the `?explain=1` page says.
 */
function customerSheetHtml(url: string, shopName: string): string {
  const qr = renderQrSvg(url, { scale: 12, margin: 3 });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
    shopName || 'slip',
  )} — how to pay</title><style>
    @page { size: A4; margin: 18mm }
    * { box-sizing: border-box }
    body { margin: 0; color: #111; background: #fff;
      font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif }
    h1 { font-size: 26px; margin: 0 0 2mm }
    .sub { color: #555; margin: 0 0 8mm; font-size: 13px }
    .qr { width: 92mm; margin: 0 0 6mm }
    .qr svg { display: block; width: 92mm; height: 92mm }
    h2 { font-size: 15px; margin: 0 0 2mm }
    ul { margin: 0 0 6mm; padding-left: 5mm }
    li { margin-bottom: 2mm }
    .link { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #444;
      word-break: break-all; border-top: 1px solid #ddd; padding-top: 3mm }
    .foot { margin-top: 6mm; font-size: 11px; color: #666 }
  </style></head><body>
    <h1>${escapeHtml(shopName || 'This shop')}</h1>
    <p class="sub">Point your phone camera at the square. No app, no account.</p>
    <div class="qr">${qr}</div>
    <h2>What you are paying</h2>
    <ul>
      <li>You pay in Bitcoin, Lightning or Litecoin — whatever this till asks for.</li>
      <li>The money goes straight into the shop's own wallet. No bank holds it, and no payment
        processor is involved.</li>
      <li>Nothing is emailed. There is no receipt by post: the payment is your record, and the shop
        can print one for you.</li>
    </ul>
    <p class="link">${escapeHtml(url)}</p>
    <p class="foot">Printed by ${escapeHtml(BRAND_NAME)}. The page behind this code says the same
      three things in full, and keeps saying them if the shop is closed.</p>
  </body></html>`;
}

function openSheet(html: string, feature: string, print: boolean): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const win = window.open(url, feature, 'width=560,height=820');
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }
  if (print) win.addEventListener('load', () => { win.focus(); win.print(); });
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Manual() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchManual(query), [query]);

  // The same link the code carries, read at click time so a deploy under a new name cannot leave a stale code.
  const sheet = () =>
    customerSheetHtml(
      `${window.location.origin}${window.location.pathname}?explain=1`,
      loadSettings(window.localStorage).settings.businessName,
    );
  const showSheet = () => openSheet(sheet(), 'slip-customer-sheet', false);
  const printSheet = () => openSheet(sheet(), 'slip-customer-sheet-print', true);

  return (
    <section className="mt-6 panel" data-panel="manual">
      <p className="eyebrow">Manual</p>
      <h2 className="panel-title mt-1">How to use slip</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Written for a shop, not an engineer. Each card says what a panel is for, the steps, and the
        one limit you should know before you rely on it.
      </p>

      <div className="mt-3 rounded-xl border border-warn/50 bg-warn/5 p-3" data-panel="demo-link">
        <p className="text-xs">
          <strong>Try it without a wallet.</strong> Open the demo café: a pretend shop in its own
          drawer, with a simulated explorer. Nothing leaves the device and your real books are never
          touched.
        </p>
        <a
          href="?demo=1"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block rounded-lg border border-warn px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-warn"
        >
          open the demo shop
        </a>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-3">
        {/* The code used to be drawn at its own pixel size inside a fixed 112px box, so it painted 132px
            wide and crossed the paragraph beside it. The box owns the size now, and the SVG fills it. */}
        <button
          type="button"
          className="qr-pocket qr-pocket-btn h-32 w-32 shrink-0"
          aria-label="Show the customer sheet with a large QR code"
          title="Show the customer sheet"
          data-manual-qr
          onClick={showSheet}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: renderQrSvg(`${window.location.origin}${window.location.pathname}?explain=1`, {
                scale: 4,
                margin: 2,
              }),
            }}
          />
        </button>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          <strong className="text-ink">A QR for your customers.</strong> Stand it beside the till: it
          opens one plain page explaining what they are paying, who holds the money, and why no receipt
          is emailed.{' '}
          <button
            type="button"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
            onClick={printSheet}
            data-manual-qr-print
          >
            Print the sheet
          </button>{' '}
          — it prints at 92mm on A4, big enough to scan from a metre away.
        </p>
      </div>

      <label className="mt-3 block" htmlFor="mn-search">
        <span className="eyebrow">Search</span>
        <input
          id="mn-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="refund, rent, lightning, backup…"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
        />
      </label>

      {MANUAL_GROUPS.map((group) => {
        const entries = results.filter((e) => e.group === group.id);
        if (entries.length === 0) return null;
        return (
          <div key={group.id} className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</h3>
            <p className="text-[11px] text-muted">{group.why}</p>
            <ul className="mt-2 space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-line p-2" data-manual-entry={entry.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-sm">{entry.title}</span>
                    <span className="chip">{entry.status === 'live' ? 'live' : 'planned'}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{entry.why}</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed">
                    {entry.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="mt-1 text-[11px] leading-relaxed text-warn">Limit: {entry.limit}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {results.length === 0 && (
        <p className="mt-3 rounded-lg border border-line p-2 text-[11px] text-muted">
          Nothing matches “{query}”. Try a plainer word — “rent”, “cash”, “proof”.
        </p>
      )}

      <p className="mt-4 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
        This page is generated from the same declarations the build checks. If a panel disappears
        from the app, its card disappears here — and the build goes red.
      </p>

      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <span aria-hidden>{BRAND_GLYPH}</span>
        <span>
          Built by{' '}
          <a href="https://giveabit.io" className="underline decoration-dotted" rel="noreferrer noopener">
            {BRAND_NAME}
          </a>{' '}
          — open source, sound-money tools.
        </span>
      </p>
    </section>
  );
}
