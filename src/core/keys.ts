/**
 * Extended-key parsing, SLIP-132 prefix resolution, and secret refusal.
 *
 * Ground truth for the version-byte table is SLIP-0132 (fetched, not remembered):
 * https://github.com/satoshilabs/slips/blob/master/slip-0132.md
 *
 * Three facts that shape this file:
 *  1. `Ltub`/`ttub` are registered as "P2PKH **or** P2SH" — a prefix does not
 *     uniquely name a script type. It is a *suggestion* the merchant confirms.
 *  2. Litecoin native segwit has **no registered prefix**. LTC wallets reuse
 *     Bitcoin's `zpub` (0x04b24746) and `vpub` (0x045f1cf6), so those prefixes are
 *     **coin-ambiguous**: the same key legitimately produces `bc1…` or `ltc1…`
 *     depending on the coin the merchant selected. Never infer the coin here.
 *  3. A private key can arrive wearing any of these prefixes. Version bytes are
 *     checked against a refusal table *as well as* the payload's leading byte,
 *     because a user pasting an `xprv` is the exact scenario this product must
 *     survive without ever storing or echoing it.
 */

import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { HDKey } from '@scure/bip32';
import type { Coin, NetworkId } from './network';

const b58c = base58check(sha256);

// ---------------------------------------------------------------------------
// Secret refusal
// ---------------------------------------------------------------------------

export type SecretKind =
  | 'seed phrase'
  | 'extended private key'
  | 'WIF private key'
  | 'hex private key';

/**
 * Thrown instead of accepting dangerous input. The message names the KIND and
 * never repeats the matched material — a refusal that echoes the secret has just
 * written the secret into a log.
 */
export class SecretRefused extends Error {
  readonly kind: SecretKind;
  constructor(kind: SecretKind) {
    super(
      kind === 'seed phrase'
        ? 'refused: that is a recovery phrase. slip never accepts seed words — paste your account xpub instead.'
        : `refused: that is a private key (${kind}). slip can only watch; paste your account xpub, descriptor or address instead.`,
    );
    this.name = 'SecretRefused';
    this.kind = kind;
  }
}

const PRIVATE_KEY_PREFIXES = new Set([
  // SLIP-0132 private counterparts
  'xprv', 'yprv', 'zprv', 'Yprv', 'Zprv',
  'tprv', 'uprv', 'vprv', 'Uprv', 'Vprv',
  'Ltpv', 'Mtpv', 'ttpv',
]);

/** 12/15/18/21/24 lowercase words — cheap, ordered before any "free text" path. */
function looksLikeMnemonic(t: string): boolean {
  const words = t.trim().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) return false;
  // Any 12/15/18/21/24 lowercase words is treated as a phrase. Deliberately
  // over-refuse: this runs on key-material inputs only, and refusing a harmless
  // sentence costs the merchant a retry, while accepting a phrase loses their money.
  return words.every((w) => /^[a-z]{3,8}$/.test(w));
}

