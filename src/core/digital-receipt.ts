import type { Invoice } from './orders';
export interface DigitalReceipt {
  version: 1;
  shop: string;
  reference: string;
  at: string;
  atoms: string;
  minor: string;
  currency: string;
  coin: 'btc' | 'ltc';
  network?: string;
  split?: {reference: string; atoms: string; coin: 'btc' | 'ltc'; network: string; address: string; status: string}[];
  address: string;
  status: string;
}
export function receiptLink(
  i: Invoice,
  shop: string,
  coin: 'btc' | 'ltc',
  base: string,
  demo: boolean,
  network = 'unknown',
  second?: {invoice: Invoice; coin: 'btc' | 'ltc'; network: string},
): string {
  const record: DigitalReceipt = {
    version: 1,
    shop: shop.slice(0, 120),
    reference: i.receiptNumber ?? i.id,
    at: i.confirmedAt ?? i.createdAt,
    atoms: i.amountAtoms.toString(),
    minor: i.amountMinor.toString(),
    currency: i.currency,
    coin,
    network,
    ...(second ? {split: [{ reference: second.invoice.receiptNumber ?? second.invoice.id, atoms: second.invoice.amountAtoms.toString(), coin: second.coin, network: second.network, address: second.invoice.address, status: demo ? 'Simulated — no real payment' : second.invoice.manual ? 'Marked paid by merchant — not observed by slip' : second.invoice.status === 'complete' ? 'Payment observed by slip' : 'Payment not complete' }]} : {}),
    address: i.address,
    status:
      demo || i.note === 'rehearsal'
        ? 'Simulated — no real payment'
        : i.manual
          ? 'Marked paid by merchant — not observed by slip'
          : i.status === 'complete'
            ? 'Payment observed by slip'
            : 'Payment not complete',
  };
  const url = new URL(base);
  url.search = 'receipt=1';
  url.hash = 'receipt=' + encodeURIComponent(JSON.stringify(record));
  return url.toString();
}
export function readReceipt(hash: string): DigitalReceipt | null {
  try {
    const r = JSON.parse(decodeURIComponent(hash.replace(/^#receipt=/, ''))) as DigitalReceipt;
    if (r.network !== undefined && typeof r.network !== 'string') return null;
    if (r.split !== undefined && (!Array.isArray(r.split) || r.split.length !== 1 || !r.split.every(l => l && ['btc','ltc'].includes(l.coin) && ['reference','atoms','network','address','status'].every(k => typeof (l as unknown as Record<string,unknown>)[k] === 'string') && /^\d{1,30}$/.test(l.atoms)))) return null;
    if (
      r.version !== 1 ||
      !['btc', 'ltc'].includes(r.coin) ||
      !['shop', 'reference', 'at', 'atoms', 'minor', 'currency', 'address', 'status'].every(
        (k) => typeof (r as unknown as Record<string, unknown>)[k] === 'string',
      ) ||
      !/^\d{1,30}$/.test(r.atoms) ||
      !/^\d{1,30}$/.test(r.minor) ||
      JSON.stringify(r).length > 4000
    )
      return null;
    return r;
  } catch {
    return null;
  }
}
