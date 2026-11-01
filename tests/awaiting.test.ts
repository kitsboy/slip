import { describe, expect, it } from 'vitest';

import { ageLabel, awaitingCount, awaitingSales } from '../src/core/awaiting';
import type { Invoice } from '../src/core/orders';

const NOW = Date.parse('2026-11-01T12:00:00.000Z');

function invoice(over: Partial<Invoice> & { id: string }): Invoice {
  const created = over.createdAt ?? '2026-11-01T11:54:00.000Z';
  return {
    id: over.id,
    walletId: 'w1',
    walletLabel: 'Front counter',
    address: `bc1q${over.id}`,
    index: 1,
    amountAtoms: 2500n,
    amountMinor: 600n,
    currency: 'USD',
    rateMinorPerCoin: 6_000_000n,
    rateAt: created,
    lines: [],
    createdAt: created,
    expiresAt: over.expiresAt ?? '2026-11-01T12:09:00.000Z',
    status: over.status ?? 'awaiting',
    seenAt: null,
    confirmedAt: null,
    manual: false,
    note: '',
  } satisfies Invoice;
}

describe('awaiting sales', () => {
  it('keeps only sales nobody has settled', () => {
    const list = [
      invoice({ id: 'a' }),
      invoice({ id: 'b', status: 'complete' }),
      invoice({ id: 'c', status: 'cancelled' }),
      invoice({ id: 'd', status: 'seen' }),
      invoice({ id: 'e', status: 'expired' }),
    ];
    const open = awaitingSales(list, NOW);
    expect(open.map((s) => s.invoice.id)).toEqual(['a', 'd']);
  });

  it('puts the oldest first, because the oldest is the forgotten one', () => {
    const list = [
      invoice({ id: 'new', createdAt: '2026-11-01T11:58:00.000Z' }),
      invoice({ id: 'old', createdAt: '2026-11-01T09:00:00.000Z' }),
      invoice({ id: 'mid', createdAt: '2026-11-01T11:30:00.000Z' }),
    ];
    expect(awaitingSales(list, NOW).map((s) => s.invoice.id)).toEqual(['old', 'mid', 'new']);
  });

  it('measures age from the sale, and keeps a late one visible', () => {
    const [sale] = awaitingSales(
      [invoice({ id: 'late', createdAt: '2026-11-01T11:00:00.000Z', expiresAt: '2026-11-01T11:15:00.000Z' })],
      NOW,
    );
    expect(sale?.ageMs).toBe(60 * 60_000);
    expect(sale?.stale).toBe(true);
  });

  it('does not call a live sale late', () => {
    const [sale] = awaitingSales([invoice({ id: 'live' })], NOW);
    expect(sale?.stale).toBe(false);
  });

  it('shows a few, and admits how many it is hiding', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      invoice({ id: `s${i}`, createdAt: `2026-11-01T11:0${i}:00.000Z` }),
    );
    expect(awaitingSales(many, NOW, 3)).toHaveLength(3);
    expect(awaitingCount(many)).toBe(5);
  });
});

describe('age labels', () => {
  it('reads like a counter, not like a stopwatch', () => {
    expect(ageLabel(20_000)).toBe('just now');
    expect(ageLabel(6 * 60_000)).toBe('6 min');
    expect(ageLabel(2 * 3_600_000 + 10 * 60_000)).toBe('2 h 10 m');
    expect(ageLabel(2 * 3_600_000)).toBe('2 h');
    expect(ageLabel(3 * 24 * 3_600_000)).toBe('3 d');
  });
});
