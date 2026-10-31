import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSIST, sanitizeSettings } from '../src/core/settings';
import { findSales } from '../src/core/findsale';
import { weeklyLetter } from '../src/core/letter';
import { paymentLabel } from '../src/core/brand';
import { demoScenario } from '../src/demo/scenario';
import type { Invoice } from '../src/core/orders';
import { buildHandover, handoverText } from '../src/core/handover';
import { allPassed, runSelfTest } from '../src/core/selftest';
import { EXPLANATIONS, explain } from '../src/core/explain';

describe('assistance switches', () => {
  it('defaults to helpful, not silent', () => {
    expect(DEFAULT_ASSIST.explainNumbers).toBe(true);
    expect(DEFAULT_ASSIST.rehearsal).toBe(false);
    expect(DEFAULT_ASSIST.bookSeal).toBe(true);
  });

  it('keeps a merchant’s choices and ignores junk', () => {
    const { settings } = sanitizeSettings({
      businessName: 'Café',
      assist: { explainNumbers: false, bookSeal: false, rehearsal: true, nonsense: true },
    });
    expect(settings.assist.explainNumbers).toBe(false);
    expect(settings.assist.bookSeal).toBe(false);
    expect(settings.assist.rehearsal).toBe(true);
    expect((settings.assist as unknown as Record<string, unknown>).nonsense).toBeUndefined();
  });

  it('ignores a non-boolean instead of coercing it', () => {
    const { settings } = sanitizeSettings({ assist: { explainNumbers: 'yes' } });
    expect(settings.assist.explainNumbers).toBe(DEFAULT_ASSIST.explainNumbers);
  });

  it('fills in every switch when an older settings blob has none', () => {
    const { settings } = sanitizeSettings({ businessName: 'Old shop' });
    expect(settings.assist).toEqual(DEFAULT_ASSIST);
  });
});

describe('handover note', () => {
  const base = {
    staffName: 'Ana',
    parkedTabs: 0,
    openSales: 0,
    refundsToday: 0,
    takingsToday: 12_000n,
    rateAgeSeconds: null,
  };

  it('says something useful even when nothing is happening', () => {
    const note = buildHandover(base);
    expect(note.headline).toBe('Handover from Ana');
    expect(note.lines[0]).toBe('no parked sales');
    expect(note.lines[1]).toBe('nothing waiting for payment');
  });

  it('names what is in flight, in the order the next person needs it', () => {
    const note = buildHandover({ ...base, parkedTabs: 2, openSales: 1, refundsToday: 1 });
    expect(note.lines[0]).toContain('2 sales parked');
    expect(note.lines[1]).toContain('1 sale still waiting');
    expect(note.lines[2]).toContain('1 refund recorded today');
  });

  it('warns about a stale rate only when it is really stale', () => {
    expect(buildHandover({ ...base, rateAgeSeconds: 120 }).lines.join(' ')).not.toContain('stale');
    expect(buildHandover({ ...base, rateAgeSeconds: 1200 }).lines.join(' ')).toContain('rate is stale');
  });

  it('prints as plain text a person can paste to the next shift', () => {
    const text = handoverText(buildHandover({ ...base, parkedTabs: 1 }));
    expect(text.split('\n')[0]).toBe('Handover from Ana');
    expect(text).toContain('· 1 sale parked');
  });
});

describe('self test', () => {
  const results = runSelfTest();

  it('runs five checks and passes every one on a correct build', () => {
    expect(results).toHaveLength(5);
    expect(allPassed(results)).toBe(true);
  });

  it('proves the derivation vector, not just that the function ran', () => {
    const derive = results.find((r) => r.name.startsWith('Derive'));
    expect(derive?.detail).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });

  it('reports a failure rather than throwing when a check cannot run', () => {
    // A result object, never an exception: the button must not crash a till.
    expect(results.every((r) => typeof r.ok === 'boolean')).toBe(true);
  });
});

describe('explanations', () => {
  it('has a plain sentence and a caveat for every figure', () => {
    for (const [id, e] of Object.entries(EXPLANATIONS)) {
      expect(e.plain.length, id).toBeGreaterThan(30);
      expect(e.caveat.length, id).toBeGreaterThan(20);
      expect(e.plain.toLowerCase()).not.toContain('utxo');
    }
  });

  it('never lets a manual confirmation masquerade as an observation', () => {
    expect(explain('rail').caveat).toContain('manual');
    expect(explain('refund').caveat).toContain('cannot send money');
  });
});

