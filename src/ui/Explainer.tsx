import { BRAND_GLYPH, BRAND_NAME } from '../core/brand';
import { useEffect } from 'react';
import { loadSettings } from '../core/settings';
import { store } from '../core/storage';

/** Customer guidance, not a payment confirmation. */
export default function Explainer() {
  useEffect(() => { document.documentElement.dataset.size = loadSettings(store()).settings.textSize; }, []);
  return (
    <main className="mx-auto max-w-xl p-6" data-panel="explainer">
      <p className="eyebrow">Paying here</p>
      <h1 className="panel-title mt-1 text-2xl">What happens when you scan</h1>
      <ol className="mt-4 space-y-3 leading-relaxed">
        <li>
          <strong>You pay the shop’s chosen wallet.</strong> Depending on the shop’s setup, the code
          requests Bitcoin, Litecoin or a Lightning payment. Check the network and amount in your
          wallet before paying. slip cannot spend; your wallet provider may hold funds.
        </li>
        <li>
          <strong>Pay the amount shown.</strong> A short payment may leave the sale incomplete;
          an overpayment can be noted separately. Ask the shop to check what arrived before sending
          more.
        </li>
        <li>
          <strong>“Seen” is not “paid”.</strong> A pending on-chain payment is not yet confirmed.
          Read the rail’s confirmation or settlement status, not just the QR.
        </li>
        <li>
          <strong>Read the receipt’s status.</strong> It distinguishes an observed payment from one
          marked paid by the shop. Demo receipts are simulated. Keep the full receipt link; a record
          alone does not prove settlement.
        </li>
        <li>
          <strong>No slip account or email is needed.</strong> Shop records stay in this browser,
          but configured price, explorer and Lightning providers receive requests when used.
          Addresses can be public. The till counts requests to other servers.
        </li>
      </ol>
      <p className="mt-5 rounded-lg border border-line p-3 leading-relaxed">
        If a payment fails or stays pending, ask the shop to check its status and the payment
        details with you before you pay again.
      </p>
      <p className="mt-6 flex items-center gap-2">
        <span aria-hidden>{BRAND_GLYPH}</span>
        <span>Till built by{' '}
          <a href="https://giveabit.io" className="underline decoration-dotted" rel="noreferrer noopener">
            {BRAND_NAME}
          </a>{' '}· open source, sound-money tools
        </span>
      </p>
    </main>
  );
}
