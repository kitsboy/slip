/**
 * "Find a sale" — the question a shop actually asks three days later.
 *
 * A customer comes back holding a receipt: "this was wrong", "I paid, look". The merchant has an
 * amount, a time, or the last characters of an address — never an invoice id. This searches the way
 * a person remembers.
 *
 * Matching is deliberately forgiving on format and strict on meaning: "17" does not match 17,084
 * sats by substring, it matches when the typed number equals the amount.
 */

import type { Invoice } from './orders';

export interface SaleMatch {
  readonly invoice: Invoice;
  /** Why it matched, in the merchant's words. */
  readonly because: string;
}

function digits(text: string): string {
  return text.replace(/[^0-9.]/g, '');
}

export function findSales(invoices: readonly Invoice[], query: string, limit = 20): SaleMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const numeric = digits(q);
  const out: SaleMatch[] = [];

  for (const invoice of invoices) {
    const reasons: string[] = [];

    if (invoice.id.toLowerCase().includes(q)) reasons.push('invoice number');
    if (invoice.address.toLowerCase().includes(q)) reasons.push('address');
    if (invoice.walletLabel.toLowerCase().includes(q)) reasons.push('wallet');
    if (invoice.note.toLowerCase().includes(q)) reasons.push('note');
    if (invoice.createdAt.includes(q)) reasons.push('time');

    if (numeric) {
      const asSats = invoice.amountAtoms.toString();
      const asFiat = invoice.amountMinor.toString();
      if (asSats === numeric || asFiat === numeric) reasons.push('exact amount');
      else if (asSats.startsWith(numeric) && numeric.length >= 4) reasons.push('amount starts with');
    }

    if (reasons.length > 0) out.push({ invoice, because: reasons[0]! });
    if (out.length >= limit) break;
  }
  return out;
}
