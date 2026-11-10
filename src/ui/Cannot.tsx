/**
 * What slip cannot do.
 *
 * The brief asks for one page that states the limits before a shopkeeper discovers them at the
 * counter. Every line here is checkable against the code: no key material is ever accepted, there is
 * no server, no account, no card rail, and a manual confirmation is a promise the shopkeeper makes,
 * not something slip observed. Nothing on this page may soften into a benefit — a limit written as a
 * selling point is the same lie as a tick slip did not earn.
 */

import { isSkinV2 } from './skin';

interface Limit {
  /** The plain claim. Short enough to read at a glance. */
  readonly what: string;
  /** Why, in words a shopkeeper uses. No jargon, no abbreviations. */
  readonly why: string;
}

const LIMITS: readonly Limit[] = [
  {
    what: 'It cannot move your money',
    why: 'slip is never given a private key, so it has nothing to spend with. Every payment goes straight from your customer to the wallet you pasted in.',
  },
  {
    what: 'It cannot take a card',
    why: 'There is no card reader, no bank and no processor. Bitcoin and Lightning are the only rails here.',
  },
  {
    what: 'It cannot give a refund by itself',
    why: 'You send the refund from your own wallet and record it here. slip keeps the books; it cannot reach into your wallet to reverse a payment.',
  },
  {
    what: 'It cannot recover a setup you lost',
    why: 'Nothing is stored on a server, so there is no account to log back into. The backup file you save is the only copy — keep it somewhere else.',
  },
  {
    what: 'It cannot prove a payment you marked by hand',
    why: 'If you tap "I have the money", slip records your word. That is why the receipt says marked paid by you, and never seen on chain.',
  },
  {
    what: 'It cannot see money arrive with no internet',
    why: 'Ringing up a sale works offline. Watching for the payment needs your own node or a service you chose, so the receipt waits until it can look.',
  },
  {
    what: 'It cannot hold ecash for you',
    why: 'The Fedimint card is built but switched off. When it is on, the federation holds the ecash — slip still holds nothing.',
  },
  {
    what: 'It cannot be installed from an app store',
    why: 'This version is a web page you add to your home screen. There is no iPhone or Android download yet.',
  },
  {
    what: 'It cannot hide what it is',
    why: 'The version, the build and the count of requests to other servers are on every page. A demo is labelled a demo, in words, everywhere money appears.',
  },
];

export default function Cannot() {
  const v2 = isSkinV2();

  return (
    <section className="panel" id="cannot" data-cannot data-panel={v2 ? 'cannot' : undefined}>
      <h2 className="panel-title">What slip cannot do</h2>
      <p className="mt-1 max-w-2xl text-sm text-secondary">
        Read this before you rely on it at a counter. Each line is a thing this page will not do, not
        a thing it does badly.
      </p>

      <dl className="mt-3 grid gap-2">
        {LIMITS.map((limit) => (
          <div key={limit.what} className="border-t border-line pt-2">
            <dt className="text-sm font-semibold text-ink">{limit.what}</dt>
            <dd className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted">{limit.why}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
