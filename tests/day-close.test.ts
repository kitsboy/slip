import { expect, it } from 'vitest';
import { emptyLedger } from '../src/core/ledger';
import { closeDay, dayFingerprint, unclosedDays } from '../src/core/day-close';
import type { Invoice } from '../src/core/orders';
it('refuses unresolved or changed records, keeps explicit closes, reopens after changes', () => {
  const l = emptyLedger();
  l.invoices = [
    { id: 'a', createdAt: '2026-11-16T00:00:00Z', status: 'awaiting', amountAtoms: 1n },
  ] as Invoice[];
  const evidence = {
    fingerprint: dayFingerprint(l, '2026-11-16'),
    report: true,
    backup: true,
    reviewed: true,
  };
  expect(() => closeDay(l, '2026-11-16', evidence)).toThrow();
  l.invoices = l.invoices.map((i) => ({ ...i, status: 'complete' }));
  expect(() => closeDay(l, '2026-11-16', evidence)).toThrow();
  evidence.fingerprint = dayFingerprint(l, '2026-11-16');
  closeDay(l, '2026-11-16', evidence);
  expect(unclosedDays(l, '2026-11-17')).toEqual([]);
  l.invoices = l.invoices.map((i) => ({ ...i, manual: true }));
  expect(unclosedDays(l, '2026-11-17')).toEqual(['2026-11-16']);
});
