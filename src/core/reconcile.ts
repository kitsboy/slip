/**
 * Offline reconciliation.
 *
 * A till that keeps selling through a dropped connection leaves invoices behind that nobody
 * checked again: the network came back, the sale was paid, and slip still says "waiting". That
 * is the failure this file exists to prevent — a sweep that re-asks the explorer for every open
 * invoice once connectivity returns, and reports what changed instead of doing it silently.
 *
 * Purity: the sweep takes a `look` function, so a test can prove the behaviour without a network
 * and the UI can point it at whichever explorer the merchant configured.
 */

import { completeIfConfirmed, statusFromObservation, type Invoice, type InvoiceStatus } from './orders';
import type { AddressActivity } from './providers/esplora';

export interface SweepChange {
  readonly invoiceId: string;
  readonly from: InvoiceStatus;
  readonly to: InvoiceStatus;
  readonly atoms: bigint;
}

export interface SweepResult {
  readonly checked: number;
  readonly changes: readonly SweepChange[];
  readonly failures: readonly { readonly invoiceId: string; readonly error: string }[];
  readonly updated: readonly Invoice[];
}

/** How many open invoices are worth re-asking about. Closed ones never are. */
export function openInvoices(invoices: readonly Invoice[], olderThanMs = 0, now = new Date()): Invoice[] {
  return invoices.filter((i) => {
    if (i.status !== 'awaiting' && i.status !== 'seen') return false;
    const age = now.getTime() - new Date(i.createdAt).getTime();
    return age >= olderThanMs;
  });
}

/**
 * Re-ask about every open invoice. Never marks anything complete on a failure, and never throws:
 * a sweep is a background courtesy, not a transaction.
 */
export async function sweep(
  invoices: readonly Invoice[],
  look: (invoice: Invoice) => Promise<AddressActivity>,
  opts: { now?: Date; toleranceBps?: bigint; limit?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const candidates = openInvoices(invoices, 0, now).slice(0, opts.limit ?? 20);
  const changes: SweepChange[] = [];
  const failures: { invoiceId: string; error: string }[] = [];
  const updated: Invoice[] = [];

  for (const invoice of candidates) {
    try {
      const activity = await look(invoice);
      // `confirmed` means the money is mined and within tolerance; a finished sale is
      // `complete`. Without this promotion the day close would ignore swept sales — they would
      // sit at "confirmed" forever while the till showed a receipt.
      const settled = completeIfConfirmed(
        { ...invoice, status: statusFromObservation(
          invoice,
          { activity, ...(opts.toleranceBps ? { toleranceBps: opts.toleranceBps } : {}) },
          now,
        ) },
        now,
      );
      const next = settled.status;
      updated.push({ ...invoice, status: next });
      if (next !== invoice.status) {
        changes.push({ invoiceId: invoice.id, from: invoice.status, to: next, atoms: invoice.amountAtoms });
      }
    } catch (e) {
      failures.push({ invoiceId: invoice.id, error: e instanceof Error ? e.message : 'the explorer did not answer' });
    }
  }

  return { checked: candidates.length, changes, failures, updated };
}

/** A sentence for the till banner — no change is also worth saying out loud. */
export function describeSweep(result: SweepResult): string {
  if (result.checked === 0) return 'nothing was open to check';
  // 'complete' counts too: a swept invoice that was mined and covered jumps straight past
  // 'confirmed', and calling that "not paid" would be a lie in the other direction.
  const paid = result.changes.filter((c) => c.to === 'complete' || c.to === 'confirmed' || c.to === 'seen').length;
  const expired = result.changes.filter((c) => c.to === 'expired' || c.to === 'underpaid').length;
  const bits = [
    `${result.checked} open sale${result.checked === 1 ? '' : 's'} re-checked`,
    paid > 0 ? `${paid} now paid` : '',
    expired > 0 ? `${expired} expired or short` : '',
    result.failures.length > 0 ? `${result.failures.length} could not be reached` : '',
  ].filter(Boolean);
  return bits.join(' · ');
}
