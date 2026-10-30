/**
 * "Check your key" — the derivation preview, shipped early on purpose.
 *
 * This is the one screen that stands between a merchant and a support ticket: they
 * paste their account xpub, slip derives the first five addresses, and they compare
 * address #0 against their wallet's Receive tab. It deliberately cannot create an
 * invoice, reserve an index or draw a payment QR — that is the till, and the till
 * needs the whole payment engine behind it before it may exist.
 */

import { useMemo, useState } from 'react';
import { SecretRefused, parseExtendedKey, resolveScript } from '../core/keys';
import type { ScriptType } from '../core/keys';
import { previewAddresses } from '../core/derive';
import type { Coin, NetworkId } from '../core/network';

const COINS: Array<{ coin: Coin; networks: Array<{ id: NetworkId; label: string }> }> = [
  {
    coin: 'btc',
    networks: [
      { id: 'btc-mainnet', label: 'Bitcoin' },
      { id: 'btc-signet', label: 'Signet' },
      { id: 'btc-testnet4', label: 'Testnet4' },
    ],
  },
  {
    coin: 'ltc',
    networks: [
      { id: 'ltc-mainnet', label: 'Litecoin' },
      { id: 'ltc-testnet', label: 'LTC testnet' },
    ],
  },
];

const SCRIPTS: Array<{ id: ScriptType; label: string }> = [
  { id: 'p2wpkh', label: 'Native segwit (bc1q…)' },
  { id: 'p2tr', label: 'Taproot (bc1p…)' },
  { id: 'p2sh-p2wpkh', label: 'Nested segwit (3…)' },
  { id: 'p2pkh', label: 'Legacy (1…)' },
];

const NETWORK_IDS = COINS.flatMap((c) => c.networks.map((n) => n.id));

export default function KeyCheck() {
  const [raw, setRaw] = useState('');
  const [networkId, setNetworkId] = useState<NetworkId>('btc-mainnet');
  const [scriptOverride, setScriptOverride] = useState<ScriptType | ''>('');

  const result = useMemo(() => {
    const text = raw.trim();
    if (!text) return { state: 'empty' as const };

    try {
      const net = NETWORK_IDS.includes(networkId);
      if (!net) return { state: 'error' as const, message: 'unknown network selection' };
      const isTest = networkId.includes('test') || networkId.includes('signet');
      const coin: Coin = networkId.startsWith('ltc') ? 'ltc' : 'btc';

      const parsed = parseExtendedKey(text);
      const resolution = resolveScript(parsed, {
        coin,
        networkId,
        isTest,
        ...(scriptOverride ? { scriptType: scriptOverride } : {}),
      });
      const addresses = previewAddresses(parsed, {
        networkId,
        scriptType: resolution.scriptType,
        index: 0,
      });
      return {
        state: 'ok' as const,
        prefix: parsed.entry?.prefix ?? 'unregistered',
        depth: parsed.depth,
        fingerprint: parsed.fingerprintHex,
        scriptType: resolution.scriptType,
        warnings: resolution.warnings,
        addresses,
      };
    } catch (e) {
      if (e instanceof SecretRefused) {
        return { state: 'refused' as const, message: e.message, kind: e.kind };
      }
      return {
        state: 'error' as const,
        message: e instanceof Error ? e.message : 'could not read that key',
      };
    }
  }, [raw, networkId, scriptOverride]);

  return (
    <section className="mt-6 panel">
      <h2 className="panel-title">Check your key</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Paste an account-level <span className="font-mono">xpub / ypub / zpub / Ltub / tpub</span>.
        slip derives the first five receiving addresses and nothing else. Compare address #0 with
        your wallet&apos;s Receive tab — if they differ, stop and tell me before any sale.
      </p>

      <label className="mt-4 block text-[11px] uppercase tracking-widest text-muted" htmlFor="xpub">
        Public key (never a seed phrase)
      </label>
      <textarea
        id="xpub"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={3}
        placeholder="zpub6rFR7y4Q2AijB…"
        className="mt-1 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs text-ink outline-none focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {COINS.map((group) =>
          group.networks.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNetworkId(n.id)}
              className={`rounded-full border px-3 text-xs ${
                networkId === n.id
                  ? 'border-accent text-accent'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {n.label}
            </button>
          )),
        )}
      </div>

      <div className="mt-3">
        <label className="block text-[11px] uppercase tracking-widest text-muted" htmlFor="script">
          Script type (leave on auto to trust the prefix)
        </label>
        <select
          id="script"
          value={scriptOverride}
          onChange={(e) => setScriptOverride(e.target.value as ScriptType | '')}
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">Auto from prefix</option>
          {SCRIPTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {result.state === 'refused' && (
        <p className="mt-4 rounded-lg border border-bad p-3 text-sm text-bad" role="alert">
          {result.message}
        </p>
      )}

      {result.state === 'error' && (
        <p className="mt-4 rounded-lg border border-warn p-3 text-sm text-warn" role="alert">
          {result.message}
        </p>
      )}

      {result.state === 'ok' && (
        <div className="mt-4">
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ['Prefix', result.prefix],
              ['Depth', String(result.depth)],
              ['Parent fp', result.fingerprint],
              ['Script', result.scriptType],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line px-2 py-1">
                <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className="font-mono text-[11px]">{v}</dd>
              </div>
            ))}
          </dl>

          {result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {result.warnings.map((w) => (
                <li key={w} className="rounded-lg border border-warn p-2 text-xs text-warn">
                  {w}
                </li>
              ))}
            </ul>
          )}

          <ol className="mt-3 space-y-1">
            {result.addresses.map((a, i) => (
              <li
                key={a.address}
                className="flex items-center gap-2 rounded-lg border border-line px-2 py-1"
              >
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  {a.path}
                </span>
                <code className="flex-1 break-all font-mono text-[11px]">{a.address}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(a.address)}
                  className="shrink-0 rounded border border-line px-2 text-[10px] uppercase tracking-wider text-muted hover:text-ink"
                  aria-label={`Copy address ${i}`}
                >
                  copy
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
