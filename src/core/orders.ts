/**
 * Orders and invoices — the till's books.
 *
 * The rules that make this honest:
 *  - an invoice is a PROMISE of an address and an amount, and it is immutable once shown;
 *  - the derivation index is reserved when the invoice is created, never when the tile is
 *    rendered, so no two open sales can ever share an address;
 *  - "confirmed" means the explorer reports the receipt in a mined block. A mempool-only
 *    receipt is "seen" — a 0-conf promise, labelled as such;
 *  - an expired invoice that gets paid late is judged against the tolerance, not silently
 *    marked paid.
 */

import type { CounterAccount } from './accounts';
import type { AddressActivity } from './providers/esplora';
import { markUsed, release, reserve, type IndexBook } from './indexes';

export type InvoiceStatus =
  | 'awaiting'
  | 'seen'
  | 'confirmed'
  | 'complete'
  | 'underpaid'
  | 'expired'
  | 'cancelled';

export interface InvoiceLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitAtoms: bigint;
  readonly unitMinor: bigint;
}

export interface Invoice {
  readonly id: string;
  readonly walletId: string;
  readonly walletLabel: string;
  readonly address: string;
  /** Derivation index used, so a refund/audit can name it. */
  readonly index: number | null;
  readonly amountAtoms: bigint;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly rateMinorPerCoin: bigint | null;
  readonly rateAt: string | null;
  readonly lines: readonly InvoiceLine[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: InvoiceStatus;
  readonly seenAt: string | null;
  readonly confirmedAt: string | null;
  /** True when a human pressed "mark as paid" — never mixed with an observed payment. */
  readonly manual: boolean;
  readonly note: string;
}

export interface CreateInvoiceRequest {
  readonly wallet: CounterAccount;
  readonly book: IndexBook;
  readonly amountAtoms: bigint;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly rateMinorPerCoin?: bigint;
  readonly lines?: readonly InvoiceLine[];
  readonly ttlMinutes?: number;
  readonly now?: Date;
  readonly buildAddress: (index: number) => string;
  readonly note?: string;
}

export interface CreateInvoiceResult {
  readonly invoice: Invoice;
  readonly book: IndexBook;
}

export function createInvoice(req: CreateInvoiceRequest): CreateInvoiceResult {
  if (req.amountAtoms <= 0n) throw new Error('an invoice needs a positive amount');
  const now = req.now ?? new Date();
  const ttl = req.ttlMinutes ?? 15;

  // Reserve at creation. A single-address wallet has nothing to reserve, so index is null
  // and the address is fixed — the honest representation of "one address forever".
  const single = req.wallet.source === 'pubkey' || req.wallet.source === 'address';
  const reservation = single ? null : reserve(req.book);
  const index = reservation ? reservation.index : null;
  const address = single ? req.wallet.firstAddress : req.buildAddress(index!);

  const invoice: Invoice = {
    id: `inv_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    walletId: req.wallet.id,
    walletLabel: req.wallet.label,
    address,
    index,
    amountAtoms: req.amountAtoms,
    amountMinor: req.amountMinor,
    currency: req.currency,
    rateMinorPerCoin: req.rateMinorPerCoin ?? null,
    rateAt: req.rateMinorPerCoin ? now.toISOString() : null,
    lines: req.lines ?? [],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 60_000).toISOString(),
    status: 'awaiting',
    seenAt: null,
    confirmedAt: null,
    manual: false,
    note: req.note ?? '',
  };

  // RESERVE only. The index is burned when the address is actually shown to a payer, which
  // is what makes "cancel before display" able to give it back.
  return { invoice, book: reservation ? reservation.book : req.book };
}

/** Burns the reserved index — call this the moment a QR or address reaches a payer. */
export function burnInvoiceIndex(invoice: Invoice, book: IndexBook): IndexBook {
  if (invoice.index === null) return book;
  return markUsed(book, invoice.index);
}

/** Give back an index for a sale abandoned before anything was shown. */
export function cancelInvoice(invoice: Invoice, book: IndexBook): IndexBook {
  if (invoice.index === null) return book;
  return release(book, invoice.index);
}

export interface Observation {
  readonly activity: AddressActivity;
  readonly toleranceBps?: bigint;
}

/**
 * The only place a status is decided from chain data. Tolerant of late payments: an
 * expired invoice still completes if it was paid in full, because reality beat the clock.
 */
export function statusFromObservation(invoice: Invoice, obs: Observation, now = new Date()): InvoiceStatus {
  const expected = invoice.amountAtoms;
  const tolerance = obs.toleranceBps ?? 100n; // 1% by default
  const covered = (amount: bigint) => amount * 10_000n >= expected * (10_000n - tolerance);

  if (invoice.status === 'cancelled') return 'cancelled';

  if (covered(obs.activity.chainReceivedAtoms)) {
    return invoice.status === 'complete' ? 'complete' : 'confirmed';
  }
  if (obs.activity.chainReceivedAtoms > 0n || obs.activity.mempoolReceivedAtoms > 0n) {
    const totalSeen = obs.activity.chainReceivedAtoms + obs.activity.mempoolReceivedAtoms;
    if (new Date(invoice.expiresAt) < now && !covered(totalSeen)) return 'underpaid';
    return 'seen';
  }
  if (new Date(invoice.expiresAt) < now) return 'expired';
  return 'awaiting';
}

/** A human confirming by eye. Recorded as manual, never dressed up as an observation. */
export function markManualPaid(invoice: Invoice, now = new Date()): Invoice {
  return { ...invoice, status: 'complete', confirmedAt: now.toISOString(), manual: true };
}

export function completeIfConfirmed(invoice: Invoice, now = new Date()): Invoice {
  if (invoice.status !== 'confirmed') return invoice;
  return { ...invoice, status: 'complete', confirmedAt: invoice.confirmedAt ?? now.toISOString() };
}

export function applyStatus(invoice: Invoice, status: InvoiceStatus, now = new Date()): Invoice {
  if (status === invoice.status) return invoice;
  return {
    ...invoice,
    status,
    seenAt: status === 'seen' || status === 'confirmed' ? invoice.seenAt ?? now.toISOString() : invoice.seenAt,
    confirmedAt: status === 'confirmed' || status === 'complete' ? invoice.confirmedAt ?? now.toISOString() : invoice.confirmedAt,
  };
}

// ---------------------------------------------------------------------------
// Small facts the UI and reports need
// ---------------------------------------------------------------------------

export function isOpen(invoice: Invoice): boolean {
  return invoice.status === 'awaiting' || invoice.status === 'seen';
}

export function totalAtoms(invoices: readonly Invoice[]): bigint {
  return invoices
    .filter((i) => i.status === 'complete')
    .reduce((sum, i) => sum + i.amountAtoms, 0n);
}

export function countByStatus(invoices: readonly Invoice[]): Record<InvoiceStatus, number> {
  const out: Record<InvoiceStatus, number> = {
    awaiting: 0,
    seen: 0,
    confirmed: 0,
    complete: 0,
    underpaid: 0,
    expired: 0,
    cancelled: 0,
  };
  for (const i of invoices) out[i.status] += 1;
  return out;
}

/** Today's takings for one wallet, in atoms — the number a shopkeeper actually asks for. */
export function takingsToday(invoices: readonly Invoice[], walletId: string, now = new Date()): bigint {
  const day = now.toISOString().slice(0, 10);
  return invoices
    .filter((i) => i.walletId === walletId && i.status === 'complete' && i.createdAt.slice(0, 10) === day)
    .reduce((sum, i) => sum + i.amountAtoms, 0n);
}
