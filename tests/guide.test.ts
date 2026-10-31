import { describe, expect, it } from 'vitest';
import { describeAge, freshness, shortDigest, AGEING_AFTER_SECONDS, STALE_AFTER_SECONDS } from '../src/core/freshness';
import { closeTab, MAX_TABS, park, repeatable, tabLabel, tabSubtotalMinor, toTabLine, type ParkedTab } from '../src/core/tabs';
import { MANUAL, MANUAL_GROUPS, manualFor, searchManual } from '../src/manual/entries';
import type { CatalogItem } from '../src/core/catalog';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-31T12:00:00Z');

describe('freshness', () => {
  it('is fresh, ageing then stale as the clock moves', () => {
    const look = '2026-10-31T11:59:00Z';
    expect(freshness(look, NOW).level).toBe('fresh');
    expect(freshness(look, at('2026-10-31T12:04:00Z')).level).toBe('ageing');
    expect(freshness(look, at('2026-10-31T12:20:00Z')).level).toBe('stale');
  });

  it('drains the ring exactly as far as the refusal allows', () => {
    const stale = freshness('2026-10-31T11:50:00Z', NOW);
    expect(stale.fraction).toBe(0);
    expect(stale.ageSeconds).toBe(STALE_AFTER_SECONDS);
    expect(freshness('2026-10-31T09:00:00Z', NOW).fraction).toBe(0);
    const half = freshness('2026-10-31T11:55:00Z', NOW);
    expect(half.fraction).toBe(0.5);
    expect(freshness('2026-10-31T11:59:40Z', NOW).fraction).toBeGreaterThan(0.9);
    expect(AGEING_AFTER_SECONDS).toBeLessThan(STALE_AFTER_SECONDS);
  });

  it('never reports a negative age when a clock runs backwards', () => {
    const f = freshness('2026-10-31T12:10:00Z', NOW);
    expect(f.ageSeconds).toBe(0);
    expect(f.level).toBe('fresh');
  });

  it('calls an unparseable timestamp unknown rather than fresh', () => {
    const f = freshness('not a date', NOW);
    expect(f.level).toBe('stale');
    expect(f.label).toBe('unknown age');
  });

  it('speaks in human words', () => {
    expect(describeAge(10)).toBe('just now');
    expect(describeAge(70)).toBe('1 min');
    expect(describeAge(600)).toBe('10 min');
    expect(describeAge(7200)).toBe('2 hours');
    expect(describeAge(Infinity)).toBe('an unknown time');
  });

  it('shortens a digest in readable groups, without inventing characters', () => {
    expect(shortDigest('a1b2c3d4e5f6a7b8')).toBe('a1b2 c3d4');
    // A non-hex string is not a digest, and inventing one would be worse than showing nothing.
    expect(shortDigest('zzzz')).toBe('');
    expect(shortDigest('')).toBe('');
    expect(shortDigest('A1B2')).toBe('a1b2');
  });
});

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'i1',
  name: 'Espresso',
  priceMinor: 350n,
  priceCurrency: 'FIAT',
  category: 'Drinks',
  emoji: '☕',
  taxBps: 0,
  sort: 1,
  active: true,
  ...over,
});

const tab = (over: Partial<ParkedTab> = {}): ParkedTab => ({
  id: 't1',
  label: '',
  lines: [toTabLine(item(), 2)],
  custom: '',
  walletId: 'w1',
  note: '',
  createdAt: '2026-10-31T11:00:00.000Z',
  ...over,
});

describe('parked tabs', () => {
  it('parks a cart and refuses an empty one', () => {
    const parked = park([], tab());
    expect(parked.ok).toBe(true);
    expect(parked.tabs).toHaveLength(1);
    expect(park([], tab({ lines: [], custom: '' })).ok).toBe(false);
  });

  it('refuses more than five, with a sentence that says what to do', () => {
    const full = Array.from({ length: MAX_TABS }, (_, i) => tab({ id: `t${i}` }));
    const r = park(full, tab({ id: 'new' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('resume or close one');
  });

  it('closes by id and keeps the rest in order', () => {
    const list = [tab({ id: 'a' }), tab({ id: 'b' })];
    expect(closeTab(list, 'a').map((t) => t.id)).toEqual(['b']);
  });

  it('totals fiat lines and the custom amount, ignoring sats lines', () => {
    const t = tab({
      lines: [toTabLine(item(), 2), toTabLine(item({ id: 'i2', priceMinor: 100n, priceCurrency: 'SATS' }), 1)],
      custom: '1.50',
    });
    // 2 × 3.50 = 7.00, plus a 1.50 custom amount = 8.50
    expect(tabSubtotalMinor(t)).toBe(850n);
  });

  it('labels a tab from its contents so a phone can read it', () => {
    expect(tabLabel(tab())).toBe('2× Espresso');
    expect(tabLabel(tab({ label: 'Table 4' }))).toBe('Table 4');
    expect(tabLabel(tab({ lines: [] }))).toBe('custom amount');
  });

  it('knows when there is something to repeat', () => {
    expect(repeatable(null)).toBe(false);
    expect(repeatable({ lines: [], custom: '', totalMinor: '0', at: '' })).toBe(false);
    expect(repeatable({ lines: [toTabLine(item(), 1)], custom: '', totalMinor: '350', at: '' })).toBe(true);
  });
});

describe('the manual', () => {
  it('has a unique id per entry', () => {
    const ids = MANUAL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every group it declares', () => {
    const used = new Set(MANUAL.map((e) => e.group));
    for (const g of MANUAL_GROUPS) expect(used.has(g.id)).toBe(true);
  });

  it('gives every entry a why, a limit and at least one step', () => {
    for (const e of MANUAL) {
      expect(e.why.length).toBeGreaterThan(20);
      expect(e.limit.length).toBeGreaterThan(20);
      expect(e.steps.length).toBeGreaterThan(0);
      expect(e.code.length).toBeGreaterThan(0);
    }
  });

  it('never says "planned" for something that ships today', () => {
    expect(MANUAL.every((e) => e.status === 'live')).toBe(true);
  });

  it('searches the words a merchant would actually type', () => {
    expect(searchManual('lightning').map((e) => e.id)).toContain('lightning');
    expect(searchManual('refund').map((e) => e.id)).toContain('history');
    expect(searchManual('').length).toBe(MANUAL.length);
    expect(manualFor('till')?.title).toBe('Take a payment');
    expect(manualFor('nope')).toBeNull();
  });
});
