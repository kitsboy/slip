/**
 * Overpayment is a note, not a status.
 *
 * The money is real either way, so the day's totals must not change — but a till that says only
 * "paid" hides the one fact a merchant would want. These tests fix the edges of "more than asked".
 */

import { describe, expect, it } from 'vitest';
import { overpaidBy, OVERPAID_BPS } from '../src/core/orders';
import { closeReport, dayClose, toRow } from '../src/core/history';
import { fromWire, toWire, emptyLedger } from '../src/core/ledger';
import type { Invoice } from '../src/core/orders';

const invoice = (amountAtoms: bigint, receivedAtoms: bigint | null): Invoice => ({
  id: 'inv_1',
  walletId: 'w1',
  walletLabel: 'Front counter',
  address: 'ltc1qexample',
  index: 3,
  amountAtoms,
  amountMinor: 500n,
  currency: 'EUR',
  rateMinorPerCoin: null,
  rateAt: null,
  lines: [],
  createdAt: '2026-11-12T09:00:00.000Z',
  expiresAt: '2026-11-12T09:15:00.000Z',
  status: 'complete',
  seenAt: '2026-11-12T09:00:40.000Z',
  confirmedAt: '2026-11-12T09:01:30.000Z',
  manual: false,
  note: '',
  receivedAtoms,
});

describe('overpaidBy', () => {
  it('says nothing when nobody looked', () => {
    expect(overpaidBy(10_000n, null)).toBe(0n);
    expect(overpaidBy(10_000n, undefined)).toBe(0n);
  });

  it('says nothing when the amount is exact', () => {
    expect(overpaidBy(10_000n, 10_000n)).toBe(0n);
  });

  it('tolerates a hair over, so a rounding difference is not an alarm', () => {
    // 1% of 10,000 is 100 — 50 over is inside the tolerance.
    expect(overpaidBy(10_000n, 10_050n)).toBe(0n);
    // Exactly 1% over is still "the number I asked for".
    expect(overpaidBy(10_000n, 10_100n)).toBe(0n);
  });

  it('reports what arrived above the ask once it is past tolerance', () => {
    expect(overpaidBy(10_000n, 10_101n)).toBe(101n);
    expect(overpaidBy(10_000n, 25_000n)).toBe(15_000n);
  });

  it('never reports a shortfall as an overpayment', () => {
    expect(overpaidBy(10_000n, 9_000n)).toBe(0n);
    expect(overpaidBy(10_000n, 0n)).toBe(0n);
  });

  it('holds its tolerance in one place', () => {
    expect(OVERPAID_BPS).toBe(100n);
    expect(overpaidBy(10_000n, 10_200n, 2_000n)).toBe(0n);
  });
});

describe('a sale row carries the received amount', () => {
  it('reports the excess without touching the amount that was charged', () => {
    const row = toRow(invoice(10_000n, 12_500n), []);
    expect(row.atoms).toBe(10_000n);
    expect(row.receivedAtoms).toBe(12_500n);
    expect(row.overpaidAtoms).toBe(2_500n);
    expect(row.netAtoms).toBe(10_000n);
  });

  it('leaves an ordinary sale alone', () => {
    const row = toRow(invoice(10_000n, 10_000n), []);
    expect(row.overpaidAtoms).toBe(0n);
  });
});

describe('the day close says it out loud', () => {
  it('adds one line, and leaves an ordinary day without it', () => {
    const invoices = [invoice(10_000n, 12_500n), { ...invoice(8_000n, 8_000n), id: 'inv_2' }];
    const date = '2026-11-12';
    const withOver = closeReport(dayClose(invoices, [], date), 'Cabello Coffee', 'EUR');
    expect(withOver.lines.some((l) => /ABOVE the ask/.test(l))).toBe(true);
    // The money still counts: the totals are the amounts asked for, not the excess.
    expect(withOver.lines.some((l) => /Sales: 2/.test(l))).toBe(true);

    const plain = closeReport(dayClose([{ ...invoice(8_000n, 8_000n), id: 'inv_3' }], [], date), 'Shop', 'EUR');
    expect(plain.lines.some((l) => /ABOVE the ask/.test(l))).toBe(false);
  });
});

describe('the received amount survives a backup', () => {
  it('round-trips through the wire format, and an older file without it still loads', () => {
    const ledger = { ...emptyLedger(), invoices: [invoice(10_000n, 12_500n)] };
    const back = fromWire(JSON.parse(JSON.stringify(toWire(ledger))));
    expect(back.invoices[0]?.receivedAtoms).toBe(12_500n);

    const old = JSON.parse(JSON.stringify(toWire(ledger)));
    delete old.invoices[0].receivedAtoms;
    const restored = fromWire(old);
    expect(restored.invoices[0]?.receivedAtoms).toBeNull();
    expect(restored.invoices[0]?.amountAtoms).toBe(10_000n);
  });
});
