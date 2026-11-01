/**
 * Watchlist — addresses slip looks at but does not own.
 *
 * The same trust rule applies here as everywhere else: we can see, we can never spend. A
 * watch entry is a label, an address, and a network — nothing more. Checking one asks the
 * explorer and shows when the answer arrived, because "balance: 0" with no age is how a
 * merchant mistakes a dead endpoint for an empty account.
 */

import { useMemo, useState } from 'react';
import { checkAddress } from '../core/addresses';
import { createLedger, type Watch } from '../core/ledger';
import EmptyState from './EmptyState';
import ConfirmButton from './ConfirmButton';
import { loadSettings } from '../core/settings';
import { fetchAddressActivity, formatAtoms, targetFor } from '../core/providers/esplora';
import { formatSats } from '../core/money';
import type { NetworkId } from '../core/network';
import { ALL_NETWORK_IDS, networkById } from '../core/network';
import { store as appStore } from '../core/storage';

interface Seen {
  readonly atoms: bigint;
  readonly received: bigint;
  readonly txCount: number;
  readonly at: string;
  readonly error: string | null;
}

export default function Watchlist() {
  const ledger = useMemo(() => createLedger(appStore()), []);
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const [watches, setWatches] = useState<Watch[]>(() => ledger.load().watches);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [networkId, setNetworkId] = useState<NetworkId>('btc-mainnet');
  const [seen, setSeen] = useState<Record<string, Seen>>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function add() {
    const check = checkAddress(address.trim(), networkId);
    if (!check.ok) {
      setNote(check.problem ?? 'that address does not belong to the chosen network');
      return;
    }
    if (!check.networks.includes(networkId)) {
      setNote(`that address is not a ${networkId} address — it belongs to ${check.networks.join(', ') || 'another chain'}`);
      return;
    }
    if (label.trim().length < 2) {
      setNote('give it a name you will recognise');
      return;
    }
    const watch: Watch = {
      id: `w_${Math.random().toString(36).slice(2, 8)}`,
      label: label.trim().slice(0, 40),
      address: address.trim(),
      networkId,
      note: '',
      addedAt: new Date().toISOString(),
    };
    const next = [...watches, watch];
    ledger.save({ ...ledger.load(), watches: next });
    setWatches(next);
    setLabel('');
    setAddress('');
    setNote(`${watch.label} added — nothing was sent anywhere to add it`);
  }

  function remove(id: string) {
    const next = watches.filter((w) => w.id !== id);
    ledger.save({ ...ledger.load(), watches: next });
    setWatches(next);
    // A stale "X added" line under a list that no longer has X is a small lie; clear it.
    setNote('');
  }

  async function check(watch: Watch) {
    const target = targetFor(watch.networkId as NetworkId, settings.explorerUrl);
    if (!target) {
      setSeen((s) => ({ ...s, [watch.id]: { atoms: 0n, received: 0n, txCount: 0, at: new Date().toISOString(), error: 'no explorer for this network' } }));
      return;
    }
    try {
      const a = await fetchAddressActivity(target, watch.address);
      setSeen((s) => ({
        ...s,
        [watch.id]: {
          atoms: a.confirmedBalanceAtoms,
          received: a.receivedAtoms,
          txCount: a.txCount,
          at: a.fetchedAt,
          error: null,
        },
      }));
    } catch (e) {
      setSeen((s) => ({
        ...s,
        [watch.id]: {
          atoms: 0n,
          received: 0n,
          txCount: 0,
          at: new Date().toISOString(),
          error: e instanceof Error ? e.message : 'the explorer did not answer',
        },
      }));
    }
  }

  async function checkAll() {
    setBusy(true);
    for (const w of watches) await check(w);
    setBusy(false);
  }

  return (
    <section className="mt-6 panel" data-panel="watchlist">
      <p className="eyebrow">Watchlist</p>
      <h2 className="panel-title mt-1">Addresses you can see but never touch</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        A supplier, a landlord, a cold wallet. Adding one costs nothing and sends nothing; checking
        one asks your explorer, and every balance below carries the moment it was read.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="block" htmlFor="wl-label">
          <span className="eyebrow">Name</span>
          <input
            id="wl-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Landlord"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block sm:col-span-2" htmlFor="wl-addr">
          <span className="eyebrow">Address</span>
          <input
            id="wl-addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="bc1q…"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="wl-net">
          <span className="eyebrow">Network</span>
          <select
            id="wl-net"
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value as NetworkId)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            {ALL_NETWORK_IDS.map((n) => (
              <option key={n} value={n}>
                {networkById(n).label} · {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-accent px-3 py-2 text-xs text-accent"
        >
          add to watchlist
        </button>
        {watches.length > 0 && (
          <button
            type="button"
            onClick={() => void checkAll()}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-50"
          >
            {busy ? 'checking…' : 'check all'}
          </button>
        )}
      </div>

      {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}

      {watches.length === 0 && (
        <EmptyState>
          Nothing is being watched yet. A supplier, a landlord or a cold wallet added above shows its
          balance here — without slip ever being able to move it.
        </EmptyState>
      )}

      {watches.length > 0 && (
        <ul className="mt-3 space-y-1">
          {watches.map((w) => {
            const s = seen[w.id];
            return (
              <li key={w.id} className="rounded-lg border border-line p-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">{w.label}</span>
                  <span className="chip">{w.networkId}</span>
                </div>
                <p className="mt-0.5 break-all font-mono text-[11px] text-muted">{w.address}</p>
                {s ? (
                  s.error ? (
                    <p className="mt-1 text-[11px] text-bad">{s.error}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">
                      balance <span className="figure text-ink">{formatSats(s.atoms)}</span> · received{' '}
                      <span className="figure">{networkById(w.networkId as NetworkId).coin === 'ltc' ? formatAtoms(s.received, 'ltc') : formatSats(s.received)}</span>{' '}
                      · {s.txCount} tx · read {s.at.slice(11, 19)} UTC
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-[11px] text-muted">not checked yet</p>
                )}
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void check(w)}
                    className="rounded border border-line px-2 text-xs text-muted hover:text-ink"
                  >
                    check
                  </button>
                  <ConfirmButton
                    label="remove"
                    confirmLabel="remove again"
                    onConfirm={() => remove(w.id)}
                    className="rounded border border-line px-2 text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
