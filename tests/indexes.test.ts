import { describe, expect, it } from 'vitest';
import {
  emptyBook,
  gapLimitScan,
  markUsed,
  nextAfterUsed,
  release,
  reserve,
} from '../src/core/indexes';

describe('reserve', () => {
  it('hands out 0 first, then 1, then 2', () => {
    let book = emptyBook();
    const a = reserve(book);
    book = a.book;
    const b = reserve(book);
    book = b.book;
    const c = reserve(book);
    expect([a.index, b.index, c.index]).toEqual([0, 1, 2]);
  });

  it('never reuses an index that was marked used', () => {
    let book = emptyBook();
    const first = reserve(book);
    book = markUsed(first.book, first.index);
    const second = reserve(book);
    expect(second.index).toBe(1);
  });

  it('does not hand out a currently-reserved index', () => {
    let book = emptyBook();
    const a = reserve(book);
    const b = reserve(a.book);
    expect(b.index).toBe(1);
    expect(a.book.reserved).toEqual([0]);
  });
});

describe('release', () => {
  it('gives a cancelled index back and rewinds next', () => {
    const a = reserve(emptyBook());
    const released = release(a.book, a.index);
    expect(released.reserved).toEqual([]);
    expect(released.next).toBe(0);
    expect(reserve(released).index).toBe(0);
  });

  it('cannot un-burn a used index', () => {
    const a = reserve(emptyBook());
    const used = markUsed(a.book, a.index);
    const after = release(used, a.index);
    expect(after.used).toEqual([0]);
    expect(reserve(after).index).toBe(1);
  });
});

describe('markUsed', () => {
  it('is idempotent and keeps the list sorted', () => {
    let book = markUsed(emptyBook(), 3);
    book = markUsed(book, 1);
    book = markUsed(book, 3);
    expect(book.used).toEqual([1, 3]);
    expect(book.next).toBe(4);
  });
});

describe('nextAfterUsed', () => {
  it('starts at 0 for a fresh wallet and after the highest used index otherwise', () => {
    expect(nextAfterUsed([])).toBe(0);
    expect(nextAfterUsed([0, 1, 2])).toBe(3);
    expect(nextAfterUsed([7, 2])).toBe(8);
  });
});

describe('gapLimitScan', () => {
  it('accepts a wallet whose first 20 addresses are unused', async () => {
    const r = await gapLimitScan(() => false);
    expect(r.ok).toBe(true);
    expect(r.nextIndex).toBe(0);
    expect(r.scanned).toBe(20);
  });

  it('skips past addresses that are already used', async () => {
    const seen = new Set([0, 1, 2, 3, 4]);
    const r = await gapLimitScan((i) => seen.has(i), { gap: 5 });
    expect(r.ok).toBe(true);
    expect(r.nextIndex).toBe(5);
  });

  it('refuses to guess when the scan hits the limit', async () => {
    const r = await gapLimitScan(() => true, { gap: 5, maxScan: 10 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/check the explorer/);
  });

  it('rejects nonsensical parameters', async () => {
    await expect(gapLimitScan(() => false, { gap: 0 })).rejects.toThrow();
    await expect(gapLimitScan(() => false, { gap: 30, maxScan: 10 })).rejects.toThrow();
  });

  it('reports how far it looked, so a slow provider is visible', async () => {
    const seen = new Set([0, 1, 2]);
    const r = await gapLimitScan((i) => seen.has(i), { gap: 4 });
    expect(r.scanned).toBe(7);
  });
});
