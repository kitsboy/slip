import { expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createBackup } from '../src/core/backup';
import { testBackup } from '../src/core/test-backup';
it('validates without touching storage and refuses malformed records', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const state = { app: 'slip', accounts: [], shifts: { version: 1, events: [] } };
  const good = await createBackup(state, 'a long safe passphrase 123');
  const spy = vi.spyOn(Storage.prototype, 'setItem');
  expect((await testBackup(good, 'a long safe passphrase 123')).ok).toBe(true);
  expect((await testBackup(good, 'wrong')).ok).toBe(false);
  const bad = await createBackup(
    { ...state, ledger: { version: 1, invoices: [{ amountAtoms: 'NaN' }] } },
    'a long safe passphrase 123',
  );
  expect((await testBackup(bad, 'a long safe passphrase 123')).ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  vi.unstubAllGlobals();
});
