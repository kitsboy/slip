import { useState } from 'react';
import Badge from './Badge';
import Button from './Button';
import DataRow from './DataRow';
import Money from './Money';
import StatusLine from './StatusLine';

/**
 * The shared parts, on a page you open on purpose (`?parts=1`).
 * Not in the shop navigation. Not the dev gallery. Nothing here moves money.
 */
export default function Parts() {
  const [blocked, setBlocked] = useState(true);
  return (
    <main className="v2-parts" data-parts>
      <h1>Parts</h1>
      <p className="prose">
        These are the pieces the till is built from. This page does not take a payment.{' '}
        <a href="/?demo=1#sell">Back to the till</a>
      </p>
      <section>
        <h2>Buttons</h2>
        <Button kind="primary">Charge</Button>
        <Button kind="secondary">Copy</Button>
        <Button kind="primary" blocked={blocked ? 'Add a wallet first — Setup, then Wallets.' : undefined}>
          Charge
        </Button>
        <button type="button" className="btn btn-secondary" onClick={() => setBlocked((v) => !v)}>
          {blocked ? 'Pretend the wallet is ready' : 'Grey it again'}
        </button>
      </section>
      <section>
        <h2>One number</h2>
        <p className="figure">11,703 sats</p>
        <Money text="11,703" unit="sats" variant="sats" label="11,703 satoshis" />
      </section>
      <section>
        <h2>Rows</h2>
        <DataRow label="Today" value="431,000 sats" />
        <DataRow label="On-chain" value="396,000 sats" />
        <DataRow label="Lightning" value="35,000 sats" />
      </section>
      <section>
        <h2>Status is a word</h2>
        <Badge kind="warn" word="WAITING" />
        <Badge kind="good" word="PAID" />
        <Badge kind="manual" word="MANUAL" />
        <StatusLine state="waiting" word="Waiting to be paid" />
        <StatusLine state="confirmed" word="Paid — seen on chain" />
        <StatusLine state="manual" word="Marked paid by you" />
      </section>
    </main>
  );
}
