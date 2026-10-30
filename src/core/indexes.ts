/**
 * Derivation-index discipline.
 *
 * The rule that makes "no address reuse" true rather than intended:
 *   - an index is RESERVED when an invoice is created, never on page load;
 *   - a cancelled sale RELEASES it, so nothing is burned;
 *   - a used index is never handed out again;
 *   - on setup, a gap-limit scan finds the true next index for a wallet that was already
 *     used elsewhere.
 *
 * This module is pure bookkeeping. It deliberately knows nothing about invoices, so the
 * rules can be tested now and the payment engine simply calls it later.
 */

export interface IndexBook {
  /** Next index to consider, per account. */
  readonly next: number;
  /** Indexes handed out and not yet used or released. */
  readonly reserved: number[];
  /** Indexes that produced a displayed address (never reuse). */
  readonly used: number[];
}

export function emptyBook(): IndexBook {
  return { next: 0, reserved: [], used: [] };
}

export interface Reservation {
  readonly index: number;
  readonly book: IndexBook;
}

/**
 * Reserves the lowest index that is neither used nor currently reserved.
 * Called at invoice creation — never on render, never on page load.
 */
export function reserve(book: IndexBook): Reservation {
  let candidate = book.next;
  const taken = new Set([...book.reserved, ...book.used]);
  while (taken.has(candidate)) candidate += 1;
  return {
    index: candidate,
    book: {
      next: candidate + 1,
      reserved: [...book.reserved, candidate],
      used: [...book.used],
    },
  };
}

/** The sale was cancelled before any address was shown: give the index back. */
export function release(book: IndexBook, index: number): IndexBook {
  return {
    next: Math.min(book.next, index),
    reserved: book.reserved.filter((i) => i !== index),
    used: [...book.used],
  };
}

/** An address was displayed (or an invoice exists): burn the index forever. */
export function markUsed(book: IndexBook, index: number): IndexBook {
  if (book.used.includes(index)) return book;
  return {
    next: Math.max(book.next, index + 1),
    reserved: book.reserved.filter((i) => i !== index),
    used: [...book.used, index].sort((a, b) => a - b),
  };
}

/**
 * Highest index that already produced activity, plus one — what a wallet that has been
 * used elsewhere actually needs. `seen` are the indexes the chain shows as used.
 */
export function nextAfterUsed(seen: readonly number[]): number {
  if (seen.length === 0) return 0;
  return Math.max(...seen) + 1;
}

export interface GapScan {
  /** True when a gap of `gap` unused addresses was found and a next index is safe. */
  readonly ok: boolean;
  readonly nextIndex: number;
  readonly scanned: number;
  readonly reason?: string;
}

/**
 * The BIP-44 style gap-limit scan. `isUsed(index)` asks the chain (an explorer) whether an
 * address has history; this function only applies the rule, so it stays testable offline.
 *
 * Returns ok:false when the scan ran past `maxScan` without finding `gap` consecutive
 * unused indexes — that means either the wallet is enormous or the provider is wrong, and
 * in both cases guessing an index would risk reuse.
 */
export async function gapLimitScan(
  isUsed: (index: number) => Promise<boolean> | boolean,
  opts: { gap?: number; maxScan?: number; startAt?: number } = {},
): Promise<GapScan> {
  const gap = opts.gap ?? 20;
  const maxScan = opts.maxScan ?? 200;
  const startAt = opts.startAt ?? 0;
  if (gap < 1 || maxScan < gap) throw new Error('gap and maxScan must be positive, maxScan >= gap');

  let consecutiveUnused = 0;
  let scanned = 0;
  for (let index = startAt; index < startAt + maxScan; index++) {
    scanned += 1;
    const used = await isUsed(index);
    if (used) {
      consecutiveUnused = 0;
    } else {
      consecutiveUnused += 1;
      if (consecutiveUnused >= gap) {
        return { ok: true, nextIndex: index - gap + 1, scanned };
      }
    }
  }
  return {
    ok: false,
    nextIndex: startAt,
    scanned,
    reason: `no run of ${gap} unused addresses within ${maxScan} indexes — check the explorer before issuing addresses`,
  };
}
