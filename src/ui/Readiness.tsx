/**
 * Is my shop ready to take money?
 *
 * Four questions, answered from the device's own data, in the order a shopkeeper would ask them.
 * Each row is either done, or a door to the one screen that fixes it — never a settings wall, and
 * never a green tick for something slip has not actually seen (a rate is "set", not "correct").
 */

import { useEffect, useState } from 'react';

import { createRepository } from '../core/accounts';
import { createLedger } from '../core/ledger';
import { store as appStore } from '../core/storage';

interface Row {
  readonly label: string;
  readonly done: boolean;
  readonly href: string;
  readonly action: string;
  /** Something slip genuinely cannot verify. It is shown as your job, never ticked. */
  readonly manual?: boolean;
}

function read(): Row[] {
  const store = appStore();
  const { accounts } = createRepository(store).load();
  const { items } = createLedger(store).load();
  const hasRate = (store.getItem('rate:last') ?? '').length > 0;

  return [
    {
      label: 'A wallet to be paid into',
      done: accounts.length > 0,
      href: '#wallets',
      action: 'Add a wallet',
    },
    {
      label: 'A price for one Bitcoin you have used',
      done: hasRate,
      href: '#till',
      action: 'Set it on the till',
    },
    {
      label: 'Something to sell',
      done: items.length > 0,
      href: '#till',
      action: 'Add an item',
    },
    {
      label: 'A backup kept somewhere else',
      done: false,
      href: '#backup',
      action: 'Save a backup',
      // slip cannot see whether a file was saved, so it does not pretend to tick this.
      manual: true,
    },
  ];
}

export default function Readiness() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const refresh = () => setRows(read());
    refresh();
    window.addEventListener('slip:data-changed', refresh);
    return () => window.removeEventListener('slip:data-changed', refresh);
  }, []);

  if (rows.length === 0) return null;
  const checkable = rows.filter((r) => !r.manual);
  const done = checkable.filter((r) => r.done).length;

  return (
    <section className="panel" data-readiness data-ready={`${done}/${checkable.length}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="panel-title">Is the shop ready?</h2>
        <span className="text-xs text-muted">
          {done} of {checkable.length} done
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${(done / Math.max(1, checkable.length)) * 100}%` }} />
      </div>

      <ul className="mt-3 grid gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                row.done ? 'border-good text-good' : 'border-line text-muted'
              }`}
            >
              {row.done ? '✓' : '·'}
            </span>
            <span className={`flex-1 ${row.done ? 'text-secondary' : 'text-ink'}`}>{row.label}</span>
            {row.manual ? (
              <span className="text-[11px] text-muted">your job — slip cannot see it</span>
            ) : row.done ? (
              <span className="text-[11px] text-muted">done</span>
            ) : (
              <a href={row.href} className="text-[11px] text-accent underline underline-offset-2">
                {row.action}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
