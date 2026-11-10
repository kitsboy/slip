import { describe, expect, it } from 'vitest';
import { emptyBook } from '../src/core/indexes';
import { createInvoice, statusFromObservation } from '../src/core/orders';
import type { CounterAccount } from '../src/core/accounts';
import { fetchAddressActivity, PUBLIC_ESPLORA } from '../src/core/providers/esplora';

/**
 * The engine against the real Litecoin chain.
 *
 * Everything else in this suite runs on numbers a test wrote. This file asks a live Litecoin testnet
 * explorer for a real, mined transaction, takes the real address and the real amount out of it, and
 * then puts those numbers through the same `statusFromObservation` the till uses. If the mapping is
 * wrong, "Seen" and "Confirmed" on a receipt are wrong — and that is the one thing a till may not lie
 * about.
 *
 * It is opt-in (`SLIP_LIVE_CHAIN=1`) because a test that needs the internet turns a green run red for
 * reasons the code did not cause. Run it by hand before claiming the engine is proven on a chain.
 */

const LIVE = process.env.SLIP_LIVE_CHAIN === '1';
const BASE = PUBLIC_ESPLORA['ltc-testnet']!;

const wallet: CounterAccount = {
  id: 'w1',
  label: 'Litecoin counter',
  xpub: 'ttub',
  coin: 'ltc',
  networkId: 'ltc-testnet',
  scriptType: 'p2wpkh',
  source: 'xpub',
  colour: 'orange',
  purpose: 'till',
  note: '',
  fingerprintHex: '7ef32bdb',
  prefix: 'ttub',
  firstAddress: 'rltc1qfirst',
  acknowledgedAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
  staffName: null,
  nextIndex: 0,
};

async function text(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  // Some esplora endpoints answer a bare value with the quotes stripped; JSON.parse needs them.
  return (await res.text()).trim().replace(/^"|"$/g, '');
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await text(path)) as T;
}

describe.skipIf(!LIVE)('the status engine, fed by the real Litecoin testnet', () => {
  it('a mined payment reads Confirmed, and half of it does not', async () => {
    const tip = await text('/blocks/tip/hash');
    const txids = await json<string[]>(`/block/${tip}/txids`);
    // The coinbase of the tip block always pays a real address on this chain.
    const tx = await json<{
      vout: { value: number; scriptpubkey_address?: string }[];
      status: { confirmed: boolean; block_height?: number };
    }>(`/tx/${txids[0]}`);

    const out = tx.vout.find((v) => v.scriptpubkey_address && v.value > 0);
    expect(out?.scriptpubkey_address, 'the tip coinbase should pay an address').toBeTruthy();

    const activity = await fetchAddressActivity({ baseUrl: BASE, kind: 'public' }, out!.scriptpubkey_address!);
    expect(activity.chainReceivedAtoms).toBeGreaterThan(0n);
    expect(activity.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const paid = createInvoice({
      wallet,
      book: emptyBook(),
      amountAtoms: BigInt(out!.value),
      amountMinor: 100n,
      currency: 'USD',
      rateMinorPerCoin: 1n,
      buildAddress: () => out!.scriptpubkey_address!,
      now: new Date(),
    });

    // The chain says this address received this amount and it is mined: the till must say Confirmed.
    const settled = statusFromObservation(
      paid.invoice,
      { activity },
      new Date(Date.now() + 1000),
    );
    expect(settled).toBe('confirmed');

    // Ask for twice as much as this address has ever received (a mining payout address has a long
    // history, so `value` alone is not enough) and the same real money must not be called paid.
    const greedy = createInvoice({
      wallet,
      book: emptyBook(),
      amountAtoms: activity.chainReceivedAtoms * 2n + 1n,
      amountMinor: 400n,
      currency: 'USD',
      rateMinorPerCoin: 1n,
      buildAddress: () => out!.scriptpubkey_address!,
      now: new Date(),
    });
    const partial = statusFromObservation(
      greedy.invoice,
      { activity },
      new Date(Date.now() + 1000),
    );
    expect(['awaiting', 'seen', 'underpaid']).toContain(partial);
    expect(partial).not.toBe('confirmed');
  }, 60_000);
});
