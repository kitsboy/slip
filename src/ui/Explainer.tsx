/**
 * The customer's page: what am I paying, and who holds it?
 *
 * Reachable by a QR taped next to the till (`?explain=1`). It is written for a customer who has
 * never used bitcoin, says plainly that the shop holds the money and not slip, and ends with the
 * smallest possible credit where credit is due.
 *
 * No scripts beyond the app's own bundle, no network, no fonts from anywhere.
 */

import { BRAND_GLYPH, BRAND_NAME } from '../core/brand';

export default function Explainer() {
  return (
    <main className="mx-auto max-w-xl p-6" data-panel="explainer">
      <p className="eyebrow">Paying here</p>
      <h1 className="panel-title mt-1 text-2xl">What happens when you scan</h1>

      <ol className="mt-4 space-y-3 text-sm leading-relaxed">
        <li>
          <strong className="text-ink">You pay the shop directly.</strong> The QR contains the shop’s
          own bitcoin address. No company in the middle ever holds your money.
        </li>
        <li>
          <strong className="text-ink">The amount is exact.</strong> Pay the figure on the screen, on
          the network it names. A different amount cannot be matched to your purchase.
        </li>
        <li>
          <strong className="text-ink">“Seen” is not “paid”.</strong> A payment in the queue is shown
          as seen. Only a payment inside a block is shown as paid, and that is when the receipt
          appears.
        </li>
        <li>
          <strong className="text-ink">You can keep the proof.</strong> Every receipt carries a short
          code the shop can check later, without asking you for anything.
        </li>
        <li>
          <strong className="text-ink">No account, no email, no tracking.</strong> The till has no
          server to send anything to. Nothing about you leaves it.
        </li>
      </ol>

      <p className="mt-5 rounded-lg border border-line p-3 text-[11px] leading-relaxed text-muted">
        If a payment fails, the shop can see the same thing you can: the address and the amount. Ask
        them to check the address on their screen before you pay again.
      </p>

      <p className="mt-6 flex items-center gap-2 text-[11px] text-muted">
        <span aria-hidden>{BRAND_GLYPH}</span>
        <span>
          Till built by{' '}
          <a href="https://giveabit.io" className="underline decoration-dotted" rel="noreferrer noopener">
            {BRAND_NAME}
          </a>{' '}
          · open source, sound-money tools
        </span>
      </p>
    </main>
  );
}
