import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  clearWriteFailed,
  isQuotaError,
  isWriteFailed,
  setWriteFailed,
  subscribeWriteState,
} from '../src/core/save-state';
import SaveWarning from '../src/ui/SaveWarning';
import { guardedSetItem } from '../src/core/storage';

beforeEach(() => vi.resetModules());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('write state', () => {
  it('tracks keys independently and notifies listeners', () => {
    const seen: boolean[] = [];
    const stop = subscribeWriteState((f) => seen.push(f));
    setWriteFailed('one');
    setWriteFailed('two');
    clearWriteFailed('one');
    expect(isWriteFailed()).toBe(true);
    clearWriteFailed('unrelated');
    expect(isWriteFailed()).toBe(true);
    clearWriteFailed('two');
    stop();
    expect(seen).toEqual([false, true, true, true, false]);
  });
  it('recognizes quota errors without mislabelling generic failures', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError(new Error('no'))).toBe(false);
  });
  it('rethrows the original guarded failure', () => {
    const error = new Error('refused');
    const raw = {
      getItem: () => null,
      setItem: (): void => {
        throw error;
      },
      removeItem: () => {},
    };
    expect(() => guardedSetItem(raw, 'key', 'value')).toThrow(error);
    // Resolve this test's exact key, not a global reset.
    // Pending writes must not be silently overwritten.
    raw.setItem = () => {};
    expect(() => guardedSetItem(raw, 'key', 'value')).toThrow('Unsaved changes');
  });
  it('renders an accessible non-dismissable recovery alert', () => {
    setWriteFailed('ui');
    const html = renderToStaticMarkup(createElement(SaveWarning));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry unsaved changes');
    expect(html).toContain('href="#backup"');
    expect(html).toContain('Do not close');
    clearWriteFailed('ui');
  });
});

