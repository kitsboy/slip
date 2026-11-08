/**
 * The words, in plain English, with the exact term kept alongside for whoever wants it.
 *
 * This is the honest compromise at the heart of the plain-language pass: nothing is hidden from a
 * person who wants the real name, and nothing is forced on a person who only wanted to take a
 * payment. Every entry is two columns — what it means, and what it is called.
 */

import { useMemo, useState } from 'react';
import Tech from './Tech';

interface Entry {
  readonly plain: string;
  readonly term: string;
  readonly technical: string;
}

const WORDS: readonly Entry[] = [
  {
    term: 'sats',
    plain: 'The pennies of Bitcoin — small enough to price a coffee.',
    technical: 'Satoshis. 100,000,000 to one bitcoin; the smallest unit.',
  },
  {
    term: 'wallet code',
    plain: 'Your shop’s public wallet key. It lets slip see where money goes — never move it.',
    technical:
      'BIP-32 extended public key: a public key plus chain code. Derives addresses; cannot sign.',
  },
  {
    term: 'wallet rules',
    plain: 'The same public key, with your wallet’s rules written into it.',
    technical: 'Output descriptor (BIP-380–386): script type plus derivation path.',
  },
  {
    term: 'instant payment address',
    plain: 'An email-shaped address your wallet can be paid at instantly.',
    technical: 'LNURL-pay (LUD-06) resolved over HTTPS, verified with LNURL-verify (LUD-21).',
  },
  {
    term: 'seen / spotted',
    plain: 'The payment is on its way but not final. slip will not call this paid.',
    technical: 'A valid, unconfirmed transaction in a node’s mempool.',
  },
  {
    term: 'paid',
    plain: 'The payment is confirmed by the network and the amount is right.',
    technical: 'Mined, with the observed amount inside the configured tolerance.',
  },
  {
    term: 'private repeat address',
    plain: 'One address you publish once and reuse, that still keeps each customer private.',
    technical: 'BIP-352: a static P2TR address; the sender derives a unique output per payment.',
  },
  {
    term: 'day stamp',
    plain: 'A free public notary proving your books existed on a given day.',
    technical: 'OpenTimestamps: the day digest committed to Bitcoin through a Merkle tree.',
  },
  {
    term: 'test network',
    plain: 'Practice Bitcoin with no value, for learning the till safely.',
    technical: 'A separate Bitcoin network (signet, testnet4, LTC testnet) with worthless coins.',
  },
  {
    term: 'the thing slip will never ask for',
    plain:
      'Your seed phrase or private key. Anyone who asks for one can take your money — including us, which is why we never do.',
    technical:
      'A BIP-39 mnemonic or WIF/xprv private key. slip refuses these and wipes the field.',
  },
];

export default function Glossary() {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      WORDS.filter((entry) => {
        if (!needle) return true;
        return `${entry.term} ${entry.plain} ${entry.technical}`.toLowerCase().includes(needle);
      }).length,
    [needle],
  );

  return (
    <section className="mt-6 panel" data-panel="glossary" id="glossary">
      <p className="eyebrow">Plain words</p>
      <h2 className="panel-title mt-1">Every term, in English</h2>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        Nothing here is required reading. It is here for the moment a word on another screen made
        you stop — and for the person who wants the exact name as well as the meaning.
      </p>
      <label className="mt-3 block" htmlFor="gl-search">
        <span className="eyebrow">Search</span>
        <input
          id="gl-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="sats, paid, seed…"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <p className="mt-1 text-sm text-muted">
        {shown} of {WORDS.length} words. A hidden word is still on the page.
      </p>

      <dl className="mt-4 space-y-3">
        {WORDS.map((entry) => {
          const match =
            !needle || `${entry.term} ${entry.plain} ${entry.technical}`.toLowerCase().includes(needle);
          return (
            <div key={entry.term} className="rounded-xl border border-line p-3" hidden={!match}>
              <dt className="text-sm font-semibold text-ink">{entry.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed">{entry.plain}</dd>
              <Tech>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  <span className="opacity-70">Exact term: </span>
                  {entry.technical}
                </dd>
              </Tech>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
