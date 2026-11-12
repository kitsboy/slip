/**
 * What slip cannot do — the limits, and the short lesson that follows from them.
 *
 * Cam's instruction: this belongs in More, under the heading the footer already promises, in a single
 * restrained panel rather than a wall of text on the page. It is a lesson, not a disclaimer: every limit
 * here changes how you use the thing, so the limits and the instructions are the same document.
 *
 * Nothing on this panel may soften into a benefit. A limit written as a selling point is the same lie as
 * a tick slip did not earn. The full line-by-line list stays in Learn; this is the version you read once,
 * before a customer is waiting.
 */

import { useEffect, useState } from 'react';
import Dialog from './Dialog';

const LIMITS: readonly string[] = [
  'It cannot move your money. No private key ever reaches it, so it has nothing to spend with.',
  'It cannot take a card. Bitcoin, Lightning and Litecoin — there is no bank and no processor.',
  'It cannot refund by itself. You send from your own wallet; slip keeps the record.',
  'It cannot recover what you lose. No server, no account — the backup file is the only copy.',
  'It cannot prove a payment you marked by hand. The receipt says marked paid by you, and means it.',
  'It cannot watch for money with no internet. Ringing up a sale works offline; watching waits.',
  'It cannot be installed from an app store. It is a web page you put on your home screen.',
];

const FIRST_TEN = [
  'Get your wallet’s public key — not the seed. Sparrow: Settings → Keystore. BlueWallet: ⋯ → Wallet Info → XPUB.',
  'Name the shop, pick the coin. Start on a test network and prove one full cycle before real money.',
  'Paste the key. slip shows address 0/0 — the first address it would ever use.',
  'Compare that address with your own wallet’s first receive address. Then tick “I checked address 0/0”. Nothing opens until you do.',
  'Finish setup. The till is ready — no sign-up, no email, no server.',
];

const ONE_SALE = [
  'Tap the item, or use the keypad for a custom amount.',
  'Read the rate line. If no price is set, slip refuses to invent one and says where to set it.',
  'Charge. The customer scans, and the money goes straight into your wallet.',
  'When you have really seen it arrive, tap “I have the money”. The receipt then says marked paid by you — because slip did not see it.',
];

export default function Limits() {
  const [open, setOpen] = useState(false);

  // The footer link says "What slip cannot do · the limits, stated before you need them" and points at
  // #limits. A link that navigates nowhere is worse than no link, so the hash opens this panel.
  useEffect(() => {
    const maybeOpen = () => {
      if (window.location.hash === '#limits') setOpen(true);
    };
    // A hash only fires `hashchange` when it is *different*, so a second click on the footer link would
    // land on a page that looks dead. Catch the click as well.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.('a[href="#limits"]');
      if (link) setOpen(true);
    };
    maybeOpen();
    window.addEventListener('hashchange', maybeOpen);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', maybeOpen);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      <section className="panel" aria-labelledby="limits-row-title">
        <h2 className="panel-title" id="limits-row-title">
          What slip cannot do
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          The limits, stated before you need them — and the short version of how to run the till.
        </p>
        <button
          type="button"
          className="v2-limits-row"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          data-limits-open
        >
          <span>Read the limits and the short guide</span>
          <span aria-hidden className="v2-limits-row-go">
            →
          </span>
        </button>
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} title="What slip cannot do">
        <p className="v2-limits-lead">The limits, stated before you need them.</p>

          <h3 className="v2-limits-h">Seven things it will not do</h3>
          <ul className="v2-limits-list">
          {LIMITS.map((line) => (
            <li key={line}>{line}</li>
          ))}
          </ul>

          <h3 className="v2-limits-h">Putting it on a phone</h3>
          <p>
          Open <code>slip.giveabit.io</code>. On Android, the ⋯ menu offers <strong>Install app</strong> —
          not “Add to Home screen”, which only makes a shortcut. On an iPhone, Share →{' '}
          <strong>Add to Home Screen</strong>. After the first visit it opens with no network.
          </p>

          <h3 className="v2-limits-h">The first ten minutes</h3>
          <ol className="v2-limits-list">
          {FIRST_TEN.map((line) => (
            <li key={line}>{line}</li>
          ))}
          </ol>

          <h3 className="v2-limits-h">One sale</h3>
          <ol className="v2-limits-list">
          {ONE_SALE.map((line) => (
            <li key={line}>{line}</li>
          ))}
          </ol>

          <h3 className="v2-limits-h">The end of a day</h3>
          <p>
          Books → <strong>Close the day</strong>. You get the totals and the rows, a CSV if you want the
          spreadsheet, and <strong>Print on A4</strong> → Save as PDF if you want a sheet to keep or email.
          No printer is needed.
          </p>

          <h3 className="v2-limits-h">The two rules that never change</h3>
          <p>
          Never paste a seed phrase or a private key into slip — a public key or address only. And a cue
          is a courtesy, never evidence: the wallet is the truth, not the sound or the colour.
          </p>

          <p className="v2-limits-tail">
          The full list, line by line, is in Learn under the same heading. Because there is no server and no
          account, the shop’s record lives in this browser on this device — the backup file is how it leaves.
        </p>
      </Dialog>
    </>
  );
}
