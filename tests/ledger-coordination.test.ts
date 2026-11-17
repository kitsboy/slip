import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createLedger } from '../src/core/ledger';
import { store } from '../src/core/storage';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', new IDBFactory());
  let tail = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_key: string, _options: unknown, callback: () => Promise<unknown>) => {
    const run = tail.then(callback); tail = run.then(() => undefined, () => undefined); return run;
  } } });
});
afterEach(() => vi.unstubAllGlobals());
it('keeps independent ledger writes when a successor renderer reads stale null', async () => {
  const first = createLedger(store());
  await first.replaceItems([{ id: 'a', name: 'First', priceMinor: 1n } as never]);
  const original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key) {
    return key === 'slip.ledger.v1' ? null : original.call(this, key);
  });
  await createLedger(store()).addItem({ id: 'b', name: 'Second', priceMinor: 2n } as never);
  vi.restoreAllMocks();
  expect(first.load().items.map(i => i.id)).toEqual(['a', 'b']);
});
