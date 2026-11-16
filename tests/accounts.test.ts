import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  STORAGE_KEY,
  createRepository,
  statusOf,
  validateAccountInput,
  type KeyValueStore,
} from '../src/core/accounts';
import { hashPin, isValidPin, validateHandoff, verifyPin } from '../src/core/pin';
import { checkAddress, detectNetworks } from '../src/core/addresses';
import { appendEvent, emptyLog, staffSummary, verifyLog } from '../src/core/shifts';
import { retryPendingWrites, store as browserStore } from '../src/core/storage';
import { isWriteFailed } from '../src/core/save-state';

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const BIP84_FIRST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

function memoryStore(): KeyValueStore & { dump(): string | null } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => map.get(STORAGE_KEY) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe('checkAddress', () => {
  it('accepts a mainnet address on mainnet and names its script type', () => {
    const r = checkAddress(BIP84_FIRST, 'btc-mainnet');
    expect(r.ok).toBe(true);
    expect(r.scriptType).toBe('p2wpkh');
    expect(r.warnings).toEqual([]);
  });

  it('refuses the same address on Litecoin and on a test network', () => {
    expect(checkAddress(BIP84_FIRST, 'ltc-mainnet').ok).toBe(false);
    expect(checkAddress(BIP84_FIRST, 'ltc-mainnet').problem).toMatch(/Bitcoin, not Litecoin/);
    expect(checkAddress(BIP84_FIRST, 'btc-signet').ok).toBe(false);
  });

  it('refuses a corrupted checksum instead of pretending it is valid', () => {
    const bad = BIP84_FIRST.slice(0, -1) + (BIP84_FIRST.endsWith('u') ? 'v' : 'u');
    const r = checkAddress(bad, 'btc-mainnet');
    expect(r.ok).toBe(false);
    expect(r.problem).toMatch(/not a valid/);
  });

  it('reports that all Bitcoin test networks share one encoding', () => {
    const { networks } = detectNetworks('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx');
    expect(networks).toContain('btc-signet');
    expect(networks).toContain('btc-testnet4');
    expect(networks).not.toContain('btc-mainnet');
  });

  it('refuses an empty address', () => {
    expect(checkAddress('   ', 'btc-mainnet').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Account validation — the BIP-85 shape
// ---------------------------------------------------------------------------

describe('validateAccountInput', () => {
  it('derives the preview and pins the first address to the official vector', () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: ZPUB,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.draft.firstAddress).toBe(BIP84_FIRST);
    expect(v.draft.preview).toHaveLength(5);
    expect(v.draft.acknowledgedAt).toBeNull();
    expect(v.warnings.join(' ')).toMatch(/shared between BTC and LTC/);
  });

  it('requires a name — an anonymous counter makes the hand-off log meaningless', () => {
    const v = validateAccountInput({ label: ' ', xpub: ZPUB, coin: 'btc', networkId: 'btc-mainnet' });
    expect(v.ok).toBe(false);
  });

  it('refuses a coin/network mismatch', () => {
    const v = validateAccountInput({ label: 'Counter', xpub: ZPUB, coin: 'ltc', networkId: 'btc-mainnet' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/not a LTC network/);
  });

  it('refuses a seed phrase with a kind-only message', () => {
    const v = validateAccountInput({
      label: 'Counter',
      xpub: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error).toMatch(/recovery phrase/);
      expect(v.error).not.toContain('abandon');
    }
  });
});

// ---------------------------------------------------------------------------
// Repository: persistence + the acknowledgement gate
// ---------------------------------------------------------------------------

describe('counter repository', () => {
  const draft = () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: ZPUB,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    if (!v.ok) throw new Error(v.error);
    return v;
  };

  it('starts empty and survives a corrupt store', () => {
    const store = memoryStore();
    expect(createRepository(store).load().accounts).toEqual([]);
    store.setItem(STORAGE_KEY, '{not json');
    expect(createRepository(store).load().accounts).toEqual([]);
  });

  // The till could not be opened on a brand-new shop: the first counter was added but never made
  // active, so "Open the till" and the first sale's shift line both did nothing, silently.
  it('makes the first counter active, and heals a store that never said which one', () => {
    const store = memoryStore();
    const repo = createRepository(store);
    const acct = repo.addAccount(draft());
    expect(repo.active()?.id).toBe(acct.id);

    // An older store with accounts but no pointer still answers with the obvious counter.
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, accounts: repo.load().accounts, activeAccountId: null }),
    );
    expect(createRepository(store).active()?.id).toBe(acct.id);
  });

  it('adds an account as UNCHECKED and only enables it after acknowledgement', () => {
    const store = memoryStore();
    const repo = createRepository(store);
    const acct = repo.addAccount(draft());
    expect(statusOf(acct)).toBe('unchecked');
    expect(repo.load().accounts[0]!.acknowledgedAt).toBeNull();

    const acked = repo.acknowledge(acct.id, new Date('2026-10-30T12:00:00Z'));
    expect(acked?.acknowledgedAt).toBe('2026-10-30T12:00:00.000Z');
    expect(statusOf(repo.load().accounts[0]!)).toBe('ready');
  });

  it('keeps two counters independent', () => {
    const store = memoryStore();
    const repo = createRepository(store);
    const a = repo.addAccount(draft());
    const b = repo.addAccount({
      ...draft(),
      draft: { ...draft().draft, label: 'Food truck' },
    });
    expect(repo.load().accounts.map((x) => x.label)).toEqual(['Front counter', 'Food truck']);
    expect(a.id).not.toBe(b.id);
  });

  it('records and clears a hand-off', () => {
    const store = memoryStore();
    const repo = createRepository(store);
    const acct = repo.addAccount(draft());
    repo.acknowledge(acct.id);
    repo.setHandoff(acct.id, 'Ana');
    expect(repo.currentStaff()).toBe('Ana');
    expect(repo.active()?.label).toBe('Front counter');
    repo.clearHandoff();
    expect(repo.currentStaff()).toBeNull();
    // The till keeps its counter: clearing a hand-off is not the same as unchoosing the shop.
    expect(repo.active()?.id).toBe(acct.id);
  });

  it('persists through a fresh repository instance (a reload)', () => {
    const store = memoryStore();
    const first = createRepository(store);
    const acct = first.addAccount(draft());
    first.acknowledge(acct.id);
    const second = createRepository(store);
    expect(second.load().accounts[0]!.acknowledgedAt).not.toBeNull();
  });
});


