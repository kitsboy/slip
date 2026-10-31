/**
 * The rules on paper, for the wall behind the till.
 *
 * A merchant can tell staff "don't paste a seed" once; the wall tells them every shift. White
 * background and black text because this gets printed on the cheapest paper in the shop.
 */

import { openPrintable, escapeHtml } from './print';

export interface CounterCardInput {
  readonly shopName: string;
  readonly version: string;
}

export function counterCardHtml({ shopName, version }: CounterCardInput): string {
  const shop = escapeHtml(shopName || 'This shop');
  return `<!doctype html><title>${shop} — slip counter card</title>
<style>
  @page { size: A4; margin: 16mm }
  body { font: 13px/1.7 -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; background: #fff; margin: 0 }
  h1 { font-size: 26px; margin: 0 0 2px }
  h2 { font-size: 15px; margin: 22px 0 6px; text-transform: uppercase; letter-spacing: .08em }
  .sub { color: #555; margin: 0 0 18px }
  ul { margin: 0; padding-left: 20px }
  li { margin: 4px 0 }
  .never { border: 2px solid #000; padding: 12px 14px; margin-top: 8px }
  .foot { margin-top: 26px; color: #555; font-size: 11px; border-top: 1px solid #ccc; padding-top: 8px }
</style>
<h1>${shop}</h1>
<p class="sub">Taking bitcoin payments with slip · ${escapeHtml(version)}</p>

<h2>Three things that are always true</h2>
<ul>
  <li>slip never holds, moves or refunds money. It only shows an address and watches it.</li>
  <li>slip has no account, no server and no keys. Nothing to log into, nothing to lose.</li>
  <li>A payment is only “paid” when it is in a block. “Seen” means still in the queue.</li>
</ul>

<h2>What to do on shift</h2>
<ul>
  <li>Check the amount on screen matches what the customer was told.</li>
  <li>Let the customer scan the QR; read the address back if they prefer to type it.</li>
  <li>Cash sales: press <strong>I have the money (manual)</strong>. The receipt will say a human confirmed it.</li>
  <li>Customer walks away: <strong>park the sale</strong> instead of leaving it open.</li>
</ul>

<div class="never">
  <h2 style="margin-top:0">Never</h2>
  <ul>
    <li>Never paste a seed phrase, a private key or anything starting xprv / yprv / zprv into slip.</li>
    <li>Never pay the same address twice, and never pay an expired sale without asking.</li>
    <li>Never confirm a payment you did not see land.</li>
  </ul>
</div>

<p class="foot">If something looks wrong, stop and fetch the owner. Nobody loses money by pausing a sale.</p>`;
}

export function printCounterCard(input: CounterCardInput): boolean {
  return openPrintable(counterCardHtml(input), 'slip-counter-card', 'width=800,height=1000');
}
