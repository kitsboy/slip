/**
 * "What slip will offer" — the services menu.
 *
 * Every row here is a PROMISE, not a feature, so every row says so. A merchant
 * reading this must not conclude that a wallet exists in this build: the till has
 * no wallet, no invoice engine and no agent API yet. The list exists so the shape of
 * the product is honest up front — including the parts that hold funds (which is
 * precisely why they are not built yet).
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
    name: 'Check your key (derivation preview)',
    status: 'shipped',
    detail:
      'Paste an account xpub and see the first five receive addresses, so you can compare address 0/0 with your own wallet before any sale.',
    guard: 'Live now. It cannot create an invoice, reserve an index or draw a payment QR.',
  },
  {
    name: 'Counter accounts & staff hand-off',
    status: 'shipped',
    detail:
      'One account per till, truck or staff member — each a BIP-85 child account you derived on your own signer and imported as an xpub. Name the person holding the device, optional till PIN, switch counters only with the PIN.',
    guard:
      'Saved on this device only. No cloud, no sync, no account. A wrong derivation cannot reach a customer: a counter stays disabled until you confirm address 0/0 against your wallet.',
  },
  {
    name: 'Price check',
    status: 'shipped',
    detail:
      'Integer-only till arithmetic: price in any of 165 ISO currencies, tax inclusive or exclusive, tips, cash rounding, and the exact sats to charge at a rate you paste.',
    guard: 'No live rate feed yet — you supply the rate, so nothing silently reprices your goods.',
  },
  {
    name: 'Address check',
    status: 'shipped',
    detail:
      'Paste any BTC or LTC address and see which network it belongs to, with the script type.',
    guard: 'Wrong-chain addresses are refused. All Bitcoin test networks share one encoding, so slip says so instead of guessing.',
  },  {
    name: 'Encrypted backup & shift log',
    status: 'shipped',
    detail:
      'A .slip file encrypted with your passphrase (AES-GCM, PBKDF2) that restores your counters and PIN on a new device, plus a hash-chained record of which person held which counter, with a printable day sheet.',
    guard:
      'Tamper-evident, not tamper-proof: whoever holds the device can rewrite the chain. No server, no signature, so slip says so instead of implying otherwise.',
  },
  {
    name: 'Receive QR & BIP-21 requests',
    status: 'shipped',
    detail:
      'Each counter can show a BIP-21 QR for its first address, rendered as inline SVG and decode-verified in tests.',
    guard:
      'Preview only: a real sale must reserve a fresh index before any QR is shown, and that invoice engine does not exist yet.',
  },
  {
    name: 'Till — catalog, cart, tax, tips',
    status: 'planned',
    detail:
      'Items, categories, modifiers, hold/resume, split payment, receipts, end-of-day Z-report with a hash chain.',
    guard: 'Works offline. Nothing here touches the network.',
  },
  {
    name: 'Payment engine — BTC, LTC, Lightning',
    status: 'planned',
    detail:
      'Fresh receive address per sale from your own xpub, or an exact-amount Lightning invoice from your own Lightning address, verified by LNURL-verify.',
    guard: '"Paid" only appears when slip observed it. Every method carries a verification badge.',
  },
  {
    name: 'Wallet — BIP-85 counter accounts',
    status: 'shipped',
    detail:
      'Separate labelled accounts per till, truck or staff member, derived by YOUR signer (Coldcard, Sparrow, Krux, Jade) and imported here as child xpubs. Each gets its own address index and its own report.',
    guard:
      'slip will never derive BIP-85 itself — that needs your master private key, which this app must never see. Watch-only stays watch-only.',
  },
  {
    name: 'Silent Payments (BIP-352)',
    status: 'planned',
    detail:
      'Display-only at first: a reusable sp1… address with an honest "confirm in your own wallet" step. Auto-detection later needs a scan key plus an index server.',
    guard: 'Bitcoin only. Never claimed as auto-verified until slip can actually see it.',
  },
  {
    name: 'Fedimint ecash',
    status: 'planned',
    detail:
      'Request mode first — the till shows your own federation or gateway invoice. Embedded receiving only after a forced seed-backup and sweep-out flow exists.',
    guard: 'Ecash is held by the federation. It is labelled "trusted federation" and never ranked beside on-chain.',
  },
  {
    name: 'Agent-ready',
    status: 'planned',
    detail:
      'A local, offline scripting surface: a documented in-page API and embed events so an automation or bot you run can ring up a sale, read the ledger and close the day — without slip ever holding a key or calling a server.',
    guard:
      'No cloud agent, no phone-home, no remote control. Anything that can move money stays outside slip, always.',
  },
  {
    name: 'Liquid (L-BTC, L-USDt)',
    status: 'planned',
    detail: 'Confidential addresses and a blinded receive flow, once the library and provider work is done properly.',
    guard: 'Deferred on purpose — three new failure modes for a rail few merchants hold.',
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
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
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