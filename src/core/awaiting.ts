/**
 * Sales that are still open.
 *
 * A counter has a rhythm: a customer's wallet fails to broadcast, another wants a coffee while the
 * first one's QR is still on screen. Those sales must not vanish and must not be hunted for in the
 * books, so the till shows the few most recent above the counter.
 *
 * Two rules:
 *   · oldest first, because the oldest is the one most likely to have been forgotten;
 *   · an expired sale is not a cancelled sale. Its address can still catch a late payment, so it
 *     stays in the strip and says it is late rather than disappearing.
 */

import type { Invoice } from './orders';

/** A sale nobody has settled yet. */
const OPEN = new Set(['awaiting', 'seen']);

export interface AwaitingSale {
  readonly invoice: Invoice;
  readonly ageMs: number;
  /** Past its own expiry, but still open: a late payment can still land at that address. */
  readonly stale: boolean;
}

export function awaitingSales(invoices: readonly Invoice[], now = Date.now(), limit = 3): AwaitingSale[] {
  const open = invoices
    .filter((invoice) => OPEN.has(invoice.status))
    .map((invoice) => {
      const created = Date.parse(invoice.createdAt);
      const expires = Date.parse(invoice.expiresAt);
      return {
        invoice,
        ageMs: Number.isFinite(created) ? Math.max(0, now - created) : 0,
        stale: Number.isFinite(expires) ? now > expires : false,
      };
    })
    // Oldest first: the forgotten one is the one worth showing.
    .sort((a, b) => Date.parse(a.invoice.createdAt) - Date.parse(b.invoice.createdAt));
  return open.slice(0, Math.max(0, limit));
}

export function awaitingCount(invoices: readonly Invoice[]): number {
  return invoices.filter((invoice) => OPEN.has(invoice.status)).length;
}

/** "4 min", "2 h 10 m", "3 d" — short enough for a strip, precise enough to act on. */
export function ageLabel(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
  return `${Math.floor(hours / 24)} d`;
}
