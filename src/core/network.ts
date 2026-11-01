/**
 * Coin/network parameters.
 *
 * Rules this file exists to enforce:
 *  - A network is identified by an explicit id, never inferred from a prefix,
 *    because Signet and Testnet3 (and Testnet4) share identical address
 *    encodings. Pasting a `tb1…` address does not tell you which test net it
 *    belongs to, so the merchant chooses the network and we validate against it.
 *  - Base58 and Bech32 parameters are per-network. Mixing them is a fund-loss
 *    class of bug, so validation always takes a `NetworkId`, never a string.
 *  - SLIP-132 extended-key prefixes live in `keys.ts`, not here, because a prefix
 *    does not uniquely name a coin (zpub/vpub are shared with Litecoin).
 */

export type Coin = 'btc' | 'ltc';

export type NetworkId =
  | 'btc-mainnet'
  | 'btc-signet'
  | 'btc-testnet4'
  | 'btc-testnet3'
  | 'ltc-mainnet'
  | 'ltc-testnet';

export interface NetworkParams {
  readonly id: NetworkId;
  readonly coin: Coin;
  readonly label: string;
  /** true for any chain where coins have no value — drives the orange banner. */
  readonly isTest: boolean;
  /** Base58 version byte for P2PKH addresses. */
  readonly p2pkhVersion: number;
  /** Base58 version byte for P2SH addresses. */
  readonly p2shVersion: number;
  /** Bech32 human-readable part for segwit addresses. */
  readonly bech32Hrp: string;
  /** Base58 version byte for WIF private keys — used only to REJECT them. */
  readonly wifVersion: number;
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkParams>> = {
  'btc-mainnet': {
    id: 'btc-mainnet',
    coin: 'btc',
    label: 'Bitcoin',
    isTest: false,
    p2pkhVersion: 0x00,
    p2shVersion: 0x05,
    bech32Hrp: 'bc',
    wifVersion: 0x80,
  },
  'btc-signet': {
    id: 'btc-signet',
    coin: 'btc',
    label: 'Bitcoin Signet',
    isTest: true,
    p2pkhVersion: 0x6f,
    p2shVersion: 0xc4,
    bech32Hrp: 'tb',
    wifVersion: 0xef,
  },
  'btc-testnet4': {
    id: 'btc-testnet4',
    coin: 'btc',
    label: 'Bitcoin Testnet4',
    isTest: true,
    p2pkhVersion: 0x6f,
    p2shVersion: 0xc4,
    bech32Hrp: 'tb',
    wifVersion: 0xef,
  },
  'btc-testnet3': {
    id: 'btc-testnet3',
    coin: 'btc',
    label: 'Bitcoin Testnet3',
    isTest: true,
    p2pkhVersion: 0x6f,
    p2shVersion: 0xc4,
    bech32Hrp: 'tb',
    wifVersion: 0xef,
  },
  'ltc-mainnet': {
    id: 'ltc-mainnet',
    coin: 'ltc',
    label: 'Litecoin',
    isTest: false,
    p2pkhVersion: 0x30,
    p2shVersion: 0x32,
    bech32Hrp: 'ltc',
    wifVersion: 0xb0,
  },
  'ltc-testnet': {
    id: 'ltc-testnet',
    coin: 'ltc',
    label: 'Litecoin Testnet',
    isTest: true,
    p2pkhVersion: 0x6f,
    p2shVersion: 0x3a,
    // Litecoin Core chainparams.cpp: testnet4 (the only live LTC testnet, testnet3 was deprecated
    // in 0.14.2) uses bech32_hrp "rltc"; "tltc" belonged to the retired testnet3. Deriving tltc1
    // here produced addresses no testnet4 wallet would ever show as its own.
    bech32Hrp: 'rltc',
    wifVersion: 0xef,
  },
};

export const ALL_NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export function networkById(id: NetworkId): NetworkParams {
  return NETWORKS[id];
}

export function networksForCoin(coin: Coin): NetworkParams[] {
  return ALL_NETWORK_IDS.map((id) => NETWORKS[id]).filter((n) => n.coin === coin);
}

/**
 * Dust thresholds in atoms (sats / litoshis), by output script type.
 * Below these an output is non-standard and most nodes will not relay it.
 */
export const DUST_ATOMS = {
  p2pkh: 546,
  p2sh: 540,
  p2wpkh: 294,
  p2tr: 330,
} as const;

export type ScriptType = keyof typeof DUST_ATOMS;

export function dustFor(scriptType: ScriptType): number {
  return DUST_ATOMS[scriptType];
}
