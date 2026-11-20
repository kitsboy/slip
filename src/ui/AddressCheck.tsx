import { c0, c4, c9, c22, c36, c37 } from './classes';
/**
 * Address check — "is this address actually for the network I am ringing into?"
 *
 * Cheap, and it closes a fund-loss class: an address can be perfectly valid and still
 * be for the wrong chain. slip says which networks accept it, and refuses the ones that
 * do not, instead of showing a friendly green tick that means nothing.
 */

import { useMemo, useState } from 'react';
import { ALL_NETWORK_IDS, networkById, type NetworkId } from '../core/network';
import { checkAddress } from '../core/addresses';

export default function AddressCheck() {
  const [address, setAddress] = useState('');
  const [networkId, setNetworkId] = useState<NetworkId>('btc-mainnet');

  const result = useMemo(() => {
    if (!address.trim()) return null;
    return checkAddress(address, networkId);
  }, [address, networkId]);

  return (
    <section className="mt-6 panel lg:mt-0">
      <h2 className="panel-title">Check an address</h2>
      <p className={c0}>
        Paste any BTC or LTC address. slip tells you which network it belongs to and refuses a
        mismatch — before it ever reaches a QR code.
      </p>

      <label className="mt-4 block" htmlFor="ac-address">
        <span className={c22}>Address</span>
        <input
          id="ac-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          placeholder="bc1q… / ltc1… / tb1…"
          className={c36}
        />
      </label>

      <label className="mt-2 block" htmlFor="ac-network">
        <span className={c22}>Ringing into</span>
        <select
          id="ac-network"
          value={networkId}
          onChange={(e) => setNetworkId(e.target.value as NetworkId)}
          className={c4}
        >
          {ALL_NETWORK_IDS.map((id) => (
            <option key={id} value={id}>
              {networkById(id).label}
            </option>
          ))}
        </select>
      </label>

      {result && (
        <div className="mt-3">
          <p
            role="status"
            className={`rounded-lg border p-2 text-sm ${
              result.ok ? 'border-good text-good' : 'border-bad text-bad'
            }`}
          >
            {result.ok
              ? `valid for ${networkById(networkId).label}${result.scriptType ? ` · ${result.scriptType}` : ''}`
              : result.problem}
          </p>
          {result.networks.length > 0 && (
            <p className={c9}>
              accepted by: {result.networks.map((n) => networkById(n).label).join(', ')}
            </p>
          )}
          {result.warnings.map((w) => (
            <p key={w} className={c37}>
              {w}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