describe('find a sale', () => {
  const sale = (over: Partial<Invoice> = {}): Invoice => ({
    id: 'inv_find_01',
    walletId: 'w1',
    walletLabel: 'Front counter',
    address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    index: 0,
    amountAtoms: 17_084n,
    amountMinor: 1025n,
    currency: 'USD',
    rateMinorPerCoin: 6_000_000n,
    rateAt: '2026-10-31T09:00:00.000Z',
    lines: [],
    createdAt: '2026-10-31T09:14:00.000Z',
    expiresAt: '2026-10-31T09:29:00.000Z',
    status: 'complete',
    seenAt: '2026-10-31T09:15:00.000Z',
    confirmedAt: '2026-10-31T09:16:00.000Z',
    manual: false,
    note: '',
    ...over,
  });

  it('finds by exact amount, not by a substring of it', () => {
    expect(findSales([sale()], '17084').map((m) => m.because)).toContain('exact amount');
    expect(findSales([sale()], '170')).toHaveLength(0);
  });

  it('finds by the end of an address, the way a person reads it off a receipt', () => {
    const matches = findSales([sale()], '306fyu');
    expect(matches[0]?.because).toBe('address');
  });

  it('finds by time, invoice id and wallet', () => {
    expect(findSales([sale()], '09:14')[0]?.because).toBe('time');
    expect(findSales([sale()], 'inv_find')[0]?.because).toBe('invoice number');
    expect(findSales([sale()], 'front')[0]?.because).toBe('wallet');
  });

  it('ignores a query too short to mean anything', () => {
    expect(findSales([sale()], '1')).toHaveLength(0);
  });
});

describe('weekly letter', () => {
  const mk = (id: string, at: string, atoms: bigint, manual = false) => ({
    id, walletId: 'w1', walletLabel: 'Front counter', address: 'bc1q', index: 0,
    amountAtoms: atoms, amountMinor: 0n, currency: 'USD', rateMinorPerCoin: null, rateAt: null,
    lines: [], createdAt: at, expiresAt: at, status: 'complete' as const, seenAt: null,
    confirmedAt: at, manual, note: '',
  });

  it('sums the week and subtracts refunds', () => {
    const letter = weeklyLetter({
      invoices: [mk('a', '2026-10-30T09:00:00.000Z', 10_000n), mk('b', '2026-10-28T10:00:00.000Z', 5_000n)],
      refunds: [{ id: 'r1', invoiceId: 'a', atoms: 2_000n, method: 'cash', reason: 'x', at: '2026-10-30T11:00:00.000Z', reference: '' }],
      parkedTabs: 1,
      shopName: 'Café Nord',
      now: new Date('2026-10-31T12:00:00Z'),
    });
    expect(letter.netAtoms).toBe(13_000n);
    expect(letter.sales).toBe(2);
    expect(letter.lines.join(' ')).toContain('2 sales');
    expect(letter.lines.join(' ')).toContain('1 sale still parked');
  });

  it('says out loud how much of the week was a human’s word', () => {
    const letter = weeklyLetter({
      invoices: [mk('a', '2026-10-30T09:00:00.000Z', 10_000n, true)],
      refunds: [],
      parkedTabs: 0,
      shopName: 'Café',
      now: new Date('2026-10-31T12:00:00Z'),
    });
    expect(letter.lines.join(' ')).toContain('confirmed by a human');
  });

  it('is honest about an empty week', () => {
    const letter = weeklyLetter({ invoices: [], refunds: [], parkedTabs: 0, shopName: '', now: new Date('2026-10-31T12:00:00Z') });
    expect(letter.sales).toBe(0);
    expect(letter.lines[0]).toContain('No sales this week');
  });
});

describe('the credit line', () => {
  it('rides on the payment label beside the shop', () => {
    expect(paymentLabel('Front counter', 'giveabit.io')).toBe('Front counter · giveabit.io');
  });

  it('says nothing when a shop turns it off', () => {
    expect(paymentLabel('Front counter', '   ')).toBe('Front counter');
  });

  it('never lets the credit push the shop out of the label', () => {
    const label = paymentLabel('A'.repeat(120), 'giveabit.io', 40);
    expect(label.startsWith('A'.repeat(29))).toBe(true);
    expect(label.length).toBeLessThanOrEqual(40);
  });

  it('rejects a signature with characters a URL would choke on', () => {
    const { settings } = sanitizeSettings({ signature: 'bad<script>' });
    expect(settings.signature).toBe('giveabit.io');
    const { settings: clean } = sanitizeSettings({ signature: '' });
    expect(clean.signature).toBe('');
  });
});

describe('the demo scenario', () => {
  const scenario = demoScenario(new Date('2026-10-31T12:00:00Z'));
  const ledger = scenario.ledger as { invoices: unknown[]; refunds: unknown[]; requests: unknown[] };
  const accounts = scenario.accounts as { accounts: unknown[] };

  it('is a shop, not a blank page', () => {
    expect(accounts.accounts).toHaveLength(3);
    expect(ledger.invoices).toHaveLength(40);
    expect(ledger.refunds).toHaveLength(1);
    expect(ledger.requests).toHaveLength(1);
  });

  it('is deterministic, so the demo and the video match', () => {
    const again = demoScenario(new Date('2026-10-31T12:00:00Z'));
    expect(JSON.stringify(again)).toBe(JSON.stringify(scenario));
  });

  it('contains no key material of any kind', () => {
    expect(JSON.stringify(scenario)).not.toMatch(/xprv|yprv|zprv|Ltpv|abandon abandon/);
  });
});