describe('storage recovery overlay', () => {
  async function setup() {
    const storage = await import('../src/core/storage');
    const state = await import('../src/core/save-state');
    window.localStorage.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, callback: () => unknown) => callback() } });
    return { ...storage, ...state };
  }
  it('keeps every unresolved key through unrelated successes and real retries', async () => {
    const api = await setup();
    const disk = window.localStorage;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => api.store().setItem('sale', 'one')).toThrow('full');
    expect(() => api.store().setItem('settings', 'two')).toThrow('full');
    expect(api.recoveryStore().getItem('sale')).toBe('one');
    expect(disk.getItem('sale')).toBeNull();
    write.mockRestore();
    api.store().setItem('backup-date', 'today');
    expect(api.isWriteFailed()).toBe(true);
    expect(() => api.store().setItem('settings', 'new')).toThrow('Unsaved changes');
    expect(api.pendingWriteKeys()).toEqual(['sale', 'settings']);
    await api.retryPendingWrites();
    expect(disk.getItem('sale')).toBe('one');
    expect(api.pendingWriteKeys()).toEqual([]);
    expect(api.isWriteFailed()).toBe(false);
  });
  it('retry rethrows and retains records until the device accepts them', async () => {
    const api = await setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => api.store().setItem('sale', 'one')).toThrow();
    await expect(api.retryPendingWrites()).rejects.toThrow('full');
    expect(api.pendingWriteKeys()).toEqual(['sale']);
    expect(api.recoveryStore().getItem('sale')).toBe('one');
    expect(api.isWriteFailed()).toBe(true);
  });
  it('rebases a failed record onto other-tab additions and changes', async () => {
    const api = await setup();
    const key = 'independent-record';
    window.localStorage.setItem(
      key,
      JSON.stringify({ invoices: [{ id: 'a', status: 'awaiting', note: '' }], books: {} }),
    );
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() =>
      api
        .store()
        .setItem(
          key,
          JSON.stringify({ invoices: [{ id: 'a', status: 'complete', note: '' }], books: {} }),
        ),
    ).toThrow();
    write.mockRestore();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        invoices: [
          { id: 'a', status: 'awaiting', note: 'other tab' },
          { id: 'b', status: 'awaiting' },
        ],
        books: { other: { next: 3 } },
      }),
    );
    const recovered = JSON.parse(api.recoveryStore().getItem(key)!);
    expect(recovered.invoices).toEqual([
      { id: 'a', status: 'complete', note: 'other tab' },
      { id: 'b', status: 'awaiting' },
    ]);
    await api.retryPendingWrites();
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual(recovered);
  });
  it('keeps the original delta across failed retries while another tab keeps editing', async () => {
    const api = await setup();
    window.localStorage.setItem('record', JSON.stringify({ local: 0, remote: 0 }));
    const set = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => api.store().setItem('record', JSON.stringify({ local: 1, remote: 0 }))).toThrow();
    set.call(window.localStorage, 'record', JSON.stringify({ local: 0, remote: 1 }));
    await expect(api.retryPendingWrites()).rejects.toThrow('full');
    expect(JSON.parse(api.pendingRecoveryWrites().record!)).toEqual({ local: 1, remote: 0 });
    set.call(window.localStorage, 'record', JSON.stringify({ local: 0, remote: 2 }));
    write.mockRestore();
    await api.retryPendingWrites();
    expect(JSON.parse(api.store().getItem('record')!)).toEqual({ local: 1, remote: 2 });
    expect(api.isWriteFailed()).toBe(false);
  });
  it('refuses uncoordinated synchronous shift mutations', async () => {
    const api = await setup();
    expect(() => api.store().setItem('slip.shifts.v1', '{}')).toThrow('asynchronous');
    expect(() => api.store().removeItem('slip.shifts.v1')).toThrow('asynchronous');
  });
  it('refuses conflicting other-tab updates without overwriting either recovery or disk', async () => {
    const api = await setup();
    window.localStorage.setItem('record', JSON.stringify({ status: 'awaiting' }));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => api.store().setItem('record', JSON.stringify({ status: 'complete' }))).toThrow();
    write.mockRestore();
    window.localStorage.setItem('record', JSON.stringify({ status: 'cancelled' }));
    await expect(api.retryPendingWrites()).rejects.toThrow('Recovery conflict');
    expect(JSON.parse(api.store().getItem('record')!).status).toBe('cancelled');
    expect(JSON.parse(api.pendingRecoveryWrites().record!).status).toBe('complete');
    expect(api.isWriteFailed()).toBe(true);
  });
  it('loads a failed invoice update through a fresh ledger repository for recovery', async () => {
    const api = await setup();
    const { createLedger, LEDGER_KEY } = await import('../src/core/ledger');
    window.localStorage.setItem(
      LEDGER_KEY,
      JSON.stringify({
        version: 1,
        invoices: [
          {
            id: 'sale',
            status: 'awaiting',
            amountAtoms: '100',
            amountMinor: '1',
            rateMinorPerCoin: null,
            lines: [],
          },
        ],
        items: [],
        requests: [],
        books: {},
      }),
    );
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    await expect(
      createLedger(api.store()).touchInvoice('sale', { status: 'complete', receivedAtoms: 100n }),
    ).rejects.toThrow('full');
    expect(createLedger(api.store()).load().invoices[0]?.status).toBe('awaiting');
    expect(createLedger(api.recoveryStore()).load().invoices[0]?.status).toBe('complete');
    expect(JSON.parse(window.localStorage.getItem(LEDGER_KEY)!).invoices[0].status).toBe(
      'awaiting',
    );
    expect(api.isWriteFailed()).toBe(true);
    write.mockRestore();
    await api.retryPendingWrites();
    expect(JSON.parse(window.localStorage.getItem(LEDGER_KEY)!).invoices[0].status).toBe(
      'complete',
    );
    expect(api.isWriteFailed()).toBe(false);
  });
  it('isolates demo pending writes, retry and wipe from real records', async () => {
    window.history.replaceState({}, '', '/?demo=1');
    const api = await setup();
    window.localStorage.setItem('sale', 'real');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => api.store().setItem('sale', 'pretend')).toThrow();
    write.mockRestore();
    expect(api.recoveryStore().getItem('sale')).toBe('pretend');
    await api.retryPendingWrites();
    expect(window.localStorage.getItem('sale')).toBe('real');
    expect(window.localStorage.getItem('slip.demo.sale')).toBe('pretend');
    await api.clearDemo();
    expect(window.localStorage.getItem('sale')).toBe('real');
    window.history.replaceState({}, '', '/');
  });
});
