/**
 * "Which wallet do you use?" — the picker that makes step one recognisable.
 *
 * Nothing here holds or reads a wallet. The component only answers one question a stranger actually
 * has ("where is the code?") and then puts the cursor in the right field. It never guesses that an
 * app can do something it cannot: a Lightning-only wallet is routed to the Lightning card instead.
 */

import { useState } from 'react';

import { WALLET_GUIDES, type WalletGuide } from '../core/walletGuides';

interface Props {
  /** Which field to put the cursor in once the person has the code in hand. */
  readonly onSend?: (kind: 'code' | 'lightning') => void;
}

export default function WalletPicker({ onSend }: Props) {
  const [chosen, setChosen] = useState<WalletGuide | null>(null);

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3" data-wallet-picker>
      <p className="text-sm font-semibold">Which wallet do you use?</p>
      <p className="mt-0.5 text-xs text-muted">
        Pick it and slip will tell you exactly where its public code lives. Nothing is connected and
        nothing is logged in.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {WALLET_GUIDES.map((guide) => (
          <button
            key={guide.id}
            type="button"
            onClick={() => setChosen(guide)}
            aria-pressed={chosen?.id === guide.id}
            className={`chip ${chosen?.id === guide.id ? 'border-accent text-accent' : ''}`}
          >
            {guide.name}
          </button>
        ))}
      </div>

      {chosen && (
        <div className="mt-3 rounded-lg border border-line bg-bg p-3" data-wallet-guide={chosen.id}>
          <p className="text-sm font-semibold">{chosen.name}</p>
          <p className="mt-0.5 text-xs text-secondary">{chosen.blurb}</p>

          <ol className="mt-2 grid gap-1 text-xs text-secondary">
            {chosen.steps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="figure shrink-0 text-muted">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {chosen.caveat && <p className="mt-2 text-[11px] leading-relaxed text-warn">{chosen.caveat}</p>}

          <p className="mt-1 text-[11px] text-muted">
            Menus move between versions — if a name has changed, the idea is the same: a long code
            beginning zpub / ypub / xpub, or an address that looks like an email.
          </p>

          <button
            type="button"
            className="btn btn-secondary mt-2 px-2 py-1 text-xs"
            onClick={() => {
              onSend?.(chosen.kind);
              const target =
                chosen.kind === 'lightning'
                  ? document.getElementById('ln-addr')
                  : document.getElementById('ct-xpub');
              target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              (target as HTMLInputElement | null)?.focus();
            }}
          >
            {chosen.kind === 'lightning' ? 'Take me to the Lightning field' : 'I have the code — paste it here'}
          </button>
        </div>
      )}
    </div>
  );
}
