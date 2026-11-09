import { describe, expect, it } from 'vitest';
import { btcString, closeReport, dayClose, daysWithSales, railOf, salesCsv, toRow } from '../src/core/history';
import { checkRefund, fullyRefunded, makeRefund, refundedSoFar } from '../src/core/refunds';
import { describeSweep, openInvoices, sweep } from '../src/core/reconcile';
import { cameraScannerAvailable, classifyScan, createScanBuffer, publicCodeFromScan } from '../src/core/scanner';
import { checkSilentPaymentAddress, silentPaymentCapability, silentPaymentUri } from '../src/core/silentpay';
import type { Invoice } from '../src/core/orders';
import type { AddressActivity } from '../src/core/providers/esplora';

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv_a1',
  walletId: 'w1',
  walletLabel: 'Front counter',
  address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  index: 0,
  amountAtoms: 10_000n,
  amountMinor: 600n,
  currency: 'USD',
  rateMinorPerCoin: 6_000_000n,
  rateAt: '2026-10-31T09:00:00.000Z',
  lines: [],
  createdAt: '2026-10-31T09:00:00.000Z',
  expiresAt: '2026-10-31T09:15:00.000Z',
  status: 'complete',
  seenAt: '2026-10-31T09:01:00.000Z',
  confirmedAt: '2026-10-31T09:01:00.000Z',
  manual: false,
  note: '',
  ...over,
});

const activity = (chain: bigint, mempool = 0n): AddressActivity => ({
  address: 'bc1q',
  receivedAtoms: chain + mempool,
  chainReceivedAtoms: chain,
  mempoolReceivedAtoms: mempool,
  spentAtoms: 0n,
  txCount: 1,
  used: chain + mempool > 0n,
  confirmedBalanceAtoms: chain,
  source: { baseUrl: 'https://x/api', kind: 'public' },
  fetchedAt: '2026-10-31T09:02:00.000Z',
});

describe('day close', () => {
  it('splits a day by rail and keeps manual apart from observed', () => {
    const close = dayClose(
      [
        inv({ id: 'inv_a', amountAtoms: 10_000n }),
        inv({ id: 'inv_b', amountAtoms: 5_000n, manual: true }),
        inv({ id: 'inv_c', amountAtoms: 7_000n, walletId: 'ln:shop@x', note: 'lightning' }),
        inv({ id: 'inv_d', status: 'awaiting', amountAtoms: 99_000n }),
        inv({ id: 'inv_e', createdAt: '2026-10-30T09:00:00.000Z' }),
      ],
      [],
      '2026-10-31',
    );
    expect(close.count).toBe(3);
    expect(close.grossAtoms).toBe(22_000n);
    expect(close.byRail.onchain).toBe(10_000n);
    expect(close.byRail.manual).toBe(5_000n);
    expect(close.byRail.lightning).toBe(7_000n);
    expect(close.manualAtoms).toBe(5_000n);
    expect(close.observedAtoms).toBe(17_000n);
  });

  it('subtracts refunds from the net, never below zero', () => {
    const sale = inv({ id: 'inv_r', amountAtoms: 10_000n });
    const refund = makeRefund({ invoice: sale, atoms: 4_000n, method: 'cash', reason: 'wrong order' });
    const close = dayClose([sale], [refund], '2026-10-31');
    expect(close.grossAtoms).toBe(10_000n);
    expect(close.refundedAtoms).toBe(4_000n);
    expect(close.netAtoms).toBe(6_000n);

    const over = { ...refund, id: 'ref_x', atoms: 50_000n };
    expect(dayClose([sale], [over], '2026-10-31').netAtoms).toBe(0n);
  });

  it('labels a rail from the invoice, not from the amount', () => {
    expect(railOf(inv({ manual: true }))).toBe('manual');
    expect(railOf(inv({ walletId: 'ln:a@b' }))).toBe('lightning');
    expect(railOf(inv())).toBe('onchain');
  });

  it('lists days that actually had sales', () => {
    expect(daysWithSales([inv(), inv({ id: 'x', createdAt: '2026-10-30T01:00:00.000Z' })])).toEqual([
      '2026-10-31',
      '2026-10-30',
    ]);
  });

  it('writes BTC with integer maths only', () => {
    expect(btcString(10_000n)).toBe('0.00010000');
    expect(btcString(100_000_000n)).toBe('1.00000000');
    expect(btcString(-1n)).toBe('-0.00000001');
  });

  it('exports CSV that survives a comma and a quote in a note', () => {
    const row = toRow(inv({ note: 'two, "large" coffees' }), []);
    const csv = salesCsv([row]);
    const line = csv.split('\n')[1]!;
    expect(line).toContain('"two, ""large"" coffees"');
    expect(line.split(',')[0]).toBe('inv_a1');
  });

  it('keeps a cancelled sale off the takings and names it on the sheet', () => {
    const close = dayClose(
      [
        inv({ id: 'inv_paid', amountAtoms: 10_000n }),
        inv({ id: 'inv_walk', status: 'cancelled', amountAtoms: 4_000n }),
      ],
      [],
      '2026-10-31',
    );
    expect(close.count).toBe(1);
    expect(close.netAtoms).toBe(10_000n);
    expect(close.cancelledCount).toBe(1);
    expect(close.cancelledAtoms).toBe(4_000n);
    expect(closeReport(close, 'Café Nord', 'USD').lines.join('\n')).toContain('Cancelled, not taken: 1');
  });

  it('prints a close report that never calls a manual line observed', () => {
    const close = dayClose([inv({ manual: true })], [], '2026-10-31');
    const report = closeReport(close, 'Café Nord', 'USD');
    expect(report.lines.join('\n')).toContain('Confirmed by a human');
    expect(report.lines.join('\n')).toContain('not an observation');
  });
});

