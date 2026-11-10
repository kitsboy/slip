/**
 * Sales nobody has settled yet, above the counter.
 *
 * Money waiting outranks admin: this line sits above the till card, oldest first, because the
 * oldest is the one most likely to have been forgotten. It is a strip, not a panel — three at most,
 * then "N more in Books", because a strip that fills the screen stops being quiet.
 *
 * A cancelled sale leaves immediately; `abandon()` in the till refreshes this list. A "waiting" line
 * for a dead invoice would be exactly the kind of small lie this product refuses.
 */

import { ageLabel, awaitingCount, awaitingSales } from '../core/awaiting';
import { formatFiat } from '../core/money';
import type { Invoice } from '../core/orders';
import { isSkinV2 } from './skin';

interface Props {
  readonly invoices: readonly Invoice[];
  readonly onOpen: (invoice: Invoice) => void;
}

export default function AwaitingStrip({ invoices, onOpen }: Props) {
  const total = awaitingCount(invoices);
  if (total === 0) return null;

  const shown = awaitingSales(invoices, Date.now(), 3);

  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-surface-2 px-3 py-2${isSkinV2() ? ' v2-await' : ''}`}
      role="status"
      aria-label="Sales still waiting for payment"
      data-awaiting={total}
    >
      {<span className="v2-beat" aria-hidden />}
      <span className="eyebrow">Waiting to be paid</span>

      {shown.map(({ invoice, ageMs, stale }) => (
        <button
          key={invoice.id}
          type="button"
          onClick={() => onOpen(invoice)}
          title={`Reopen the ${formatFiat({ minor: invoice.amountMinor, currency: invoice.currency })} sale`}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-ink"
        >
          <span className="figure text-ink">
            {formatFiat({ minor: invoice.amountMinor, currency: invoice.currency })}
          </span>
          <span>· {ageLabel(ageMs)}</span>
          {stale && <span className="text-warn">· late</span>}
        </button>
      ))}

      {total > shown.length && (
        <span className="text-[11px] text-muted">+{total - shown.length} more in Books</span>
      )}
    </div>
  );
}
