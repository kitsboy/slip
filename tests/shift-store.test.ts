import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { coordinateShift } from '../src/core/shift-store';
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, callback: () => unknown) => callback() } });
});
afterEach(() => vi.unstubAllGlobals());
it('uses durable committed data after the writer disappears and the successor reads stale null', async () => {
  let disk: string | null = null;
  await coordinateShift(false, { getItem: () => null }, async () => 'first', (value) => { disk = value; });
  // No live writer/marker or shared JS state. New connection, stale mirror.
  await coordinateShift(false, { getItem: () => null }, async (base) => `${base},second`, (value) => { disk = value; });
  expect(disk).toBe('first,second');
});
it('recovered writes become authoritative even for a stale successor', async () => {
  const mirror = { getItem: () => null };
  await expect(coordinateShift(false, mirror, async () => 'recovery', () => { throw new Error('quota'); })).rejects.toThrow('quota');
  await expect(coordinateShift(false, mirror, async () => 'unsafe', () => {})).rejects.toThrow('interrupted');
  await coordinateShift(false, mirror, async () => 'recovery', () => {}, 'recovery');
  let result: string | null = null;
  await coordinateShift(false, mirror, async (base) => `${base},next`, (value) => { result = value; });
  expect(result).toBe('recovery,next');
});
it('supports explicit replacement and deletion without resurrecting the prior log', async () => {
  let disk: string | null = null;
  const persist = (value: string | null) => { disk = value; };
  const mirror = { getItem: () => disk };
  await coordinateShift(false, mirror, async () => 'old', persist);
  await coordinateShift(false, mirror, async () => null, persist, undefined, true);
  await coordinateShift(false, { getItem: () => 'stale old' }, async (base) => `${base}:fresh`, persist);
  expect(disk).toBe('null:fresh');
});
it('fails closed when IndexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined);
  const persist = vi.fn();
  await expect(coordinateShift(false, { getItem: () => null }, async () => 'bad', persist)).rejects.toThrow('unavailable');
  expect(persist).not.toHaveBeenCalled();
});
