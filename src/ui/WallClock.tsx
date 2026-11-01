/**
 * The quiet face of the till.
 *
 * Between customers a screen full of buttons is noise, and a screen that looks like a spreadsheet
 * makes a small shop feel like a terminal. This shows the time, today's takings and the last sale —
 * three things a person can read from two metres away.
 */

import { useEffect, useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { formatSats } from '../core/money';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

export default function WallClock() {
  const [now, setNow] = useState(() => new Date());
  const [tick, setTick] = useState(0);
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const ledger = useMemo(() => createLedger(appStore()), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener('slip:data-changed', onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('slip:data-changed', onChange);
    };
  }, []);

  const today = now.toISOString().slice(0, 10);
  const invoices = useMemo(() => ledger.load().invoices, [ledger, tick]);
  const done = invoices.filter((i) => i.status === 'complete' && i.createdAt.slice(0, 10) === today);
  const takings = done.reduce((s, i) => s + i.amountAtoms, 0n);
  const last = done.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;

  return (
    <section className="mt-6 panel text-center" data-panel="wallclock">
      <p className="eyebrow">{settings.businessName || 'Slip'}</p>
      <p className="figure mt-2 text-6xl tracking-tight" aria-live="off">
        {now.toISOString().slice(11, 16)}
      </p>
      <p className="mt-1 text-xs text-muted">{now.toISOString().slice(0, 10)} UTC</p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-3">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Today</dt>
          <dd className="figure mt-1 text-lg">{formatSats(takings)}</dd>
        </div>
        <div className="rounded-xl border border-line p-3">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Last sale</dt>
          <dd className="mt-1 text-sm">{last ? last.createdAt.slice(11, 16) : '—'}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[11px] text-muted">
        {done.length} sale{done.length === 1 ? '' : 's'} today · the till is quiet
      </p>
    </section>
  );
}
