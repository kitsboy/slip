/**
 * The manual, generated from the code that ships.
 *
 * Every panel declares its entry in `src/manual/entries.ts`; this page renders them, searchable,
 * grouped by the moment a merchant needs them. It is the same source `npm run docs:audit` checks,
 * so the page cannot describe a feature that no longer exists.
 */

import { useMemo, useState } from 'react';
import { MANUAL_GROUPS, searchManual } from '../manual/entries';

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
            <h3 className="text-xs uppercase tracking-wider text-muted">{group.label}</h3>
            <p className="text-[10px] text-muted">{group.why}</p>
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
                  <p className="mt-1 text-[10px] leading-relaxed text-warn">Limit: {entry.limit}</p>
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

      <p className="mt-4 border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
        This page is generated from the same declarations the build checks. If a panel disappears
        from the app, its card disappears here — and the build goes red.
      </p>
    </section>
  );
}
