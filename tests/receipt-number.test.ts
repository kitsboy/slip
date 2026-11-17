import { expect, it } from 'vitest';
import { createLedger } from '../src/core/ledger';
import type { Invoice } from '../src/core/orders';
it('migrates legacy receipts deterministically and keeps cancelled numbers', () => {
  let value: string | null = null;
  const repo = createLedger({
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  });
  const invoice = (id: string, at: string) =>
    ({
      id,
      createdAt: at,
      status: 'awaiting',
      amountAtoms: 1n,
      amountMinor: 1n,
      rateMinorPerCoin: null,
      lines: [],
    }) as unknown as Invoice;
  repo.putInvoice(invoice('inv_a', '2026-11-17T01:00:00Z'));
  repo.putInvoice(invoice('inv_b', '2026-11-17T02:00:00Z'));
  repo.touchInvoice('inv_a', { status: 'cancelled' });
  expect(
    repo
      .load()
      .invoices.map((i) => i.receiptNumber)
      .sort(),
  ).toEqual(['2026-11-17-001', '2026-11-17-002']);
});
