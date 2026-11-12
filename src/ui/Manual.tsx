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

export default function Manual() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchManual(query), [query]);

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
        <div
          className="qr-pocket h-32 w-32 shrink-0"
          role="img"
          aria-label="QR code: opens the customer page explaining this payment"
          data-manual-qr
          dangerouslySetInnerHTML={{
            __html: renderQrSvg(`${window.location.origin}${window.location.pathname}?explain=1`, {
              scale: 4,
              margin: 2,
            }),
          }}
        />
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          <strong className="text-ink">A QR for your customers.</strong> Print this and stand it beside
          the till: it opens one plain page explaining what they are paying, who holds the money, and
          why no receipt is emailed.
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
