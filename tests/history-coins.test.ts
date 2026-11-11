import { describe, expect, it } from 'vitest';
import { emptyBook } from '../src/core/indexes';
import { createInvoice } from '../src/core/orders';
import { closeReport, dayClose, salesCsv } from '../src/core/history';
import type { CounterAccount } from '../src/core/accounts';

/**
 * Two coins in one day.
 *
 * A litoshi is not a satoshi. The books used to add them, which produced a total that was true of
 * nothing — the kind of number an accountant would sign and a shop would believe. These tests hold the
 * line: totals are kept per chain, a mixed day has no single figure, and the printed Z-report says so
 * in words instead of quietly summing.
 */

const DAY = '2026-11-10';

function wallet(id: string, coin: 'btc' | 'ltc'): CounterAccount {
  return {
    id,
    label: coin === 'ltc' ? 'Litecoin counter' : 'Bitcoin counter',
    xpub: 'x',
    coin,
    networkId: coin === 'ltc' ? 'ltc-mainnet' : 'btc-mainnet',
    scriptType: 'p2wpkh',
    source: 'xpub',
    colour: 'orange',
    purpose: 'till',
    note: '',
    fingerprintHex: '7ef32bdb',
    prefix: coin === 'ltc' ? 'Ltub' : 'zpub',
    firstAddress: coin === 'ltc' ? 'ltc1qfirst' : 'bc1qfirst',
    acknowledgedAt: `${DAY}T00:00:00.000Z`,
    createdAt: `${DAY}T00:00:00.000Z`,
    staffName: null,
    nextIndex: 0,
  };
}

const BTC = wallet('w-btc', 'btc');
const LTC = wallet('w-ltc', 'ltc');

function paid(w: CounterAccount, atoms: bigint, hour: number) {
  const { invoice } = createInvoice({
    wallet: w,
    book: emptyBook(),
    amountAtoms: atoms,
    amountMinor: 100n,
    currency: 'USD',
    rateMinorPerCoin: 6_000_000n,
    buildAddress: (i) => `${w.coin}addr${i}`,
    now: new Date(`${DAY}T${String(hour).padStart(2, '0')}:00:00Z`),
  });
  return { ...invoice, status: 'complete' as const, manual: true, seenAt: `${DAY}T${String(hour).padStart(2, '0')}:01:00Z` };
}

const coins = (id: string) => (id === 'w-ltc' ? 'ltc' : 'btc');

describe('the books keep two coins apart', () => {
  const invoices = [paid(BTC, 25_000n, 10), paid(LTC, 400_000n, 11)];

  it('names both coins in the day, Bitcoin first', () => {
    const close = dayClose(invoices, [], DAY, coins);
    expect(close.coins).toEqual(['btc', 'ltc']);
  });

  it('holds each coin’s own net, count and manual share', () => {
    const close = dayClose(invoices, [], DAY, coins);
    expect(close.byCoin.btc.count).toBe(1);
    expect(close.byCoin.btc.netAtoms).toBe(25_000n);
    expect(close.byCoin.ltc.count).toBe(1);
    expect(close.byCoin.ltc.netAtoms).toBe(400_000n);
    expect(close.byCoin.btc.manualAtoms).toBe(25_000n);
    expect(close.byCoin.ltc.manualAtoms).toBe(400_000n);
  });

  it('labels every row with its own coin', () => {
    const close = dayClose(invoices, [], DAY, coins);
    expect(close.rows.map((r) => r.coin).sort()).toEqual(['btc', 'ltc']);
  });

  it('the printed report has no blended total, and says why', () => {
    const report = closeReport(dayClose(invoices, [], DAY, coins), 'Cafe', 'USD');
    const text = report.lines.join('\n');
    expect(text).toContain('kept apart, never added');
    // Bitcoin keeps saying sats; Litecoin says LTC. Two units, two totals, one day.
    expect(text).toContain('25,000 sats');
    expect(text).toContain('0.004 LTC');
    // A single "Net:" line across both coins is exactly what must never appear.
    const netLines = report.lines.filter((l) => l.startsWith('Net:'));
    expect(netLines.length).toBe(2);
    for (const line of netLines) {
      // Each net line must name a single unit, so nobody can read it as a total across both.
      const units = ['sats', 'LTC'].filter((unit) => line.includes(unit));
      expect(units.length).toBe(1);
    }
  });

  it('the CSV carries the coin and the amount in it', () => {
    const csv = salesCsv(dayClose(invoices, [], DAY, coins).rows);
    const [header, ...rows] = csv.split('\n');
    expect(header).toContain('coin');
    expect(rows.some((r) => r.includes(',ltc,') && r.includes('0.004 LTC'))).toBe(true);
    expect(rows.some((r) => r.includes(',btc,') && r.includes('25,000 sats'))).toBe(true);
  });
});

describe('a one-coin day reads exactly as it did, in the right words', () => {
  it('a Litecoin-only day prints LTC and never sats', () => {
    const close = dayClose([paid(LTC, 400_000n, 11)], [], DAY, coins);
    expect(close.coins).toEqual(['ltc']);
    const text = closeReport(close, 'Cafe', 'USD').lines.join('\n');
    expect(text).toContain('0.004 LTC');
    expect(text).not.toContain('sats');
  });

  it('a Bitcoin-only day is unchanged', () => {
    const close = dayClose([paid(BTC, 25_000n, 10)], [], DAY, coins);
    expect(close.coins).toEqual(['btc']);
    expect(closeReport(close, 'Cafe', 'USD').lines.join('\n')).toContain('25,000 sats');
  });

  it('a cancelled Litecoin sale is counted in Litecoin, not Bitcoin', () => {
    const cancelled = { ...paid(LTC, 100_000n, 12), status: 'cancelled' as const };
    const close = dayClose([cancelled], [], DAY, coins);
    expect(close.byCoin.ltc.cancelledCount).toBe(1);
    expect(close.byCoin.btc.cancelledCount).toBe(0);
  });
});
