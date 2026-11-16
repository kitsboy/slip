import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
function setup(cached?: string) {
  const map = new Map<string, string>();
  if (cached) map.set('slip.persistGrant.v1', cached);
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  const persist = vi.fn(async () => false);
  const persisted = vi.fn(async () => false);
  vi.stubGlobal('navigator', { storage: { persist, persisted } });
  return { store, persist, persisted };
}

describe('browser persistence', () => {
  it('checks live status each boot rather than trusting a cached kept answer', async () => {
    const { store, persist, persisted } = setup(
      JSON.stringify({ answer: 'kept', promisedAt: '2025-01-01' }),
    );
    const api = await import('../src/core/persist');
    expect(api.persistState(store)?.answer).toBe('unknown');
    expect((await api.ensurePersistentStorage(store)).answer).toBe('not-guaranteed');
    expect(persist).not.toHaveBeenCalled();
    expect(persisted).toHaveBeenCalledTimes(1);
    persisted.mockResolvedValue(true);
    expect((await api.ensurePersistentStorage(store)).answer).toBe('kept');
    expect(persisted).toHaveBeenCalledTimes(2);
  });
  it('requests once, collapses concurrent boot calls, and Ask again really requests', async () => {
    const { store, persist, persisted } = setup();
    const api = await import('../src/core/persist');
    await Promise.all([api.ensurePersistentStorage(store), api.ensurePersistentStorage(store)]);
    expect(persist).toHaveBeenCalledTimes(1);
    await api.ensurePersistentStorage(store);
    expect(persist).toHaveBeenCalledTimes(1);
    persist.mockImplementation(async () => {
      persisted.mockResolvedValue(true);
      return true;
    });
    expect((await api.recheckPersistence(store)).answer).toBe('kept');
    expect(persist).toHaveBeenCalledTimes(2);
  });
  it('does not equate a granted request with a verified browser grant', async () => {
    const { store, persist } = setup();
    persist.mockResolvedValue(true);
    const api = await import('../src/core/persist');
    expect((await api.ensurePersistentStorage(store)).answer).toBe('not-guaranteed');
  });
  it('reports unknown for unsupported or failing APIs instead of cached success', async () => {
    const { store, persisted } = setup(JSON.stringify({ answer: 'kept', promisedAt: 'old' }));
    persisted.mockRejectedValue(new Error('blocked'));
    const api = await import('../src/core/persist');
    expect((await api.ensurePersistentStorage(store)).answer).toBe('unknown');
    vi.stubGlobal('navigator', {});
    expect((await api.recheckPersistence(store)).answer).toBe('unknown');
  });
  it('does not hammer requests when bookkeeping writes fail', async () => {
    const { store, persist } = setup();
    store.setItem = () => {
      throw new Error('full');
    };
    const api = await import('../src/core/persist');
    await api.ensurePersistentStorage(store);
    await api.ensurePersistentStorage(store);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('does not request unnecessarily when the browser already keeps storage', async () => {
    const { store, persisted, persist } = setup();
    persisted.mockResolvedValue(true);
    const api = await import('../src/core/persist');
    expect((await api.ensurePersistentStorage(store)).answer).toBe('kept');
    expect(persist).not.toHaveBeenCalled();
  });
});
