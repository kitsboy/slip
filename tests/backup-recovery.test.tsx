import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Backup from '../src/ui/Backup';
import { createLedger, LEDGER_KEY } from '../src/core/ledger';
import { emptyLedger } from '../src/core/ledger';
import { isWriteFailed } from '../src/core/save-state';
import {
  store,
  recoveryStore,
  rememberRecoverySale,
  retryPendingWrites,
} from '../src/core/storage';
import { restoreBackup } from '../src/core/backup';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('exports a failed updated ledger through the existing encrypted Backup UI without claiming disk recovery', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, callback: () => unknown) => callback() } });
  const repo = createLedger(store());
  await repo.save(emptyLedger());
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full');
  });
  await expect(
    repo.addRequest({
      id: 'recovery',
      label: 'Recover this',
      walletId: 'w',
      walletLabel: 'Shop',
      amountMinor: 123n,
      currency: 'USD',
      cadence: 'monthly',
      nextDue: '2026-11-01',
      createdAt: '2026-11-01',
      lastPaidAt: null,
    }),
  ).rejects.toThrow();
  expect(repo.load().requests).toHaveLength(0);
  expect(createLedger(recoveryStore()).load().requests[0]?.amountMinor).toBe(123n);
  rememberRecoverySale({ cart: [{ title: 'Unsaved cart', amount: 123n }] });
  expect(() => store().setItem('slip.recovery.sale.v1', '{"note":"extra recovery"}')).toThrow();
  expect(JSON.parse(window.localStorage.getItem(LEDGER_KEY)!).requests).toHaveLength(0);
  let blob: Blob | undefined;
  const url = vi.fn((value: Blob) => {
    blob = value;
    return 'blob:backup';
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: url });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<Backup />);
    });
    const input = host.querySelector('input[type=password]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'recovery backup passphrase',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Export encrypted backup',
    )!;
    await act(async () => {
      button.click();
      await vi.waitFor(() => expect(url).toHaveBeenCalled(), { timeout: 3000 });
    });
    const encrypted = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob!);
    });
    expect(encrypted).not.toContain('Recover this');
    const restored = await restoreBackup(encrypted, 'recovery backup passphrase');
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.error);
    const state = restored.state as {
      ledger: { requests: { amountMinor: string }[] };
      recoveryWrites: Record<string, string>;
    };
    // Failed intent must not masquerade as committed books; kept separately for recovery.
    expect(state.ledger.requests).toHaveLength(0);
    expect(state.recoveryWrites[LEDGER_KEY]).toContain('Recover this');
    expect(state.recoveryWrites['slip.recovery.sale.v1']).toBe('{"note":"extra recovery"}');
    expect((state as unknown as { recoverySale: unknown }).recoverySale).toEqual({
      cart: [{ title: 'Unsaved cart', amount: '123' }],
    });
    expect(isWriteFailed()).toBe(true);
    expect(host.textContent).toContain('does not save them to this device');
    expect(JSON.parse(window.localStorage.getItem(LEDGER_KEY)!).requests).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    fail.mockRestore();
    await retryPendingWrites();
    rememberRecoverySale(null);
  }
});
