/**
 * Refunds, and the honesty problem inside them.
 *
 * slip cannot send money back — it has no keys — so a refund is a RECORD of something the
 * merchant did elsewhere: sent coins back, handed over cash, or wrote off as goodwill. The app
 * must never imply the money moved by itself.
 *
 * Two invariants: a refund can never exceed what was received minus what was already refunded,
 * and every refund names its method so the day close can split "money left the wallet" from
 * "money left the drawer".
 */

import type { Invoice } from './orders';

export type RefundMethod = 'onchain-sent' | 'lightning-sent' | 'cash' | 'goodwill';

export interface Refund {
  readonly id: string;
  readonly invoiceId: string;
  readonly atoms: bigint;
  readonly method: RefundMethod;
  readonly reason: string;
  readonly at: string;
  /** Free text: the txid they sent, or who handed the cash over. */
  readonly reference: string;
}

export const METHOD_LABEL: Readonly<Record<RefundMethod, string>> = {
  'onchain-sent': 'sent back on-chain',
  'lightning-sent': 'sent back over Lightning',
  cash: 'cash out of the drawer',
  goodwill: 'written off, nothing sent',
};

export function refundedSoFar(refunds: readonly Refund[], invoiceId: string): bigint {
  return refunds.filter((r) => r.invoiceId === invoiceId).reduce((s, r) => s + r.atoms, 0n);
}

export interface RefundCheck {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly remainingAtoms: bigint;
}

export function checkRefund(
  invoice: Invoice,
  refunds: readonly Refund[],
  atoms: bigint,
): RefundCheck {
  const already = refundedSoFar(refunds, invoice.id);
  const remaining = invoice.amountAtoms > already ? invoice.amountAtoms - already : 0n;

  if (invoice.status !== 'complete') {
    return { ok: false, reason: 'only a completed sale can be refunded', remainingAtoms: remaining };
  }
  if (atoms <= 0n) return { ok: false, reason: 'a refund needs a positive amount', remainingAtoms: remaining };
  if (atoms > remaining) {
    return {
      ok: false,
      reason: `that is more than was received: ${remaining} sats remain refundable on this sale`,
      remainingAtoms: remaining,
    };
  }
  return { ok: true, reason: null, remainingAtoms: remaining - atoms };
}

export function makeRefund(input: {
  invoice: Invoice;
  atoms: bigint;
  method: RefundMethod;
  reason: string;
  reference?: string;
  now?: Date;
}): Refund {
  const now = input.now ?? new Date();
  return {
    id: `ref_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    invoiceId: input.invoice.id,
    atoms: input.atoms,
    method: input.method,
    reason: input.reason.slice(0, 120),
    at: now.toISOString(),
    reference: (input.reference ?? '').slice(0, 120),
  };
}

/** True when the sale has been refunded in full — the receipt stops being a receipt for money. */
export function fullyRefunded(invoice: Invoice, refunds: readonly Refund[]): boolean {
  return refundedSoFar(refunds, invoice.id) >= invoice.amountAtoms;
}
