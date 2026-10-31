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
import { parseDescriptor, type DescriptorScriptType } from './descriptors';
import { encodeAddress, slipNetwork } from './derive';
import { checkAddress } from './addresses';
import { appendEvent, emptyLog, type ShiftEventKind, type ShiftLog } from './shifts';

export type AccountStatus = 'unchecked' | 'ready';

/**
 * What a wallet is for. Purely local labelling — slip never infers it, and it changes
 * nothing about how addresses are derived. It exists so a person holding four wallets can
 * tell them apart at a glance instead of re-reading xpubs.
 */
export type AccountPurpose = 'till' | 'work' | 'family' | 'personal' | 'other';

export const ACCOUNT_PURPOSES: ReadonlyArray<{ id: AccountPurpose; label: string }> = [
  { id: 'till', label: 'Till / shop counter' },
  { id: 'work', label: 'Work (from my employer)' },
  { id: 'family', label: 'Family (parents, joint)' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
];

/** A fixed palette rather than a colour picker: eight legible choices beat infinite bad ones. */
export type WalletColour =
  | 'orange'
  | 'blue'
  | 'green'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'amber'
  | 'slate';

export const WALLET_COLOURS: ReadonlyArray<{ id: WalletColour; label: string; hex: string }> = [
  { id: 'orange', label: 'Orange', hex: '#f7931a' },
  { id: 'blue', label: 'Blue', hex: '#4c8dff' },
  { id: 'green', label: 'Green', hex: '#34c77b' },
  { id: 'purple', label: 'Purple', hex: '#a374ff' },
  { id: 'pink', label: 'Pink', hex: '#ef6ea8' },
  { id: 'teal', label: 'Teal', hex: '#2ec5c0' },
  { id: 'amber', label: 'Amber', hex: '#e6a700' },
  { id: 'slate', label: 'Slate', hex: '#8b98a5' },
];

export function colourHex(colour: WalletColour): string {
  return WALLET_COLOURS.find((c) => c.id === colour)?.hex ?? '#8b98a5';
}

export function purposeLabel(purpose: AccountPurpose): string {
  return ACCOUNT_PURPOSES.find((p) => p.id === purpose)?.label ?? 'Other';
}

export interface CounterAccount {
  readonly id: string;
  readonly label: string;
  readonly xpub: string;
  readonly coin: Coin;
  readonly networkId: NetworkId;
  /** Wider than ScriptType: a descriptor can also describe wsh(sortedmulti(…)). */
  readonly scriptType: DescriptorScriptType;
  /**
   * How the material arrived: an extended key, a BIP-380 descriptor, a single public key
   * (one address, not a chain), or a plain address.
   */
  readonly source: 'xpub' | 'descriptor' | 'pubkey' | 'address';
  /** Local labelling only — never derived, never sent anywhere. */
  readonly colour: WalletColour;
  readonly purpose: AccountPurpose;
  /** Free text the owner attaches, e.g. "mum's rent account". */
  readonly note: string;
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
  /** The pasted material: xpub, descriptor, raw public key, or address. */
  readonly xpub: string;
  readonly coin: Coin;
  readonly networkId: NetworkId;
  readonly scriptType?: ScriptType;
  readonly colour?: WalletColour;
  readonly purpose?: AccountPurpose;
  readonly note?: string;
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

/** True when the pasted text is an output descriptor rather than a bare extended key. */
export function looksLikeDescriptor(raw: string): boolean {
  return /^\s*(wpkh|pkh|sh|tr|wsh|sortedmulti)\s*\(/i.test(raw);
}

/** Colour/purpose/note defaults, so every path produces a complete account. */
function labelling(input: AccountDraft): { colour: WalletColour; purpose: AccountPurpose; note: string } {
  return {
    colour: input.colour ?? 'orange',
    purpose: input.purpose ?? 'till',
    note: (input.note ?? '').slice(0, 120),
  };
}

/**
 * Validates pasted wallet material — a BIP-380 descriptor, a bare SLIP-132 xpub, a single
 * public key, or a plain address — into an account draft with its derivation preview.
 */
export function validateAccountInput(input: AccountDraft): AccountValidation {
  if (looksLikeDescriptor(input.xpub)) return validateDescriptorAccount(input);

  const raw = input.xpub.trim();
  if (/^[0-9a-fA-F]{66}$/.test(raw)) return validatePubkeyAccount(input, raw);
  if (looksLikeAddress(raw)) return validateAddressAccount(input, raw);

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
      source: 'xpub',
      fingerprintHex: parsed.fingerprintHex,
      prefix: parsed.entry?.prefix ?? 'unregistered',
      firstAddress: first.address,
      acknowledgedAt: null,
      preview,
      ...labelling(input),
    },
    warnings,
  };
}

/** A base58 or bech32 address, as opposed to key material. */
function looksLikeAddress(raw: string): boolean {
  return /^(bc1|tb1|bcrt1|ltc1|tltc1|[13mn2LMQ])[a-zA-Z0-9]{20,}$/.test(raw);
}

/**
 * A single public key. It has exactly one address, so there is no index to reserve and no
 * chain to walk — the honest label is "one address", not "a wallet".
 */
function validatePubkeyAccount(input: AccountDraft, hex: string): AccountValidation {
  const label = input.label.trim();
  if (label.length < 2) return { ok: false, error: 'give the wallet a name (at least 2 characters)' };

  const net = networkById(input.networkId);
  if (net.coin !== input.coin) {
    return { ok: false, error: `network ${input.networkId} is not a ${input.coin.toUpperCase()} network` };
  }

  const pubkey = hexToBytes(hex);
  if (pubkey[0] !== 0x02 && pubkey[0] !== 0x03) {
    return { ok: false, error: 'that is not a compressed public key (it must start with 02 or 03)' };
  }

  const scriptType = input.scriptType ?? 'p2wpkh';
  let address: string;
  try {
    address = encodeAddress(pubkey, scriptType, slipNetwork(input.networkId));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not encode an address from that key' };
  }

  return {
    ok: true,
    draft: {
      label,
      xpub: raw_hex(hex),
      coin: input.coin,
      networkId: input.networkId,
      scriptType,
      source: 'pubkey',
      fingerprintHex: '--------',
      prefix: 'pubkey',
      firstAddress: address,
      acknowledgedAt: null,
      preview: [
        { address, path: 'single', publicKey: pubkey, scriptType: scriptType === 'p2tr' ? 'p2tr' : scriptType },
      ],
      ...labelling(input),
    },
    warnings: [
      'A single public key has exactly ONE address. It cannot be rotated, so every payment to it is publicly linked — fine for a savings address, wrong for a till.',
    ],
  };
}

/**
 * A plain address. Nothing to derive, nothing to index: slip can only watch it.
 */
function validateAddressAccount(input: AccountDraft, address: string): AccountValidation {
  const label = input.label.trim();
  if (label.length < 2) return { ok: false, error: 'give the wallet a name (at least 2 characters)' };

  const net = networkById(input.networkId);
  if (net.coin !== input.coin) {
    return { ok: false, error: `network ${input.networkId} is not a ${input.coin.toUpperCase()} network` };
  }

  const check = checkAddress(address, input.networkId);
  if (!check.ok) return { ok: false, error: check.problem ?? 'that address does not belong to this network' };

  const scriptType = check.scriptType ?? 'p2wpkh';
  return {
    ok: true,
    draft: {
      label,
      xpub: address,
      coin: input.coin,
      networkId: input.networkId,
      scriptType,
      source: 'address',
      fingerprintHex: '--------',
      prefix: 'address',
      firstAddress: address,
      acknowledgedAt: null,
      preview: [{ address, path: 'single', publicKey: new Uint8Array(0), scriptType }],
      ...labelling(input),
    },
    warnings: [
      ...check.warnings,
      'A fixed address cannot be rotated, so payments to it are publicly linkable. Use it for a specific deposit, not as a permanent till.',
    ],
  };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function raw_hex(hex: string): string {
  return hex.toLowerCase();
}

function validateDescriptorAccount(input: AccountDraft): AccountValidation {
  const label = input.label.trim();
  const descriptor = parseDescriptor(input.xpub, input.networkId);

  if (!descriptor.ok) {
    // `parseDescriptor` refuses secrets itself; the message names the kind only.
    return { ok: false, error: descriptor.error };
  }
  if (label.length < 2) return { ok: false, error: 'give the account a name (at least 2 characters)' };

  const net = networkById(input.networkId);
  if (net.coin !== input.coin) {
    return { ok: false, error: `network ${input.networkId} is not a ${input.coin.toUpperCase()} network` };
  }

  let preview: DerivedAddress[];
  try {
    // A fixed (non-wildcard) descriptor returns the same address for every index; label it
    // honestly instead of implying a derivation path that does not exist.
    const isWildcard = descriptor.descriptor.receive(0) !== descriptor.descriptor.receive(1);
    preview = [0, 1, 2, 3, 4].map((index) => ({
      address: descriptor.descriptor.receive(index),
      path: isWildcard ? `0/${index}` : 'fixed',
      publicKey: new Uint8Array(0),
      scriptType: descriptor.descriptor.scriptType === 'wsh-sortedmulti'
        ? 'p2wpkh'
        : descriptor.descriptor.scriptType,
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not derive from that descriptor' };
  }

  const first = preview[0];
  if (!first) return { ok: false, error: 'no address could be derived' };

  const warnings: string[] = [];
  if (!descriptor.descriptor.checksum) {
    warnings.push(
      'This descriptor has no #checksum. It still works, but a checksum catches typos — most wallets include one.',
    );
  }
  if (descriptor.descriptor.scriptType === 'wsh-sortedmulti') {
    warnings.push(
      'Multisig: every cosigner key in this descriptor is public and stored on this device. That reveals the wallet\'s policy, not its funds.',
    );
  }

  return {
    ok: true,
    draft: {
      label,
      xpub: input.xpub.trim(),
      coin: input.coin,
      networkId: input.networkId,
      scriptType: descriptor.descriptor.scriptType,
      source: 'descriptor',
      fingerprintHex: descriptor.descriptor.keys[0]?.fingerprintHex ?? '--------',
      prefix: 'descriptor',
      firstAddress: first.address,
      acknowledgedAt: null,
      preview,
      ...labelling(input),
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
export const SHIFT_STORAGE_KEY = 'slip.shifts.v1';

export interface Envelope {
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
  /** The tamper-evident shift log, and a way to append to it. */
  shifts(): ShiftLog;
  recordShift(kind: ShiftEventKind, account: CounterAccount | null, staff: string | null, detail?: string): Promise<ShiftLog>;
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
      // Migrate records written before colour/purpose existed: an account that appears
      // without a colour renders as a grey blob the owner cannot tell apart from its
      // neighbours, which defeats the point of labelling.
      const migrated = (parsed.accounts as Array<Partial<CounterAccount>>).map((a, i) => ({
        ...a,
        colour: a.colour ?? WALLET_COLOURS[i % WALLET_COLOURS.length]!.id,
        purpose: a.purpose ?? 'till',
        note: a.note ?? '',
      })) as CounterAccount[];
      return {
        version: 1,
        accounts: migrated,
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
        source: v.draft.source,
        fingerprintHex: v.draft.fingerprintHex,
        prefix: v.draft.prefix,
        firstAddress: v.draft.firstAddress,
        acknowledgedAt: v.draft.acknowledgedAt,
        createdAt: new Date().toISOString(),
        staffName: null,
        nextIndex: 0,
        colour: v.draft.colour,
        purpose: v.draft.purpose,
        note: v.draft.note,
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

    shifts() {
      const raw = store.getItem(SHIFT_STORAGE_KEY);
      if (!raw) return emptyLog();
      try {
        const parsed = JSON.parse(raw) as ShiftLog;
        return parsed && parsed.version === 1 && Array.isArray(parsed.events) ? parsed : emptyLog();
      } catch {
        // A corrupt log must not brick the till; start a fresh chain and let it be visible.
        return emptyLog();
      }
    },

    async recordShift(kind, account, staff, detail) {
      const next = await appendEvent(repo.shifts(), {
        kind,
        accountId: account?.id ?? null,
        accountLabel: account?.label ?? null,
        staff,
        ...(detail ? { detail } : {}),
      });
      store.setItem(SHIFT_STORAGE_KEY, JSON.stringify(next));
      return next;
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
