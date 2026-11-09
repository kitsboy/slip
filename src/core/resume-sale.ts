/**
 * A sale that is still waiting must come back after a reload.
 * The books already hold it. The till only has to open it again.
 * A cancelled or completed sale is not waiting, so it is never resumed.
 */
import type { Invoice } from './orders';

const SPLIT_NOTE = 'split with ';
const PAIR_WINDOW_MS = 5_000;

function waiting(invoices: readonly Invoice[]): Invoice[] {
  return invoices
    .filter((invoice) => invoice.status === 'awaiting' || invoice.status === 'seen')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

function paired(a: Invoice, b: Invoice): boolean {
  const gap = Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return Number.isFinite(gap) && gap < PAIR_WINDOW_MS;
}

export function resumeOpenSale(
  invoices: readonly Invoice[],
): { primary: Invoice; second: Invoice | null } | null {
  const open = waiting(invoices);
  if (open.length === 0) return null;
  const newest = open[open.length - 1]!;
  if (newest.note.startsWith(SPLIT_NOTE)) {
    const mate = [...open].reverse().find((invoice) => !invoice.note.startsWith(SPLIT_NOTE) && paired(invoice, newest));
    return mate ? { primary: mate, second: newest } : { primary: newest, second: null };
  }
  const mate = open.find((invoice) => invoice.note.startsWith(SPLIT_NOTE) && paired(invoice, newest));
  return { primary: newest, second: mate ?? null };
}
