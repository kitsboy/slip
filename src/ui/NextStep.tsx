/**
 * One line that answers "what do I do now?".
 *
 * A consumer app always makes the next action obvious. slip's honest version of that is this strip:
 * it reads the device's own state (no wallet, no sale yet, sales made today) and says the one useful
 * thing, with the button that goes there. It never invents progress — it reports what the device
 * actually holds.
 */

import { useEffect, useState } from 'react';

import { createRepository } from '../core/accounts';
import { createLedger } from '../core/ledger';
import { formatFiat } from '../core/money';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

type State =
  | { kind: 'no-wallet' }
  | { kind: 'ready' }
  | { kind: 'trading'; count: number; totalMinor: bigint; currency: string };

function read(): State {
  try {
    const store = appStore();
    const { accounts } = createRepository(store).load();
    if (accounts.length === 0) return { kind: 'no-wallet' };

    const { invoices } = createLedger(store).load();

    const today = new Date().toISOString().slice(0, 10);
    const done = invoices.filter(
      (invoice) => invoice.createdAt.slice(0, 10) === today && invoice.status === 'complete',
    );
    if (done.length === 0) return { kind: 'ready' };

    return {
      kind: 'trading',
      count: done.length,
      totalMinor: done.reduce((sum, invoice) => sum + invoice.amountMinor, 0n),
      currency: done[0]?.currency ?? loadSettings(store).settings.currency,
    };
  } catch {
    return { kind: 'ready' };
  }
}

export default function NextStep() {
  const [state, setState] = useState<State>(read);

  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener('slip:data-changed', sync);
    window.addEventListener('slip:settings-changed', sync);
    return () => {
      window.removeEventListener('slip:data-changed', sync);
      window.removeEventListener('slip:settings-changed', sync);
    };
  }, []);

  const go = (hash: string) => () => {
    window.location.hash = hash;
  };

  if (state.kind === 'no-wallet') {
    return (
      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-3" data-next-step="wallet">
        <div>
          <p className="eyebrow">Start here</p>
          <p className="mt-1 text-sm leading-relaxed">
            Paste one code from your wallet app. That is all slip ever needs, and money can only
            ever arrive — it can never be moved from here.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={go('#wallets')}>
          Add your wallet
        </button>
      </section>
    );
  }

  if (state.kind === 'ready') {
    return (
      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-3" data-next-step="sell">
        <div>
          <p className="eyebrow">You're ready</p>
          <p className="mt-1 text-sm leading-relaxed">
            Nothing to configure. Ring up your first sale and show the customer the code.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={go('#till')}>
          Ring up a sale
        </button>
      </section>
    );
  }

  return (
    <section className="panel mt-6 flex flex-wrap items-center justify-between gap-3" data-next-step="close">
      <div>
        <p className="eyebrow">Today</p>
        <p className="mt-1 text-sm leading-relaxed">
          <span className="font-semibold text-ink">{state.count}</span>{' '}
          {state.count === 1 ? 'sale' : 'sales'} so far,{' '}
          <span className="font-semibold text-ink">
            {formatFiat({ minor: state.totalMinor, currency: state.currency })}
          </span>
          . Keep going, or close the day when the shop shuts.
        </p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={go('#history')}>
        See today
      </button>
    </section>
  );
}
