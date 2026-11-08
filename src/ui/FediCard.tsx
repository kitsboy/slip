/**
 * Fedi, ready and switched off.
 *
 * Mounted only when `FEDI_CARD_ENABLED` is true. slip never joins a federation and never
 * holds ecash. The only thing this card can do is check a Lightning address the merchant
 * already has inside Fedi, then hand that address to the Lightning field. A sweep is a
 * sentence. There is no button that moves money.
 */

import { useState } from 'react';
import { FEDI_CARD_COPY, FEDI_RAILS, checkFediAddress, sweepSuggestion } from '../core/fedi';
import { SecretRefused, assertNotSecret } from '../core/keys';
import { fetchPayParams } from '../core/providers/lnurl';

export default function FediCard() {
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [held, setHeld] = useState('');
  const [threshold, setThreshold] = useState('');

  function onAddress(next: string) {
    try {
      assertNotSecret(next);
    } catch (e) {
      if (e instanceof SecretRefused) {
        setAddress('');
        setNotice('That is a secret. slip never asks for one, and the field has been cleared.');
        return;
      }
      throw e;
    }
    setAddress(next);
    setNotice(null);
  }

  async function check() {
    const syntax = checkFediAddress(address);
    if (!syntax.ok) {
      setNotice(syntax.reason);
      return;
    }
    try {
      const params = await fetchPayParams(address);
      setNotice(
        params.tag === 'payRequest'
          ? 'The host answered with a pay request. slip can ask it for an invoice. This check did not create one, and slip has not joined anything.'
          : 'The host answered, but not with a pay request. slip will not guess.',
      );
    } catch {
      setNotice('The host did not answer a pay request. slip will not guess that this is Fedi.');
    }
  }

  function useOnLightning() {
    const text = address.trim();
    if (text === '') {
      setNotice('Paste a Lightning address first.');
      return;
    }
    void navigator.clipboard?.writeText(text);
    setNotice('Copied. Paste it into the Lightning field. That is the whole hand-off. slip does not save a Fedi login.');
  }

  const heldSats = /^\d+$/.test(held.trim()) ? BigInt(held.trim()) : null;
  const thresholdSats = /^\d+$/.test(threshold.trim()) ? BigInt(threshold.trim()) : 0n;
  const nudge = sweepSuggestion({ thresholdSats, balanceSats: heldSats, label: 'Fedi' });

  return (
    <section className="mt-6 panel" data-fedi-card>
      <h2 className="panel-title">{FEDI_CARD_COPY.title}</h2>
      <p className="mt-1 text-sm text-secondary">{FEDI_CARD_COPY.lead}</p>
      <p className="mt-2 text-xs leading-relaxed text-warn">{FEDI_CARD_COPY.limit}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        The coins slip sells in are Bitcoin and Litecoin, on mainnet, signet and testnet. Fedi is
        not one of those coins. This card only watches a Lightning address.
      </p>

      <ul className="mt-3 grid gap-1 text-xs text-muted">
        {FEDI_RAILS.map((rail) => (
          <li key={rail.id}>
            <span className="text-ink">{rail.label}.</span> {rail.how}{' '}
            {rail.works ? 'slip can see this path.' : 'slip cannot see this path, and will not pretend to.'}
          </li>
        ))}
      </ul>

      <label className="mt-3 block" htmlFor="fedi-addr">
        <span className="eyebrow">Lightning address inside Fedi</span>
        <input
          id="fedi-addr"
          value={address}
          onChange={(e) => onAddress(e.target.value)}
          placeholder="shop@example.com"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => void check()}>
          Check this address
        </button>
        <button type="button" className="btn btn-ghost" onClick={useOnLightning}>
          Use it on the Lightning card
        </button>
      </div>

      {notice && (
        <p className="mt-2 text-xs text-muted" role="status">
          {notice}
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="block" htmlFor="fedi-held">
          <span className="eyebrow">What Fedi says it is holding (sats)</span>
          <input
            id="fedi-held"
            value={held}
            onChange={(e) => setHeld(e.target.value)}
            inputMode="numeric"
            placeholder="slip cannot see this"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="fedi-threshold">
          <span className="eyebrow">Remind me above (sats)</span>
          <input
            id="fedi-threshold"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="numeric"
            placeholder="400000"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {nudge.at && nudge.sentence && (
        <p className="mt-2 text-xs text-warn" role="status">
          {nudge.sentence}
        </p>
      )}
    </section>
  );
}