describe('refunds', () => {
  it('refuses more than was received, and says what remains', () => {
    const sale = inv();
    const first = makeRefund({ invoice: sale, atoms: 6_000n, method: 'onchain-sent', reason: 'partial' });
    const check = checkRefund(sale, [first], 5_000n);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('4000 sats remain');
    expect(refundedSoFar([first], sale.id)).toBe(6_000n);
  });

  it('refuses to refund an incomplete sale', () => {
    expect(checkRefund(inv({ status: 'awaiting' }), [], 100n).ok).toBe(false);
  });

  it('refuses zero and negative refunds', () => {
    expect(checkRefund(inv(), [], 0n).ok).toBe(false);
    expect(checkRefund(inv(), [], -5n).ok).toBe(false);
  });

  it('knows when a sale is fully refunded', () => {
    const sale = inv();
    const full = makeRefund({ invoice: sale, atoms: 10_000n, method: 'cash', reason: 'all of it' });
    expect(fullyRefunded(sale, [full])).toBe(true);
    expect(fullyRefunded(sale, [])).toBe(false);
  });
});

describe('offline reconciliation', () => {
  const open = inv({ id: 'inv_open', status: 'awaiting', createdAt: '2026-10-31T08:00:00.000Z' });

  it('only considers open invoices', () => {
    const list = [open, inv({ id: 'done' }), inv({ id: 'cancelled', status: 'cancelled' })];
    expect(openInvoices(list).map((i) => i.id)).toEqual(['inv_open']);
  });

  it('turns a paid invoice into confirmed and reports the change', async () => {
    const result = await sweep([open], async () => activity(10_000n), { now: new Date('2026-10-31T09:00:00Z') });
    expect(result.checked).toBe(1);
    expect(result.changes[0]).toMatchObject({ from: 'awaiting', to: 'complete' });
    // A swept, fully-paid invoice must be complete — otherwise the day close silently ignores it.
    expect(result.updated[0]?.status).toBe('complete');
    expect(describeSweep(result)).toMatch(/1 now paid/);
  });

  it('does not mark anything paid when the explorer fails', async () => {
    const result = await sweep([open], async () => {
      throw new Error('no route');
    });
    expect(result.changes).toHaveLength(0);
    expect(result.failures[0]?.error).toBe('no route');
    expect(describeSweep(result)).toMatch(/could not be reached/);
  });

  it('says so plainly when there was nothing to do', async () => {
    expect(describeSweep(await sweep([], async () => activity(0n)))).toBe('nothing was open to check');
  });
});

