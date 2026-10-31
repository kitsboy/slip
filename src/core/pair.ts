/**
 * Moving a wallet to another device by QR.
 *
 * A wallet in slip is PUBLIC material — an xpub, a descriptor, a public key, an address. So
 * "pairing" is not a secret transfer and needs no encryption, no handshake and no server: it
 * is the same thing you would write on a piece of paper for a colleague.
 *
 * The one rule: importing NEVER marks a wallet checked. The receiving device has not compared
 * address 0/0 against the owner's wallet, and pretending otherwise is exactly the mistake the
 * whole app is built to avoid. The import screen says "unchecked" until a human looks.
 */

import { detectNetworks } from './addresses';
import type { AccountPurpose, WalletColour } from './accounts';
import { ALL_NETWORK_IDS, networkById, type Coin, type NetworkId } from './network';
import { assertNotSecret, type ScriptType } from './keys';

export const PAIR_PREFIX = 'SLIP-WALLET-1';
const FIELDS = 7;

export interface PairedWallet {
  readonly label: string;
  readonly material: string;
  readonly coin: Coin;
  readonly networkId: NetworkId;
  readonly source: 'xpub' | 'descriptor' | 'pubkey' | 'address';
  readonly scriptType: ScriptType;
  readonly colour?: WalletColour;
  readonly purpose?: AccountPurpose;
}

const SAFE_LABEL = /^[^|\r\n]{2,40}$/;

export function pairCode(wallet: PairedWallet): string {
  // Refuse to encode a secret even if a caller hands us one: a QR is the most copyable thing
  // in the app, and a private key that reaches one is a private key published.
  assertNotSecret(wallet.material);
  if (!SAFE_LABEL.test(wallet.label)) throw new Error('pair: the label cannot contain "|" or a newline');
  const [user, domain] = wallet.material.split('@');
  void user;
  void domain;
  return [
    PAIR_PREFIX,
    wallet.label,
    wallet.coin,
    wallet.networkId,
    wallet.source,
    wallet.scriptType,
    wallet.material.trim(),
  ].join('|');
}

export function readPairCode(text: string): { ok: true; wallet: PairedWallet } | { ok: false; error: string } {
  const raw = (text ?? '').trim();
  if (!raw.startsWith(PAIR_PREFIX + '|')) {
    return { ok: false, error: 'that is not a slip wallet code' };
  }
  const parts = raw.split('|');
  if (parts.length !== FIELDS) return { ok: false, error: 'wallet code is incomplete — copy the whole thing' };

  const [, label, coin, networkId, source, scriptType, material] = parts as [
    string, string, string, string, string, string, string,
  ];

  try {
    assertNotSecret(material);
  } catch {
    // Never echo the material: the refusal is the message.
    return { ok: false, error: 'that code contains private material — slip will not import it' };
  }

  if (!SAFE_LABEL.test(label)) return { ok: false, error: 'wallet label in that code is malformed' };
  if (coin !== 'btc' && coin !== 'ltc') return { ok: false, error: `unsupported coin "${coin}"` };
  if (!['xpub', 'descriptor', 'pubkey', 'address'].includes(source)) {
    return { ok: false, error: `unsupported wallet type "${source}"` };
  }
  if (!['p2wpkh', 'p2sh-p2wpkh', 'p2pkh', 'p2tr', 'wsh-sortedmulti'].includes(scriptType)) {
    return { ok: false, error: `unsupported script type "${scriptType}"` };
  }
  // A code is a claim about a network; an unknown one must be refused rather than trusted,
  // because "close enough" here means deriving addresses for the wrong chain.
  if (!ALL_NETWORK_IDS.includes(networkId as NetworkId)) {
    return { ok: false, error: `unknown network "${networkId}"` };
  }
  if (networkById(networkId as NetworkId).coin !== coin) {
    return { ok: false, error: `network ${networkId} is not a ${coin.toUpperCase()} network` };
  }

  const looksRight =
    source === 'address'
      ? detectNetworks(material).scriptType !== null
      : source === 'pubkey'
        ? /^[0-9a-fA-F]{66}$/.test(material)
        : material.length >= 8;

  if (!looksRight) return { ok: false, error: `the ${source} in that code does not look valid` };

  return {
    ok: true,
    wallet: {
      label,
      material,
      coin: coin as Coin,
      networkId: networkId as NetworkId,
      source: source as PairedWallet['source'],
      scriptType: scriptType as ScriptType,
    },
  };
}
