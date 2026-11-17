import { readReceipt } from '../core/digital-receipt';
import { formatCoinAmount, formatFiat } from '../core/money';
export default function DigitalReceipt() {
  const r = readReceipt(location.hash);
  return (
    <main className="v2-receipt mx-auto max-w-xl p-4" data-digital-receipt>
      <h1>{r?.shop || 'Digital receipt'}</h1>
      {r ? (
        <>
          <p className="figure mt-4">{formatCoinAmount(BigInt(r.atoms), r.coin)}</p>
          <span className="v2-rule" aria-hidden />
          <p>{formatFiat({ minor: BigInt(r.minor), currency: r.currency })}</p>
          <p role="status" className="mt-4">
            {r.status}
          </p>
          <p>{r.network ?? 'Network not recorded in this older receipt'}</p>
          {r.network && !r.network.endsWith('mainnet') && <p>Test coins have no monetary value.</p>}
          {r.split?.map(leg => <div key={leg.reference} className="mt-4"><h2>Split sale — second leg</h2><p>{formatCoinAmount(BigInt(leg.atoms), leg.coin)} · {leg.network}</p><p>{leg.status}</p><p>Receipt {leg.reference}</p><p className="break-all">{leg.address}</p></div>)}
          {r.split && <p>Split sale: both legs listed separately. No cross-coin combined total.</p>}
          <p className="mt-4">Receipt {r.reference}</p>
          <p>{r.at} UTC</p>
          <p className="break-all mt-4">{r.address}</p>
          <p className="mt-4">
            Unsigned customer-held record. This page does not verify a payment or a merchant
            identity. Anyone can edit its contents.
          </p>
          <p className="mt-4">
            Keep the FULL LINK, including everything after #. A saved HTML file alone may lose the receipt. Receipt data stays in the link fragment, not a server
            record. Anyone you share the link with can read it. No account or email needed.
          </p>
        </>
      ) : (
        <p role="alert">This receipt is missing or unreadable. Ask the merchant for a new link.</p>
      )}
    </main>
  );
}