describe('scanner', () => {
  it('classifies what a code actually is', () => {
    expect(classifyScan('SLIP-WALLET-1|Shop|btc|btc-mainnet|xpub|p2wpkh|zpub1').kind).toBe('pair');
    expect(classifyScan('SLIP1|inv_x|bc1qabcdefghijklmn|1|2026-10-31T00:00:00Z|-').kind).toBe('proof');
    expect(classifyScan('bitcoin:bc1qxyz?amount=0.001').kind).toBe('invoice');
    expect(classifyScan('lnbc1xyz').kind).toBe('invoice');
    expect(classifyScan('sp1qqqqqqqqqqqqqqqqqqqqqqqq').kind).toBe('address');
    expect(classifyScan('hello').kind).toBe('unknown');
  });

  it('pulls a zpub out of a wallet QR, and ignores a code that is not one', () => {
    const zpub = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
    expect(publicCodeFromScan(`Wallet\n${zpub}`)).toBe(zpub);
    expect(publicCodeFromScan('wpkh(zpub6abc/0/*)')).toBe('wpkh(zpub6abc/0/*)');
    expect(publicCodeFromScan('not a code')).toBeNull();
  });

  it('turns a fast burst of keystrokes into one scan', () => {
    const scans: string[] = [];
    let clock = 0;
    const buffer = createScanBuffer({ onScan: (t) => scans.push(t), now: () => clock });
    for (const ch of 'SLIP1|inv_test') {
      clock += 5;
      buffer.push(ch);
    }
    clock += 5;
    expect(buffer.push('Enter')).toBe('SLIP1|inv_test');
    expect(scans).toEqual(['SLIP1|inv_test']);
  });

  it('ignores human typing — a slow gap starts a new buffer', () => {
    const scans: string[] = [];
    let clock = 0;
    const buffer = createScanBuffer({ onScan: (t) => scans.push(t), now: () => clock, gapMs: 90 });
    for (const ch of 'hello world') {
      clock += 400;
      buffer.push(ch);
    }
    clock += 400;
    expect(buffer.push('Enter')).toBeNull();
    expect(scans).toEqual([]);
  });

  it('reports that a camera is unavailable rather than pretending', () => {
    expect(cameraScannerAvailable()).toBe(false);
  });
});

describe('silent payments', () => {
  it('accepts a mainnet and a testnet silent payment address', () => {
    expect(checkSilentPaymentAddress('sp1qqqqqqqqqqqqqqqqqqqqqqqqqq').network).toBe('btc-mainnet');
    expect(checkSilentPaymentAddress('tsp1qqqqqqqqqqqqqqqqqqqqqqqqqq').network).toBe('btc-testnet');
  });

  it('refuses an ordinary address and explains why', () => {
    const r = checkSilentPaymentAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ordinary on-chain address/);
  });

  it('never claims it can watch a silent payment', () => {
    const cap = silentPaymentCapability();
    expect(cap.canWatch).toBe(false);
    expect(cap.confirmation).toBe('manual');
    expect(cap.explanation).toContain('scan key');
  });

  it('builds a BIP-21 QR with the amount in BTC', () => {
    expect(silentPaymentUri('sp1qqqqqqqqqqqqqqqqqqqqqqqqqq', 10_000n)).toBe(
      'bitcoin:sp1qqqqqqqqqqqqqqqqqqqqqqqqqq?amount=0.0001',
    );
    expect(() => silentPaymentUri('nope', 1n)).toThrow();
  });
});
