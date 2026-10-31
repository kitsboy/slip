import { describe, expect, it } from 'vitest';
import { emptyBook, reserve } from '../src/core/indexes';
import {
  applyStatus,
  cancelInvoice,
  countByStatus,
  createInvoice,
  markManualPaid,
  statusFromObservation,
  takingsToday,
  totalAtoms,
  type Invoice,
} from '../src/core/orders';
import { createLedger, emptyLedger, fromWire, toWire, LEDGER_KEY } from '../src/core/ledger';
import { budgetClock, daysFromDue, isDue, markRequestPaid, nextDueAfter } from '../src/core/requests';
import type { CounterAccount } from '../src/core/accounts';
import type { AddressActivity } from '../src/core/providers/esplora';

const wallet: CounterAccount = {
  id: 'w1',
  label: 'Front counter',
  xpub: 'x',
  coin: 'btc',
  networkId: 'btc-mainnet',
  scriptType: 'p2wpkh',
  source: 'xpub',
  colour: 'orange',
  purpose: 'till',
  note: '',
  fingerprintHex: '7ef32bdb',
  prefix: 'zpub',
  firstAddress: 'bc1qfirst',
  acknowledgedAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
  staffName: null,
  nextIndex: 0,
};

function activity(chain: bigint, mempool: bigint): AddressActivity {
  return {
    address: 'bc1q',
    receivedAtoms: chain + mempool,
    chainReceivedAtoms: chain,
    mempoolReceivedAtoms: mempool,
    spentAtoms: 0n,
    txCount: 1,
    used: chain + mempool > 0n,
    confirmedBalanceAtoms: chain,
    source: { baseUrl: 'https://x/api', kind: 'public' },
    fetchedAt: '2026-10-30T12:00:00.000Z',
  };
}

const make = () =>
  createInvoice({
    wallet,
    book: emptyBook(),
    amountAtoms: 7500n,
    amountMinor: 450n,
    currency: 'USD',
    rateMinorPerCoin: 6_000_000n,
    buildAddress: (i) => `bc1qaddr${i}`,
    now: new Date('2026-10-30T12:00:00Z'),
  });

describe('invoice creation', () => {
  it('reserves an index at creation and uses it for the address', () => {
    const { invoice, book } = make();
    expect(invoice.index).toBe(0);
    expect(invoice.address).toBe('bc1qaddr0');
    // reserved, not yet burned: the address has not reached a payer
    expect(book.reserved).toEqual([0]);
    expect(book.used).toEqual([]);
  });

  it('never reuses an index across two invoices', () => {
    const first = make();
    const second = createInvoice({
      wallet,
      book: first.book,
      amountAtoms: 1000n,
      amountMinor: 60n,
      currency: 'USD',
      buildAddress: (i) => `bc1qaddr${i}`,
    });
    expect(second.invoice.index).toBe(1);
    expect(second.invoice.address).toBe('bc1qaddr1');
  });

  it('uses the fixed address for a single-address wallet and reserves nothing', () => {
    const single: CounterAccount = { ...wallet, id: 'w2', source: 'pubkey' };
    const { invoice, book } = createInvoice({
      wallet: single,
      book: emptyBook(),
      amountAtoms: 500n,
      amountMinor: 30n,
      currency: 'USD',
      buildAddress: () => {
        throw new Error('should not derive for a single-address wallet');
      },
    });
    expect(invoice.index).toBeNull();
    expect(invoice.address).toBe('bc1qfirst');
    expect(book.used).toEqual([]);
  });

  it('refuses a zero or negative amount', () => {
    expect(() =>
      createInvoice({ wallet, book: emptyBook(), amountAtoms: 0n, amountMinor: 0n, currency: 'USD', buildAddress: () => 'x' }),
    ).toThrow(/positive/);
  });

  it('releases the index when a sale is abandoned before anything is shown', () => {
    const { invoice, book } = make();
    const released = cancelInvoice(invoice, book);
    expect(released.reserved).toEqual([]);
    expect(released.used).toEqual([]);
    expect(reserve(released).index).toBe(0);
  });
});

describe('status from observation', () => {
  const inside = new Date('2026-10-30T12:05:00Z');
  it('stays awaiting with no activity', () => {
    const { invoice } = make();
    expect(statusFromObservation(invoice, { activity: activity(0n, 0n) }, inside)).toBe('awaiting');
  });

  it('is only "seen" while the money is still in the mempool', () => {
    const { invoice } = make();
    expect(statusFromObservation(invoice, { activity: activity(0n, 7500n) }, inside)).toBe('seen');
  });

  it('is "confirmed" when the receipt is mined', () => {
    const { invoice } = make();
    expect(statusFromObservation(invoice, { activity: activity(7500n, 0n) }, inside)).toBe('confirmed');
  });

  it('honours the 1% tolerance', () => {
    const { invoice } = make();
    expect(statusFromObservation(invoice, { activity: activity(7430n, 0n) }, inside)).toBe('confirmed');
    expect(statusFromObservation(invoice, { activity: activity(7000n, 0n) }, inside)).toBe('seen');
  });

  it('calls an underpayment underpaid once the invoice has expired', () => {
    const { invoice } = make();
    const later = new Date('2026-10-30T13:00:00Z');
    expect(statusFromObservation(invoice, { activity: activity(1000n, 0n) }, later)).toBe('underpaid');
  });

  it('completes an expired invoice that was paid in full anyway', () => {
    const { invoice } = make();
    const later = new Date('2026-10-30T13:00:00Z');
    expect(statusFromObservation(invoice, { activity: activity(7500n, 0n) }, later)).toBe('confirmed');
  });

  it('expires an unpaid invoice after its window', () => {
    const { invoice } = make();
    const later = new Date('2026-10-30T13:00:00Z');
    expect(statusFromObservation(invoice, { activity: activity(0n, 0n) }, later)).toBe('expired');
  });
});

