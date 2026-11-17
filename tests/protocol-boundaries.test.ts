import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
import { mutateLedger, mutateShift, replaceLedger, replaceShiftLog, retryPendingWrites, pendingWriteKeys } from '../src/core/storage';
beforeEach(() => {
 localStorage.clear(); vi.stubGlobal('indexedDB', new IDBFactory());
 vi.stubGlobal('navigator', { locks: { request: async (_k: string, _o: unknown, cb: () => unknown) => cb() } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
for (const [key, mutate, replace] of [ ['slip.ledger.v1', mutateLedger, replaceLedger], ['slip.shifts.v1', mutateShift, replaceShiftLog] ] as const) {
 for (const boundary of ['prepared', 'mirror', 'committed'] as const) it(`${key} retries ${boundary} failure and acknowledges durably`, async () => {
  let count = 0;
  const original = IDBDatabase.prototype.transaction;
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function(this: IDBDatabase, ...args: Parameters<typeof original>) {
   const tx = original.apply(this,args);
   if (args[1] === 'readwrite' && ++count === (boundary === 'committed' ? 2 : 1) && boundary !== 'mirror') queueMicrotask(() => tx.abort());
   return tx;
  });
  const mirror = boundary === 'mirror' ? vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw Error('quota'); }) : null;
  await expect(mutate(async () => '{"events":[]}')).rejects.toThrow();
  expect(pendingWriteKeys()).toContain(key);
  spy.mockRestore(); mirror?.mockRestore();
  await retryPendingWrites();
  expect(pendingWriteKeys()).not.toContain(key);
  await mutate(async base => base);
  expect(localStorage.getItem(key)).toBe('{"events":[]}');
 });
 it(`${key} explicit replacement recovers a failed mirror`,async () => {
  const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw Error('quota'); });
  await expect(mutate(async () => 'failed')).rejects.toThrow(); spy.mockRestore();
  await replace('replacement'); expect(pendingWriteKeys()).not.toContain(key);
  await mutate(async base => base + '!'); expect(localStorage.getItem(key)).toBe('replacement!');
 });
}
