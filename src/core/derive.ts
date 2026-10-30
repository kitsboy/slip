/**
 * Address derivation from a public extended key.
 *
 * This is the money-critical module: a wrong-but-plausible address sends a
 * merchant's sale to an output their wallet never watches. So every script type
 * here is pinned to an official vector (BIP-84, BIP-86) or cross-checked against
 * Bitcoin Core's own `deriveaddresses` — see tests/derive.test.ts.
 *
 * Only non-hardened derivation is possible from a public key, which is the whole
 * point: if a requested path needs a hardened step, that path must come from the
 * merchant's wallet, never from slip.
 */

import {
  NETWORK,
  TEST_NETWORK,
  p2ms,
  p2pkh,
  p2sh,
  p2tr,
  p2wpkh,
  p2wsh,
} from '@scure/btc-signer';
import type { HDKey } from '@scure/bip32';
import { networkById, type NetworkId } from './network';
import type { ParsedExtendedKey, ScriptType } from './keys';

export interface SlipNetwork {
  readonly bech32: string;
  readonly pubKeyHash: number;
  readonly scriptHash: number;
  readonly wif: number;
}

/** Bitcoin mainnet/testnet come from the library; LTC is parameterised by us. */
export function slipNetwork(id: NetworkId): SlipNetwork {
  const n = networkById(id);
  if (n.coin === 'btc' && !n.isTest) return NETWORK;
  if (n.coin === 'btc') return TEST_NETWORK;
  return {
    bech32: n.bech32Hrp,
    pubKeyHash: n.p2pkhVersion,
    scriptHash: n.p2shVersion,
    wif: n.wifVersion,
  };
}

export interface DerivedAddress {
  readonly address: string;
  readonly path: string;
  readonly publicKey: Uint8Array;
  readonly scriptType: ScriptType;
}

export interface DeriveOptions {
  readonly networkId: NetworkId;
  readonly scriptType: ScriptType;
  /** 0 = receive chain, 1 = change chain. */
  readonly change?: 0 | 1;
  readonly index: number;
}

/** Derives one non-hardened child and encodes it for the requested script type. */
export function deriveAddress(key: ParsedExtendedKey, opts: DeriveOptions): DerivedAddress {
  if (!Number.isInteger(opts.index) || opts.index < 0 || opts.index >= 0x80000000) {
    throw new Error(`invalid derivation index: ${opts.index}`);
  }
  const change = opts.change ?? 0;
  const net = slipNetwork(opts.networkId);

  // Two non-hardened steps: /change/index. HDKey.derive() handles the hardened
  // guard for us and throws if the node cannot derive.
  const changeNode = key.node.deriveChild(change);
  const child = changeNode.deriveChild(opts.index);
  const pub = child.publicKey;
  if (!pub) throw new Error('derivation produced no public key');

  return {
    address: encodeAddress(pub, opts.scriptType, net),
    path: `${change}/${opts.index}`,
    publicKey: pub,
    scriptType: opts.scriptType,
  };
}

export function encodeAddress(
  pubkey: Uint8Array,
  scriptType: ScriptType,
  net: SlipNetwork,
): string {
  switch (scriptType) {
    case 'p2pkh':
      return requireAddress(p2pkh(pubkey, net));
    case 'p2wpkh':
      return requireAddress(p2wpkh(pubkey, net));
    case 'p2sh-p2wpkh':
      return requireAddress(p2sh(p2wpkh(pubkey, net), net));
    case 'p2tr': {
      // Taproot internal keys are x-only (BIP-340), so drop the 33-byte parity byte.
      // The BIP-341 tweak is applied by the library.
      const xOnly = pubkey.length === 33 ? pubkey.slice(1) : pubkey;
      if (xOnly.length !== 32) throw new Error('taproot needs a 32-byte x-only key');
      return requireAddress(p2tr(xOnly, undefined, net));
    }
    default: {
      const never: never = scriptType;
      throw new Error(`unsupported script type: ${String(never)}`);
    }
  }
}

function requireAddress(out: { address?: string }): string {
  if (!out.address) throw new Error('encoder produced no address');
  return out.address;
}

/** The first N receiving addresses — the derivation-preview gate feeds on this. */
export function previewAddresses(
  key: ParsedExtendedKey,
  opts: DeriveOptions,
  count = 5,
): DerivedAddress[] {
  const out: DerivedAddress[] = [];
  for (let i = 0; i < count; i++) out.push(deriveAddress(key, { ...opts, index: opts.index + i }));
  return out;
}

/**
 * BIP-86 key-path-only taproot is the only taproot shape v1 accepts from a plain
 * extended key. A script-path descriptor must arrive as a descriptor so the tree
 * (and its tweak) comes from the merchant, not from our guess.
 */
export function assertTaprootSupported(key: ParsedExtendedKey, scriptType: ScriptType): void {
  if (scriptType !== 'p2tr') return;
  if (!key.entry) {
    throw new Error(
      'taproot needs a descriptor (tr(...)), not a bare extended key: the internal key and its tweak must come from your wallet.',
    );
  }
}

// ---------------------------------------------------------------------------
// Multisig (sortedmulti) — assembled here because the library has no helper.
// ---------------------------------------------------------------------------

/**
 * `wsh(sortedmulti(m, key…))` — keys sorted lexicographically by their compressed
 * bytes, exactly as BIP-67 requires, so the script (and therefore the address)
 * matches whatever wallet built the descriptor.
 */
export function sortedMultiWsh(
  pubkeys: readonly Uint8Array[],
  threshold: number,
  net: SlipNetwork,
): string {
  if (threshold < 1 || threshold > pubkeys.length) {
    throw new Error(`threshold ${threshold} outside 1..${pubkeys.length}`);
  }
  const sorted = [...pubkeys].sort(compareBytes);
  // p2ms builds OP_m <key…> OP_n OP_CHECKMULTISIG; p2wsh hashes it into the witness
  // program. We own only the BIP-67 ordering, which is what sortedmulti adds.
  return requireAddress(p2wsh(p2ms(threshold, sorted), net));
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export type { HDKey };
