/**
 * Write-failure state: when a guarded write throws, the whole shop must stop looking settled,
 * and when one succeeds again it must recover. localStorage gives no return value — these
 * tests pin the one contract the shell depends on.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isWriteFailed, setWriteFailed, clearWriteFailed, subscribeWriteState, isQuotaError } from '../src/core/save-state';
import { guardedSetItem } from '../src/core/storage';

function memStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function quotaErr(): DOMException {
  return new DOMException('full', 'QuotaExceededError');
}

function otherErr(): Error {
  return new Error('boom');
}

describe('save-state', () => {
  beforeEach(() => clearWriteFailed());

  it('starts clean', () => {
    expect(isWriteFailed()).toBe(false);
  });

  it('flags a failed write and clears on the next success', () => {
    setWriteFailed();
    expect(isWriteFailed()).toBe(true);
    clearWriteFailed();
    expect(isWriteFailed()).toBe(false);
  });

  it('notifies subscribers on both transitions', () => {
    const seen: boolean[] = [];
    subscribeWriteState((f) => seen.push(f));
    setWriteFailed();
    clearWriteFailed();
    expect(seen).toEqual([false, true, false]);
  });

  it('identifies a quota error but not a generic error', () => {
    expect(isQuotaError(quotaErr())).toBe(true);
    expect(isQuotaError(otherErr())).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });

  it('a guarded write that throws marks the shop failed', () => {
    expect(() => guardedSetItem({ ...memStore(), setItem: () => { throw quotaErr(); } }, 'k', 'v')).toThrow();
    expect(isWriteFailed()).toBe(true);
  });

  it('a guarded write that lands clears the flag', () => {
    setWriteFailed();
    guardedSetItem(memStore(), 'k', 'v');
    expect(isWriteFailed()).toBe(false);
  });

  it('re-throws the original error so callers can still shape their own message', () => {
    try {
      guardedSetItem({ ...memStore(), setItem: () => { throw quotaErr(); } }, 'k', 'v');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isQuotaError(e)).toBe(true);
    }
  });
});