describe('manual confirmation stays separate from observation', () => {
  it('records manual:true and never claims a chain sighting', () => {
    const { invoice } = make();
    const marked = markManualPaid(invoice, new Date('2026-10-30T12:05:00Z'));
    expect(marked.status).toBe('complete');
    expect(marked.manual).toBe(true);
  });

  it('keeps a confirmed invoice off the manual path', () => {
    const { invoice } = make();
    const confirmed = applyStatus(invoice, 'confirmed');
    expect(confirmed.manual).toBe(false);
    expect(confirmed.confirmedAt).not.toBeNull();
  });
});

describe('totals', () => {
  it('counts only completed invoices', () => {
    const { invoice } = make();
    const paid = markManualPaid(invoice);
    expect(totalAtoms([invoice, paid])).toBe(7500n);
  });

  it('reports takings for one wallet today only', () => {
    const { invoice } = make();
    const paid = markManualPaid(invoice, new Date('2026-10-30T12:00:00Z'));
    const other: Invoice = { ...paid, id: 'x2', walletId: 'w2' };
    expect(takingsToday([paid, other], 'w1', new Date('2026-10-30T18:00:00Z'))).toBe(7500n);
    expect(takingsToday([paid], 'w1', new Date('2026-10-31T18:00:00Z'))).toBe(0n);
  });

  it('counts by status', () => {
    const { invoice } = make();
    const counts = countByStatus([invoice, markManualPaid(invoice)]);
    expect(counts.awaiting).toBe(1);
    expect(counts.complete).toBe(1);
  });
});

describe('ledger persistence', () => {
  const store = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  };

  it('round-trips BigInt amounts as strings without loss', () => {
    const { invoice } = make();
    const ledger = { ...emptyLedger(), invoices: [invoice] };
    const revived = fromWire(JSON.parse(JSON.stringify(toWire(ledger))));
    expect(revived.invoices[0]!.amountAtoms).toBe(7500n);
    expect(revived.invoices[0]!.amountMinor).toBe(450n);
    expect(revived.invoices[0]!.rateMinorPerCoin).toBe(6_000_000n);
  });

  it('survives a corrupt ledger and rejects an unknown status', () => {
    const s = store();
    expect(createLedger(s).load().invoices).toEqual([]);
    s.setItem(LEDGER_KEY, '{"version":1,"invoices":[{"id":"a","status":"paid","amountAtoms":"1","amountMinor":"1","lines":[]}],"items":[],"requests":[],"books":{}}');
    expect(createLedger(s).load().invoices[0]!.status).toBe('awaiting');
  });

  it('stores and updates invoices and index books', () => {
    const s = store();
    const repo = createLedger(s);
    const { invoice, book } = make();
    repo.putInvoice(invoice);
    repo.setBook('w1', book);
    expect(repo.load().invoices).toHaveLength(1);
    // the book stored is the RESERVED one; burning happens when the address is shown
    expect(repo.book('w1').reserved).toEqual([0]);
    repo.touchInvoice(invoice.id, { status: 'complete' });
    expect(repo.load().invoices[0]!.status).toBe('complete');
  });
});

describe('standing requests', () => {
  const req = {
    id: 'r1',
    label: "Mum's rent",
    walletId: 'w1',
    walletLabel: 'Family',
    amountMinor: 90000n,
    currency: 'CAD',
    cadence: 'monthly' as const,
    nextDue: '2026-10-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastPaidAt: null,
  };

  it('knows when it is due and by how much it is late', () => {
    expect(isDue(req, new Date('2026-10-02T00:00:00Z'))).toBe(true);
    expect(daysFromDue(req, new Date('2026-10-04T00:00:00Z'))).toBe(3);
    expect(isDue(req, new Date('2026-09-30T00:00:00Z'))).toBe(false);
  });

  it('advances a month when paid', () => {
    const paid = markRequestPaid(req, new Date('2026-10-03T00:00:00Z'));
    expect(paid.nextDue).toBe('2026-11-01');
    expect(paid.lastPaidAt).toContain('2026-10-03');
  });

  it('advances a week for weekly cadence and never for once', () => {
    expect(nextDueAfter('weekly', new Date('2026-10-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-08');
    expect(nextDueAfter('once', new Date('2026-10-01T00:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('builds a blunt budget clock', () => {
    const { invoice } = make();
    const paid = markManualPaid(invoice, new Date('2026-10-30T12:00:00Z'));
    const clock = budgetClock([paid], [req], new Date('2026-10-31T00:00:00Z'));
    expect(clock.in30dAtoms).toBe(7500n);
    expect(clock.dueNow).toBe(1);
  });
});
