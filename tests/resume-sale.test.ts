import { describe, expect, it } from 'vitest';
import { resumeOpenSale } from '../src/core/resume-sale';
import type { Invoice } from '../src/core/orders';

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv_a',
  walletId: 'w1',
  walletLabel: 'Front',
  address: 'bc1qexample',
  index: 0,
  amountAtoms: 5_000n,
  amountMinor: 300n,
  currency: 'USD',
  rateMinorPerCoin: 6_000_000n,
  rateAt: '2026-11-09T10:00:00.000Z',
  lines: [],
  createdAt: '2026-11-09T10:00:00.000Z',
  expiresAt: '2026-11-09T10:15:00.000Z',
  status: 'awaiting',
  seenAt: null,
  confirmedAt: null,
  manual: false,
  note: '',
  ...over,
});

describe('resumeOpenSale', () => {
  it('returns nothing when every sale is finished or cancelled', () => {
    expect(resumeOpenSale([inv({ status: 'complete' }), inv({ id: 'x', status: 'cancelled' })])).toBeNull();
  });

  it('reopens the newest waiting sale and leaves an older one closed', () => {
    const older = inv({ id: 'old', createdAt: '2026-11-09T09:00:00.000Z' });
    const newer = inv({ id: 'new', createdAt: '2026-11-09T11:00:00.000Z', status: 'seen' });
    expect(resumeOpenSale([older, newer])?.primary.id).toBe('new');
  });

  it('pairs a split leg that was written in the same moment', () => {
    const primary = inv({ id: 'leg1', createdAt: '2026-11-09T12:00:00.000Z' });
    const second = inv({
      id: 'leg2',
      createdAt: '2026-11-09T12:00:01.000Z',
      note: 'split with Front',
      walletLabel: 'Back',
    });
    const found = resumeOpenSale([second, primary]);
    expect(found?.primary.id).toBe('leg1');
    expect(found?.second?.id).toBe('leg2');
  });
});