function looksLikeWif(t: string): boolean {
  if (!/^[5KL9c][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(t)) return false;
  try {
    const payload = b58c.decode(t);
    if (payload.length !== 33 && payload.length !== 34) return false;
    const version = payload[0];
    // 0x80 mainnet, 0xef testnet: the only two WIF versions for BTC/LTC.
    return version === 0x80 || version === 0xef;
  } catch {
    return false;
  }
}

function looksLikeHex32(t: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(t.trim());
}

/** Names the input and refuses anything that could spend. Never echoes content. */
export function assertNotSecret(raw: string): void {
  const t = raw.trim();
  if (!t) return;
  if (looksLikeMnemonic(t)) throw new SecretRefused('seed phrase');
  const prefix = t.slice(0, 4);
  if (PRIVATE_KEY_PREFIXES.has(prefix)) throw new SecretRefused('extended private key');
  if (looksLikeWif(t)) throw new SecretRefused('WIF private key');
  if (looksLikeHex32(t)) throw new SecretRefused('hex private key');
}

// ---------------------------------------------------------------------------
// SLIP-132 public prefixes
// ---------------------------------------------------------------------------

export type PrefixFamily = 'main' | 'test';

export interface PrefixEntry {
  readonly prefix: string;
  readonly version: number;
  /** SLIP-132 private counterpart — needed so the parser can reject it too. */
  readonly privateVersion: number;
  readonly family: PrefixFamily;
  /**
   * Coins this prefix can legitimately belong to. More than one means the
   * merchant must choose: `zpub` is both Bitcoin and Litecoin.
   */
  readonly coins: readonly Coin[];
  /** Suggested script type. `null` when the prefix is genuinely ambiguous. */
  readonly suggestedScript: ScriptType | null;
  readonly note?: string;
}

export type ScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr';

export const PREFIXES: readonly PrefixEntry[] = [
  // --- Bitcoin mainnet -----------------------------------------------------
  { prefix: 'xpub', version: 0x0488b21e, privateVersion: 0x0488ade4, family: 'main', coins: ['btc'], suggestedScript: 'p2pkh', note: 'BIP-44 legacy (or BIP-49 nested — confirm the script type)' },
  { prefix: 'ypub', version: 0x049d7cb2, privateVersion: 0x049d7878, family: 'main', coins: ['btc'], suggestedScript: 'p2sh-p2wpkh' },
  { prefix: 'zpub', version: 0x04b24746, privateVersion: 0x04b2430c, family: 'main', coins: ['btc', 'ltc'], suggestedScript: 'p2wpkh', note: 'Litecoin reuses this prefix for native segwit; the coin must be chosen' },
  // --- Bitcoin test networks ----------------------------------------------
  { prefix: 'tpub', version: 0x043587cf, privateVersion: 0x04358394, family: 'test', coins: ['btc'], suggestedScript: 'p2pkh' },
  { prefix: 'upub', version: 0x044a5262, privateVersion: 0x044a4e28, family: 'test', coins: ['btc'], suggestedScript: 'p2sh-p2wpkh' },
  { prefix: 'vpub', version: 0x045f1cf6, privateVersion: 0x045f18bc, family: 'test', coins: ['btc', 'ltc'], suggestedScript: 'p2wpkh', note: 'shared by Bitcoin testnets and Litecoin testnet' },
  // --- Litecoin mainnet ---------------------------------------------------
  { prefix: 'Ltub', version: 0x019da462, privateVersion: 0x019d9cfe, family: 'main', coins: ['ltc'], suggestedScript: 'p2pkh', note: 'SLIP-132 registers this as P2PKH *or* P2SH' },
  { prefix: 'Mtub', version: 0x01b26ef6, privateVersion: 0x01b26792, family: 'main', coins: ['ltc'], suggestedScript: 'p2sh-p2wpkh' },
  // --- Litecoin testnet ---------------------------------------------------
  { prefix: 'ttub', version: 0x0436f6e1, privateVersion: 0x0436ef7d, family: 'test', coins: ['ltc'], suggestedScript: 'p2pkh', note: 'SLIP-132 registers this as P2PKH *or* P2SH' },
];

const BY_VERSION = new Map<number, PrefixEntry>(PREFIXES.map((p) => [p.version, p]));
const BY_PREFIX = new Map<string, PrefixEntry>(PREFIXES.map((p) => [p.prefix, p]));

export function prefixByVersion(v: number): PrefixEntry | undefined {
  return BY_VERSION.get(v);
}
export function prefixByName(p: string): PrefixEntry | undefined {
  return BY_PREFIX.get(p);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedExtendedKey {
  /** Matched SLIP-132 entry, if the prefix is registered. */
  readonly entry: PrefixEntry | null;
  /** The base58 text as supplied (public material — safe to keep). */
  readonly text: string;
  readonly version: number;
  readonly depth: number;
  readonly parentFingerprint: number;
  readonly childNumber: number;
  readonly chainCode: Uint8Array;
  readonly publicKey: Uint8Array;
  /** 4-byte account fingerprint as hex, when the key carries one. */
  readonly fingerprintHex: string;
  /** The parsed HD node, ready to derive non-hardened children. */
  readonly node: HDKey;
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

/**
 * Parses a public extended key. Throws `SecretRefused` for anything private and
 * a plain `Error` for anything malformed — the two are deliberately different.
 */
export function parseExtendedKey(raw: string): ParsedExtendedKey {
  assertNotSecret(raw);
  const text = raw.trim();

  let payload: Uint8Array;
  try {
    payload = b58c.decode(text);
  } catch {
    throw new Error('not a valid extended key: the characters or checksum do not match');
  }
  if (payload.length !== 78) {
    throw new Error('not a valid extended key: wrong length');
  }

  const version = readU32(payload, 0);
  const entry = BY_VERSION.get(version) ?? null;

  // Defence in depth: a private extended key's key field starts with 0x00.
  if (payload[45] === 0x00) throw new SecretRefused('extended private key');

  const keyBytes = payload.slice(45, 78);
  if (keyBytes[0] !== 0x02 && keyBytes[0] !== 0x03) {
    throw new Error('not a valid extended public key: the key field is not a compressed point');
  }

  const versions = entry
    ? { public: entry.version, private: entry.privateVersion }
    : undefined;

  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(text, versions);
  } catch (e) {
    throw new Error(
      `not a valid extended key: ${e instanceof Error ? e.message : 'unrecognised version bytes'}`,
    );
  }

  const parentFingerprint = readU32(payload, 5);

  return {
    entry,
    text,
    version,
    depth: payload[4]!,
    parentFingerprint,
    childNumber: readU32(payload, 9),
    chainCode: payload.slice(13, 45),
    publicKey: keyBytes,
    fingerprintHex: parentFingerprint.toString(16).padStart(8, '0'),
    node,
  };
}

export interface ScriptResolution {
  readonly scriptType: ScriptType;
  readonly coin: Coin | null;
  readonly networkId: NetworkId | null;
  readonly warnings: readonly string[];
}

/**
 * Turns a parsed key plus the merchant's chosen network into a script type,
 * raising every ambiguity that a human must resolve rather than guessing.
 */
export function resolveScript(
  parsed: ParsedExtendedKey,
  chosen: { coin: Coin; networkId: NetworkId; isTest: boolean; scriptType?: ScriptType },
): ScriptResolution {
  const warnings: string[] = [];
  const entry = parsed.entry;

  if (!entry) {
    warnings.push(
      'This key uses version bytes slip does not recognise. Confirm the script type and check address #0 matches your wallet.',
    );
  } else {
    const familyMatches = entry.family === 'test' ? chosen.isTest : !chosen.isTest;
    if (!familyMatches) {
      warnings.push(
        `This key is a ${entry.family === 'test' ? 'test-network' : 'mainnet'} key but the selected network is ${chosen.networkId}. Addresses derived here would not be spendable by that wallet.`,
      );
    }
    if (!entry.coins.includes(chosen.coin)) {
      warnings.push(
        `This prefix (${entry.prefix}) belongs to ${entry.coins.join('/')}, not ${chosen.coin.toUpperCase()}.`,
      );
    }
    if (entry.coins.length > 1) {
      warnings.push(
        `The ${entry.prefix} prefix is shared between ${entry.coins
          .map((c) => c.toUpperCase())
          .join(' and ')}, so the coin cannot be inferred from the key alone.`,
      );
    }
  }

  const scriptType = chosen.scriptType ?? entry?.suggestedScript ?? null;
  if (!scriptType) {
    throw new Error(
      'script type unknown for this key — choose p2pkh, p2sh-p2wpkh, p2wpkh or p2tr explicitly',
    );
  }

  if (parsed.depth !== 3 && (scriptType === 'p2wpkh' || scriptType === 'p2sh-p2wpkh' || scriptType === 'p2pkh')) {
    warnings.push(
      `This key sits at depth ${parsed.depth}, not 3 (an account-level key). If it is a master or root key the derived addresses will not match your wallet.`,
    );
  }

  return {
    scriptType,
    coin: entry && entry.coins.length === 1 ? entry.coins[0]! : null,
    networkId: chosen.networkId,
    warnings,
  };
}
