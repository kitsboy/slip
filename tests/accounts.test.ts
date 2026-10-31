import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  createRepository,
  statusOf,
  validateAccountInput,
  type KeyValueStore,
} from '../src/core/accounts';
import { hashPin, isValidPin, validateHandoff, verifyPin } from '../src/core/pin';
import { checkAddress, detectNetworks } from '../src/core/addresses';
import { staffSummary, verifyLog } from '../src/core/shifts';

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
    expect(repo.active()).toBeNull();
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
