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
 * one-page sheet with the same code drawn at 95mm — measured in millimetres, so the paper, not the device,
 * decides the size — centred on the page, under the shop's own name and the slip wordmark, and saying the
 * same three things the `?explain=1` page says.
 *
 * The wordmark is reproduced here rather than imported, because a print sheet is a string handed to another
 * window: it cannot carry React components. `BRAND_WORDMARK` is the same geometry as `Brand.tsx`, so the two
 * cannot drift in shape — only in ink.
 */
const BRAND_WORDMARK = `<svg viewBox="0 0 64 38" width="152" height="90" fill="none" stroke="#111111"
  stroke-width="4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="slip">
  <path d="M13.5 12H10a3.5 3.5 0 0 0 0 7a3.5 3.5 0 0 1 0 7H6.5" />
  <path d="M24 4V26" />
  <path d="M34 12V26" stroke="#f5820a" />
  <circle cx="34" cy="5.5" r="2.4" fill="#f5820a" stroke="none" />
  <path d="M44 12V34" />
  <path d="M44 12H51a7 7 0 0 1 0 14H44" />
</svg>`;

function customerSheetHtml(url: string, shopName: string): string {
  const qr = renderQrSvg(url, { scale: 12, margin: 0 });
  const name = escapeHtml(shopName || 'This shop');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${name} — how to pay</title><style>
    @page { size: A4; margin: 16mm }
    * { box-sizing: border-box }
    html, body { margin: 0; padding: 0 }
    body {
      color: #111; background: #fff;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex; flex-direction: column; align-items: center;
      min-height: calc(297mm - 32mm); justify-content: space-between;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header { width: 100%; text-align: center; border-bottom: 1.5px solid #111; padding-bottom: 4mm }
    header svg { display: block; margin: 0 auto 3mm }
    .kicker { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #555; margin: 0 }
    main { display: flex; flex-direction: column; align-items: center; width: 100% }
    h1 { font-size: 30px; line-height: 1.15; margin: 0 0 2mm; text-align: center; letter-spacing: -.01em }
    .lead { font-size: 15px; color: #444; margin: 0 0 7mm; text-align: center; max-width: 120mm }
    .qr-card {
      width: 108mm; padding: 6.5mm; margin: 0 auto;
      border: 1px solid #ddd; border-radius: 3mm; background: #fff;
    }
    .qr-card svg { display: block; width: 95mm; height: 95mm; margin: 0 auto }
    .scan { font-size: 12px; letter-spacing: .04em; color: #555; margin: 4mm 0 0; text-align: center }
    ul { list-style: none; padding: 0; margin: 9mm auto 0; max-width: 132mm; width: 100% }
    li { display: flex; gap: 3mm; font-size: 13.5px; line-height: 1.45; padding: 2.6mm 0; border-top: 1px solid #eee }
    li:last-child { border-bottom: 1px solid #eee }
    li b { flex: 0 0 34mm; font-weight: 600 }
    li span { flex: 1; color: #333 }
    footer { width: 100%; text-align: center }
    .link {
      font: 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #444;
      word-break: break-all; margin: 0 0 2mm; letter-spacing: -.01em;
    }
    .fine { font-size: 10px; color: #777; margin: 0 }
  </style></head><body>
    <header>
      ${BRAND_WORDMARK}
      <p class="kicker">How to pay here</p>
    </header>
    <main>
      <h1>${name}</h1>
      <p class="lead">Point your phone's camera at the square below. No app, no account, no card.</p>
      <div class="qr-card">${qr}</div>
      <p class="scan">Scan with your camera · hold still for a second</p>
      <ul>
        <li><b>What you pay</b><span>Bitcoin, Lightning or Litecoin — whatever this till asks for.</span></li>
        <li><b>Who holds it</b><span>It goes straight into the shop's own wallet. No bank, no payment processor.</span></li>
        <li><b>Your receipt</b><span>Nothing is emailed. The payment itself is the record, and the shop can print one for you.</span></li>
      </ul>
    </main>
    <footer>
      <p class="link">${escapeHtml(url)}</p>
      <p class="fine">Printed by slip · the same three answers, in full, on the page behind this code.</p>
    </footer>
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
