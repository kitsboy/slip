/**
 * Run one reconciliation sweep against the store, using the merchant's own explorer.
 *
 * This used to live inside the till panel, which meant slip only looked for money while the
 * payment screen happened to be open. Watching is an app-level job: a merchant on the books, the
 * watchlist or settings still needs to know a sale landed. The panel keeps the display; this keeps
 * the behaviour, so both can be tested without a browser.
 */

import { createRepository } from './accounts';
import { sameInvoice } from './orders';
import { createLedger } from './ledger';
import { sweep, type SweepResult } from './reconcile';
import { fetchAddressActivity, targetFor } from './providers/esplora';
import type { ShopSettings } from './settings';
import type { KeyValueStore } from './storage';

export interface SweepRun {
  readonly result: SweepResult;
  /** True when at least one invoice changed state — the panels need to re-read. */
  readonly changed: boolean;
}

/** Returns null when there is nothing to look at, so callers can stay quiet. */
export async function sweepNow(store: KeyValueStore, settings: ShopSettings): Promise<SweepRun | null> {
  const invoices = createLedger(store).load().invoices;
  if (invoices.length === 0) return null;

  const accounts = createRepository(store).load().accounts;
  const look = async (invoice: (typeof invoices)[number]) => {
    const account = accounts.find((a) => a.id === invoice.walletId);
    if (!account) throw new Error('that wallet is no longer on this device');
    const target = targetFor(account.networkId, settings.explorerUrl);
    if (!target) throw new Error('no explorer for that network');
    return fetchAddressActivity(target, invoice.address);
  };

  const result = await sweep(invoices, look);
  const committed = new Set<string>();
  if (result.updated.length > 0) await createLedger(store).transaction(draft => {
    const current = draft.load();
    const eligible = result.updated.filter(next => {
      const before = invoices.find(i => i.id === next.id);
      const live = current.invoices.find(i => i.id === next.id);
      if (!before || !live || !sameInvoice(before, live)) return false;
      committed.add(next.id);
      return true;
    });
    draft.putInvoices(eligible);
  });
  const changes = result.changes.filter(c => committed.has(c.invoiceId));
  return { result: { ...result, updated: result.updated.filter(i => committed.has(i.id)), changes }, changed: changes.length > 0 };
}
