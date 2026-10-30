/**
 * Counter accounts — the BIP-85 shape, done watch-only.
 *
 * BIP-85 derives child entropy from the master PRIVATE key, so no watch-only app can
 * perform it. What slip does instead, and what the merchant does on their own signer:
 *
 *   Coldcard / Sparrow: derive a BIP-85 child seed → import it as its own wallet →
 *   export that wallet's account xpub → paste it here as "Front counter" or
 *   "Food truck". Each account keeps its own address index, its own reports and its own
 *   staff hand-off, with no link back to the master key on this device.
 *
 * An account is only usable after its first derived address has been checked against
 * the merchant's own wallet (`acknowledge`). That gate is the whole safety story: a
 * wrong-but-plausible address sends a sale to an output the wallet never watches.
 */

import { parseExtendedKey, resolveScript, type ScriptType } from './keys';
import { previewAddresses, type DerivedAddress } from './derive';
import { networkById, type Coin, type NetworkId } from './network';

export type AccountStatus = 'unchecked' | 'ready';

export interface CounterAccount {
  readonly id: string;
  readonly label: string;
  readonly xpub: string;
  readonly coin: Coin;
  readonly networkId: NetworkId;
  readonly scriptType: ScriptType;
  readonly fingerprintHex: string;
  readonly prefix: string;
  /** First receiving address, kept so the check can be re-shown without re-deriving. */
  readonly firstAddress: string;
  /** ISO timestamp of the merchant's explicit "this matches my wallet" acknowledgement. */
  readonly acknowledgedAt: string | null;
  readonly createdAt: string;
  readonly staffName: string | null;
  readonly nextIndex: number;
}

export interface AccountDraft {
  readonly label: string;
  readonly xpub: string;
  readonly coin: Coin;
  readonly networkId: NetworkId;
  readonly scriptType?: ScriptType;
}

export type AccountValidation =
  | {
      ok: true;
      draft: Omit<CounterAccount, 'id' | 'createdAt' | 'staffName' | 'nextIndex'> & {
        readonly preview: readonly DerivedAddress[];
      };
      warnings: readonly string[];
    }
  | { ok: false; error: string };

export function statusOf(account: CounterAccount): AccountStatus {
  return account.acknowledgedAt ? 'ready' : 'unchecked';
}

