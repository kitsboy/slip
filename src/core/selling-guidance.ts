import { overpaidBy, type Invoice } from './orders';
import { formatCoinAmount } from './money';
import type { Coin } from './network';
/** Display-only guidance. Never decides status or moves money. */
export function paymentGuidance(i: Invoice, coin: Coin): string {
  const amount = (n: bigint) => formatCoinAmount(n, coin);
  if (i.status === 'underpaid') return `Short payment: asked ${amount(i.amountAtoms)}; last observed ${(i.receivedAtoms === null || i.receivedAtoms === undefined) ? 'unknown' : amount(i.receivedAtoms)}. Check now and compare your wallet and the customer’s transaction. Do not request a second full payment or mark paid without checking. Agree any remaining amount outside slip.`;
  if (i.status === 'seen') return 'Wait for confirmation. Do not pay again. Check the transaction in your wallet; seen is not a completed payment.';
  if (i.status === 'expired') return 'This request expired, not necessarily the payment. Check now and compare your wallet before making a replacement request. A late payment can still arrive; do not ask the customer to pay twice.';
  const extra = overpaidBy(i.amountAtoms, i.receivedAtoms);
  if (extra > 0n) return `Observed overpayment: ${amount(extra)} over the ask. The sale counts at the asked amount. Check the customer meant it; agree any refund separately in your own wallet. slip cannot send a refund.`;
  return 'Already sent? Check now before paying again.';
}
export function rememberedRate(raw: string | null): { value: string; at: string | null } | null {
  try {
    const r = JSON.parse(raw ?? 'null');
    if (!r || typeof r.value !== 'string' || !/^\d+(\.\d+)?$/.test(r.value) || !Number.isFinite(Number(r.value)) || Number(r.value) <= 0) return null;
    return { value: r.value, at: typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)) ? r.at : null };
  } catch { return null; }
}