// ---------------------------------------------------------------------------
// Descriptors are accepted as counter material too (Coldcard/Sparrow style)
// ---------------------------------------------------------------------------

describe('counters from descriptors', () => {
  const WPCH = `wpkh(${ZPUB}/0/*)`;

  it('accepts a wpkh() descriptor and derives the same first address', () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: WPCH,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.draft.source).toBe('descriptor');
    expect(v.draft.firstAddress).toBe(BIP84_FIRST);
    expect(v.draft.preview).toHaveLength(5);
  });

  it('reports a missing #checksum as a warning, not an error', () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: WPCH,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.warnings.join(' ')).toMatch(/no #checksum/);
  });

  it('refuses a descriptor whose checksum does not match its body', () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: `${WPCH}#deadbeef`,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/checksum/i);
  });

  it('still refuses a seed phrase pasted into the descriptor box', () => {
    const v = validateAccountInput({
      label: 'Front counter',
      xpub: 'wpkh(abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about)',
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).not.toContain('abandon');
  });
});


// ---------------------------------------------------------------------------
// Wallets you hold for other people: pubkey-only, plain address, labels
// ---------------------------------------------------------------------------

describe('wallet shapes', () => {
  // The generator point G: a public vector, so a wrong encoder fails here loudly.
  const PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const PUBKEY_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'; // BIP-173 vector
  const ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

  it('accepts a single public key and says plainly that it is one address', () => {
    const v = validateAccountInput({
      label: "Mum's savings",
      xpub: PUBKEY,
      coin: 'btc',
      networkId: 'btc-mainnet',
      purpose: 'family',
      colour: 'teal',
      note: 'rent',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.draft.source).toBe('pubkey');
    expect(v.draft.firstAddress).toBe(PUBKEY_ADDRESS);
    expect(v.draft.preview).toHaveLength(1);
    expect(v.draft.colour).toBe('teal');
    expect(v.draft.purpose).toBe('family');
    expect(v.draft.note).toBe('rent');
    expect(v.warnings.join(' ')).toMatch(/exactly ONE address/);
  });

  it('accepts a plain address for a one-off deposit', () => {
    const v = validateAccountInput({
      label: 'Work deposit',
      xpub: ADDRESS,
      coin: 'btc',
      networkId: 'btc-mainnet',
      purpose: 'work',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.draft.source).toBe('address');
    expect(v.draft.firstAddress).toBe(ADDRESS);
    expect(v.warnings.join(' ')).toMatch(/cannot be rotated/);
  });

  it('refuses an address from the wrong chain', () => {
    const v = validateAccountInput({
      label: 'Work deposit',
      xpub: ADDRESS,
      coin: 'ltc',
      networkId: 'ltc-mainnet',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/Bitcoin, not Litecoin/);
  });

  it('refuses a malformed public key rather than deriving nonsense', () => {
    const v = validateAccountInput({
      label: 'Bad key',
      xpub: '04' + 'ab'.repeat(32),
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    expect(v.ok).toBe(false);
  });

  it('carries colour/purpose through the repository and defaults them for old records', () => {
    const store = memoryStore();
    const repo = createRepository(store);
    const v = validateAccountInput({
      label: 'Work',
      xpub: ZPUB,
      coin: 'btc',
      networkId: 'btc-mainnet',
      colour: 'blue',
      purpose: 'work',
    });
    if (!v.ok) throw new Error(v.error);
    const acct = repo.addAccount(v);
    expect(acct.colour).toBe('blue');
    expect(acct.purpose).toBe('work');

    // an account written before colours existed must not render colourless
    const legacy = { ...acct } as Record<string, unknown>;
    delete legacy.colour;
    delete legacy.purpose;
    delete legacy.note;
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 1, accounts: [legacy], activeAccountId: null, currentStaff: null, pinHash: null }));
    const migrated = createRepository(store).load().accounts[0]!;
    expect(migrated.colour).toBe('orange');
    expect(migrated.purpose).toBe('till');
    expect(migrated.note).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The shift log is written alongside the accounts
// ---------------------------------------------------------------------------

describe('repository shift log', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: () => unknown) => callback() } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it.each([false, true])('uses guarded browser storage (Web Locks: %s)', async (locked) => {
    const request = vi.fn(async (_name, _options, callback) => callback());
    vi.stubGlobal('navigator', { locks: locked ? { request } : undefined });
    if (!locked) {
      await expect(createRepository(browserStore()).recordShift('open', null, 'Ana')).rejects.toThrow('unavailable');
      return;
    }
    const store = browserStore();
    const repo = createRepository(store);
    await Promise.all(Array.from({ length: 8 }, (_, i) =>
      createRepository(store).recordShift('handoff', null, `staff-${i}`),
    ));
    expect(repo.shifts().events).toHaveLength(8);
    expect((await verifyLog(repo.shifts())).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(locked ? 8 : 0);
    if (locked) expect(request).toHaveBeenCalledWith(
      'slip.shifts.v1', { mode: 'exclusive' }, expect.any(Function),
    );
  });

  it('isolates demo and real browser lock names and persisted chains', async () => {
    const originalUrl = window.location.href;
    const request = vi.fn(async (_name, _options, callback) => callback());
    vi.stubGlobal('navigator', { locks: { request, query: async () => ({ held: [] }) } });
    try {
      window.history.replaceState(null, '', '/');
      vi.resetModules();
      const realAccounts = await import('../src/core/accounts');
      const realStorage = await import('../src/core/storage');
      const real = realAccounts.createRepository(realStorage.store());
      window.history.replaceState(null, '', '/?demo=1');
      vi.resetModules();
      const demoAccounts = await import('../src/core/accounts');
      const demoStorage = await import('../src/core/storage');
      const demo = demoAccounts.createRepository(demoStorage.store());
      await Promise.all([
        real.recordShift('open', null, 'real staff'),
        demo.recordShift('open', null, 'demo staff'),
      ]);
      expect(real.shifts().events.map((event) => event.staff)).toEqual(['real staff']);
      expect(demo.shifts().events.map((event) => event.staff)).toEqual(['demo staff']);
      expect(request.mock.calls.filter(([, options]) => options.mode === 'exclusive').map(([name]) => name).sort()).toEqual([
        'slip.demo.slip.shifts.v1', 'slip.shifts.v1',
      ]);
    } finally {
      window.history.replaceState(null, '', originalUrl);
      vi.resetModules();
    }
  });

  it('rejects guarded failures, keeps reads on disk, then recovers after retry', async () => {
    const repo = createRepository(browserStore());
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    const failed = repo.recordShift('open', null, 'Ana');
    const blocked = repo.recordShift('return', null, 'Ana');
    await expect(failed).rejects.toThrow('quota');
    await expect(blocked).rejects.toThrow('Unsaved changes');
    expect(isWriteFailed()).toBe(true);
    expect(repo.shifts().events).toEqual([]);
    failure.mockRestore();
    await retryPendingWrites();
    expect(isWriteFailed()).toBe(false);
    await repo.recordShift('return', null, 'Ana');
    expect(repo.shifts().events.map((event) => event.kind)).toEqual(['open', 'return']);
    expect((await verifyLog(repo.shifts())).ok).toBe(true);
  });

  it('recovered appends remain authoritative through a new module instance and stale disk reads', async () => {
    const repo = createRepository(browserStore());
    await repo.recordShift('open', null, 'first');
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('full'); });
    await expect(repo.recordShift('return', null, 'recovered')).rejects.toThrow('full');
    fail.mockRestore();
    await retryPendingWrites();
    vi.resetModules();
    const freshAccounts = await import('../src/core/accounts');
    const freshStorage = await import('../src/core/storage');
    const get = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      return key === 'slip.shifts.v1' ? null : get.call(this, key);
    });
    const log = await freshAccounts.createRepository(freshStorage.store()).recordShift('open', null, 'successor');
    expect(log.events.map((event) => event.staff)).toEqual(['first', 'recovered', 'successor']);
    expect((await verifyLog(log)).ok).toBe(true);
  });

  it('does not poison queued appends after an ordinary store rejection', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'setItem').mockImplementationOnce(() => { throw new Error('full'); });
    const repo = createRepository(store);
    const failed = repo.recordShift('open', null, 'Ana');
    const success = repo.recordShift('return', null, 'Bea');
    await expect(failed).rejects.toThrow('full');
    await success;
    expect(repo.shifts().events.map((event) => event.staff)).toEqual(['Bea']);
    expect((await verifyLog(repo.shifts())).ok).toBe(true);
  });

  it('rebases when an outside writer advances the chain during hashing', async () => {
    const store = memoryStore();
    const outside = await appendEvent(emptyLog(), {
      kind: 'open', accountId: null, accountLabel: null, staff: 'outside',
    });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      store.setItem('slip.shifts.v1', JSON.stringify(outside));
      return digest(algorithm, data);
    });
    const log = await createRepository(store).recordShift('return', null, 'local');
    expect(log.events.map((event) => event.staff)).toEqual(['outside', 'local']);
    expect((await verifyLog(log)).ok).toBe(true);
  });

  it('does not block independent stores or acquire browser locks for them', async () => {
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request, query: async () => ({ held: [] }) } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      await gate;
      return digest(algorithm, data);
    });
    const first = createRepository(memoryStore()).recordShift('open', null, 'first');
    await Promise.resolve();
    const second = await createRepository(memoryStore()).recordShift('open', null, 'second');
    expect(second.events[0]?.staff).toBe('second');
    expect(request).not.toHaveBeenCalled();
    release();
    await first;
  });

  it.each([false, true])('keeps simultaneous appends (multiple repositories: %s)', async (multiple) => {
    const store = memoryStore();
    const repo = createRepository(store);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (multiple ? createRepository(store) : repo).recordShift('handoff', null, `staff-${i}`),
    ));
    const log = createRepository(store).shifts();
    expect(log.events.map((event) => event.staff)).toEqual(
      Array.from({ length: 20 }, (_, i) => `staff-${i}`),
    );
    expect(results.map((result) => result.events.length)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect((await verifyLog(log)).ok).toBe(true);
  });

  it('appends a verifiable chain as accounts are added and handed over', async () => {
    const store = memoryStore();
    const repo = createRepository(store);

    const draft = validateAccountInput({
      label: 'Front counter',
      xpub: ZPUB,
      coin: 'btc',
      networkId: 'btc-mainnet',
    });
    if (!draft.ok) throw new Error(draft.error);

    const acct = repo.addAccount(draft);
    await repo.recordShift('account-added', acct, null, 'added');
    repo.acknowledge(acct.id);
    await repo.recordShift('acknowledge', acct, null, 'checked');
    repo.setHandoff(acct.id, 'Ana');
    await repo.recordShift('handoff', acct, 'Ana', 'handed over');

    const log = repo.shifts();
    expect(log.events.map((e) => e.kind)).toEqual(['account-added', 'acknowledge', 'handoff']);
    expect(log.events.map((e) => e.seq)).toEqual([0, 1, 2]);

    const verdict = await verifyLog(log);
    expect(verdict.ok).toBe(true);

    const summary = staffSummary(log);
    expect(summary).toHaveLength(1);
    expect(summary[0]!.staff).toBe('Ana');
    expect(summary[0]!.endedAt).toBeNull();
  });

  it('survives a corrupt log without bricking the till', () => {
    const store = memoryStore();
    store.setItem('slip.shifts.v1', 'not json');
    expect(createRepository(store).shifts().events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PIN + hand-off rules
// ---------------------------------------------------------------------------

describe('till PIN', () => {
  it('accepts 4–8 digits and nothing else', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('stores a PBKDF2 record, never the PIN', async () => {
    const stored = await hashPin('4321');
    expect(stored).toMatch(/^pbkdf2\$200000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('4321');
  });

  it('verifies the right PIN and rejects the wrong one', async () => {
    const stored = await hashPin('4321');
    expect(await verifyPin('4321', stored)).toBe(true);
    expect(await verifyPin('1234', stored)).toBe(false);
    expect(await verifyPin('4321', 'nonsense')).toBe(false);
  });

  it('salts per PIN, so the same PIN hashes differently each time', async () => {
    const a = await hashPin('4321');
    const b = await hashPin('4321');
    expect(a).not.toBe(b);
    expect(await verifyPin('4321', a)).toBe(true);
    expect(await verifyPin('4321', b)).toBe(true);
  });
});

describe('validateHandoff', () => {
  const base = { accountExists: true, accountAcknowledged: true, pinSet: false };

  it('accepts a named staff member on a checked account', () => {
    const v = validateHandoff({ staffName: 'Ana', accountId: 'a1' }, base);
    expect(v.ok).toBe(true);
  });

  it('refuses an unnamed hand-off', () => {
    const v = validateHandoff({ staffName: ' ', accountId: 'a1' }, base);
    expect(v.ok).toBe(false);
  });

  it('refuses an account the merchant has not checked against their wallet', () => {
    const v = validateHandoff(
      { staffName: 'Ana', accountId: 'a1' },
      { ...base, accountAcknowledged: false },
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/not been checked/);
  });

  it('requires the PIN when switching counters mid-shift', () => {
    const without = validateHandoff(
      { staffName: 'Ben', accountId: 'a1' },
      { ...base, currentStaff: 'Ana' },
    );
    expect(without.ok).toBe(false);
    const withPin = validateHandoff(
      { staffName: 'Ben', accountId: 'a1', pin: '1234' },
      { ...base, currentStaff: 'Ana' },
    );
    expect(withPin.ok).toBe(true);
  });

  it('does not require a PIN to hand the same person the same till again', () => {
    const v = validateHandoff(
      { staffName: 'Ana', accountId: 'a1' },
      { ...base, currentStaff: 'Ana' },
    );
    expect(v.ok).toBe(true);
  });
});
