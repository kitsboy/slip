/**
 * Address validation and network detection.
 *
 * The failure this prevents: a merchant (or a staff member taking over the till)
 * pastes an address from the wrong chain, or slip shows a receive address for a
 * network the wallet does not watch. Both look identical to a working screen.
 *
 * Signet, Testnet3 and Testnet4 share byte-identical encodings, so detection can
 * never *choose* between them — it reports the family and says so.
 */

import { Address } from '@scure/btc-signer';
import { ALL_NETWORK_IDS, networkById, type NetworkId } from './network';
import { slipNetwork } from './derive';
import type { ScriptType } from './keys';

export interface AddressCheck {
  readonly ok: boolean;
  readonly address: string;
  /** Every network whose encoding accepts this address. More than one = ambiguous. */
  readonly networks: readonly NetworkId[];
  readonly scriptType: ScriptType | null;
  readonly problem?: string;
  readonly warnings: readonly string[];
}

const SCRIPT_BY_ADDRESS_TYPE: Record<string, ScriptType | null> = {
  pkh: 'p2pkh',
  wpkh: 'p2wpkh',
  sh: 'p2sh-p2wpkh',
  tr: 'p2tr',
  wsh: null,
};

/** Every network that can decode this address, with its script type. */
export function detectNetworks(address: string): { networks: NetworkId[]; scriptType: ScriptType | null } {
  const text = address.trim();
  const networks: NetworkId[] = [];
  let scriptType: ScriptType | null = null;

  for (const id of ALL_NETWORK_IDS) {
    try {
      // Throws when the encoding does not belong to this network's parameters.
      const decoded = Address(slipNetwork(id)).decode(text) as { type?: string } | undefined;
      networks.push(id);
      if (!scriptType && decoded?.type) scriptType = SCRIPT_BY_ADDRESS_TYPE[decoded.type] ?? null;
    } catch {
      /* not this network's encoding */
    }
  }
  return { networks, scriptType };
}

/**
 * True when the address is valid for the chosen network. `strict` also warns when the
 * address is valid on several networks (all test nets share `tb1…`).
 */
export function checkAddress(address: string, networkId: NetworkId): AddressCheck {
  const text = address.trim();
  if (!text) {
    return { ok: false, address: text, networks: [], scriptType: null, problem: 'empty address', warnings: [] };
  }

  const { networks, scriptType } = detectNetworks(text);
  if (networks.length === 0) {
    return {
      ok: false,
      address: text,
      networks: [],
      scriptType: null,
      problem: 'not a valid Bitcoin or Litecoin address (checksum or length is wrong)',
      warnings: [],
    };
  }

  const target = networkById(networkId);
  const warnings: string[] = [];

  if (!networks.includes(networkId)) {
    const names = networks.map((n) => networkById(n).label).join(' or ');
    return {
      ok: false,
      address: text,
      networks,
      scriptType,
      problem: `this address belongs to ${names}, not ${target.label}`,
      warnings,
    };
  }

  const compatible = networks.filter((n) => networkById(n).coin === target.coin);
  if (compatible.length > 1) {
    warnings.push(
      `Several ${target.isTest ? 'test networks' : 'networks'} share this encoding (${compatible
        .map((n) => networkById(n).label)
        .join(', ')}). The address is valid for ${target.label}, but nothing in it proves which one it is.`,
    );
  }

  return { ok: true, address: text, networks, scriptType, warnings };
}