/** Validates a pasted child xpub into an account draft, with its derivation preview. */
export function validateAccountInput(input: AccountDraft): AccountValidation {
  // The key is parsed FIRST: a pasted seed phrase must be refused loudly even if the
  // name field is also wrong, and the refusal never echoes the material.
  let parsed;
  try {
    parsed = parseExtendedKey(input.xpub);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not read that key' };
  }

  const label = input.label.trim();
  if (label.length < 2) return { ok: false, error: 'give the account a name (at least 2 characters)' };

  const net = networkById(input.networkId);
  if (net.coin !== input.coin) {
    return { ok: false, error: `network ${input.networkId} is not a ${input.coin.toUpperCase()} network` };
  }

  let resolution;
  try {
    resolution = resolveScript(parsed, {
      coin: input.coin,
      networkId: input.networkId,
      isTest: net.isTest,
      ...(input.scriptType ? { scriptType: input.scriptType } : {}),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not resolve the script type' };
  }

  let preview: DerivedAddress[];
  try {
    preview = previewAddresses(parsed, {
      networkId: input.networkId,
      scriptType: resolution.scriptType,
      index: 0,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not derive an address from that key' };
  }

  const warnings = [...resolution.warnings];
  if (parsed.entry?.prefix === 'xpub' && resolution.scriptType === 'p2tr') {
    warnings.push(
      'A bare xpub cannot describe a taproot account: BIP-86 needs a tr() descriptor so the internal key' +
        ' and its tweak come from your wallet. Descriptors arrive in the next phase.',
    );
  }

  const first = preview[0];
  if (!first) return { ok: false, error: 'no address could be derived' };

  return {
    ok: true,
    draft: {
      label,
      xpub: parsed.text,
      coin: input.coin,
      networkId: input.networkId,
      scriptType: resolution.scriptType,
      fingerprintHex: parsed.fingerprintHex,
      prefix: parsed.entry?.prefix ?? 'unregistered',
      firstAddress: first.address,
      acknowledgedAt: null,
      preview,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Storage — a small versioned repository over any key/value store
// ---------------------------------------------------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'slip.accounts.v1';

interface Envelope {
  version: 1;
  accounts: CounterAccount[];
  activeAccountId: string | null;
  currentStaff: string | null;
  pinHash: string | null;
}

const EMPTY: Envelope = {
  version: 1,
  accounts: [],
  activeAccountId: null,
  currentStaff: null,
  pinHash: null,
};

export interface Repository {
  load(): Envelope;
  save(next: Envelope): void;
  addAccount(draft: AccountValidation & { ok: true }): CounterAccount;
  acknowledge(id: string, when?: Date): CounterAccount | undefined;
  setHandoff(id: string, staffName: string): void;
  clearHandoff(): void;
  setPin(pinHash: string | null): void;
  active(): CounterAccount | null;
  currentStaff(): string | null;
  pinHash(): string | null;
}

/** Fallback store for contexts without localStorage (file://, hardened WebViews). */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

export function createRepository(store: KeyValueStore): Repository {
  const read = (): Envelope => {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY, accounts: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<Envelope>;
      if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) return { ...EMPTY, accounts: [] };
      return {
        version: 1,
        accounts: parsed.accounts as CounterAccount[],
        activeAccountId: parsed.activeAccountId ?? null,
        currentStaff: parsed.currentStaff ?? null,
        pinHash: parsed.pinHash ?? null,
      };
    } catch {
      // A corrupt store must not brick the app; start clean and let the caller re-add.
      return { ...EMPTY, accounts: [] };
    }
  };
  const write = (env: Envelope) => store.setItem(STORAGE_KEY, JSON.stringify(env));

  const repo: Repository = {
    load: read,
    save: write,

    addAccount(v) {
      const env = read();
      const account: CounterAccount = {
        id: `acct_${Math.random().toString(36).slice(2, 10)}`,
        label: v.draft.label,
        xpub: v.draft.xpub,
        coin: v.draft.coin,
        networkId: v.draft.networkId,
        scriptType: v.draft.scriptType,
        fingerprintHex: v.draft.fingerprintHex,
        prefix: v.draft.prefix,
        firstAddress: v.draft.firstAddress,
        acknowledgedAt: v.draft.acknowledgedAt,
        createdAt: new Date().toISOString(),
        staffName: null,
        nextIndex: 0,
      };
      write({ ...env, accounts: [...env.accounts, account] });
      return account;
    },

    acknowledge(id, when = new Date()) {
      const env = read();
      let updated: CounterAccount | undefined;
      const accounts = env.accounts.map((a) => {
        if (a.id !== id) return a;
        updated = { ...a, acknowledgedAt: when.toISOString() };
        return updated;
      });
      write({ ...env, accounts });
      return updated;
    },

    setHandoff(id, staffName) {
      const env = read();
      write({
        ...env,
        activeAccountId: id,
        currentStaff: staffName,
        accounts: env.accounts.map((a) => (a.id === id ? { ...a, staffName } : a)),
      });
    },

    clearHandoff() {
      const env = read();
      write({ ...env, activeAccountId: null, currentStaff: null });
    },

    setPin(pinHash) {
      const env = read();
      write({ ...env, pinHash });
    },

    active() {
      const env = read();
      return env.accounts.find((a) => a.id === env.activeAccountId) ?? null;
    },

    currentStaff() {
      return read().currentStaff;
    },

    pinHash() {
      return read().pinHash;
    },
  };

  return repo;
}
