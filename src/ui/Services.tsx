/**
 * "What slip will offer" — the services menu.
 *
 * Every row carries a status that is checkable: shipped means it works in this build and is
 * covered by tests; planned means it does not exist yet, and the row says why rather than
 * implying it is waiting behind a setting.
 */

type Status = 'shipped' | 'planned';

interface Service {
  name: string;
  status: Status;
  detail: string;
  /** The constraint that matters more than the feature. */
  guard: string;
}

const SERVICES: Service[] = [
  {
    name: 'Till — catalog, cart, tax, tips',
    status: 'shipped',
    detail:
      'Items from a template, a cart, custom amounts, tip jar, parked sales and repeat-last. Tax inclusive or exclusive, integer-only arithmetic in 165 ISO currencies.',
    guard: 'Works offline. Nothing on this screen touches the network.',
  },
  {
    name: 'Payment engine — BTC, LTC, Lightning',
    status: 'shipped',
    detail:
      'A fresh receive address per sale from your own xpub, or an exact-amount Lightning invoice from your own Lightning address, checked by LNURL-verify.',
    guard:
      '“Paid” appears only when the payment is mined and within tolerance. A mempool payment is shown as seen, never as paid.',
  },
  {
    name: 'Receipts with customer-kept proofs',
    status: 'shipped',
    detail:
      'A receipt with a proof QR and a printable white sheet. The proof names the invoice, address, amount and time, and can be checked against the books later.',
    guard: 'A proof is a record, not a signature: slip holds no key that could sign one.',
  },
  {
    name: 'Day close, CSV and the weekly letter',
    status: 'shipped',
    detail:
      'Every completed sale for a day, split by rail, refunds subtracted, observed kept apart from human-confirmed. CSV for an accountant, plain-text close sheet, a week written as sentences.',
    guard: 'Only completed sales count as takings. Nothing is emailed — there is no server to email from.',
  },
  {
    name: 'Refunds, recorded honestly',
    status: 'shipped',
    detail:
      'Refund a sale with a method (on-chain, Lightning, cash, goodwill), a reference and a reason; capped at what was received minus what was already refunded.',
    guard: 'slip cannot send money. Every refund is a record of something you did, and the screen says so.',
  },
  {
    name: 'Rate feed, optional',
    status: 'shipped',
    detail:
      'Point slip at a price endpoint and it fetches the rate itself, stamped with the minute it was read.',
    guard: 'A quote older than ten minutes is refused, not used. Leaving the endpoint empty means you type the rate.',
  },
  {
    name: 'Silent Payments (BIP-352)',
    status: 'shipped',
    detail:
      'An sp1 or tsp1 address is validated, shown as a BIP-21 QR, and the sale is recorded as a manual confirmation.',
    guard:
      'slip cannot watch an sp1 address: detection needs your wallet’s scan key, which slip will never hold.',
  },
  {
    name: 'Day anchoring (OpenTimestamps)',
    status: 'shipped',
    detail:
      'Each day’s completed sales are hashed on this device; stamping submits that digest to a public calendar and keeps the proof.',
    guard: 'Stamped is not confirmed: the Bitcoin attestation arrives in the calendar’s own time.',
  },
  {
    name: 'Pairing, watchlist, customer screen',
    status: 'shipped',
    detail:
      'Move a wallet to a second till with a QR, watch addresses you do not own, and show a customer a second window with just the QR and the amount.',
    guard: 'An imported wallet arrives UNCHECKED. A watched address can never be spent from.',
  },
  {
    name: 'Agent-ready, read-only',
    status: 'shipped',
    detail:
      'window.slip exposes wallets, invoices, requests and today’s takings, plus events when a sale completes.',
    guard: 'It is read-only by construction: there is no method that writes, signs or sends.',
  },
  {
    name: 'Fedimint ecash',
    status: 'planned',
    detail:
      'Request mode first — the till shows an invoice from your own federation or gateway, embedded receiving only after a forced backup-and-sweep flow exists.',
    guard: 'Ecash is held by a federation; it would be labelled “trusted federation” and never ranked beside on-chain.',
  },
  {
    name: 'Liquid (L-BTC, L-USDt)',
    status: 'planned',
    detail: 'Confidential addresses and a blinded receive flow, once the library work is done properly.',
    guard: 'Deferred on purpose: three new failure modes for a rail few merchants hold.',
  },
];

const BADGE: Record<Status, string> = {
  shipped: 'live now',
  planned: 'not built yet',
};

export default function Services() {
  return (
    <section className="mt-6 panel">
      <h2 className="panel-title">What slip will offer</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        The plan, in public. &ldquo;Live now&rdquo; means it works in this build;
        &ldquo;not built yet&rdquo; means it does not, and this build cannot do it.
      </p>

      <ul className="mt-4 grid gap-2 lg:grid-cols-2">
        {SERVICES.map((s) => (
          <li key={s.name} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{s.name}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${
                  s.status === 'shipped' ? 'border-good text-good' : 'border-line text-muted'
                }`}
              >
                {BADGE[s.status]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-warn">{s.guard}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}