import { useState } from 'react';

import Badge from './Badge';
import Button from './Button';
import Countdown from './Countdown';
import DataRow from './DataRow';
import Dialog from './Dialog';
import Money from './Money';
import Notice from './Notice';
import Progress from './Progress';
import QRCard from './QRCard';
import Sheet from './Sheet';
import Slip from './Slip';
import StatusLine from './StatusLine';
import Stepper from './Stepper';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', '⌫'] as const;
const SAMPLE = 'bc1qcr8te4zc7example0000000000000006fyu';

/**
 * The parts, on a page of their own — at `?gallery=1`, in production too.
 *
 * It is a workbench, not a screen of the shop: nothing links to it, it asks search engines to stay
 * away, and every figure here is a sample. Nothing on it moves money or reads a wallet.
 *
 * The table at the bottom is the point of the page now: every state of the money path, per surface,
 * with the ones that do not exist yet marked as missing rather than drawn as if they did.
 */
export default function Gallery() {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [digits, setDigits] = useState('1100');

  return (
    <main className="v2-gallery" data-slip-gallery>
      <h1>Parts</h1>
      <p className="prose">
        These are the pieces. The till behind them is unchanged.{' '}
        <a href="/?demo=1#till">Back to the till</a>
      </p>

      <section>
        <h2>Buttons</h2>
        <Button kind="primary">Charge 11,703 sats</Button>
        <Button kind="secondary">Copy</Button>
        <Button kind="text">Remove</Button>
        <Button kind="primary" blocked="Add a wallet first">
          Charge
        </Button>
      </section>

      <section>
        <h2>Money and the slip</h2>
        <Slip tear>
          <Money text="11.00" unit="USD" variant="hero" label="11 US dollars" />
          <Money text="11,703" unit="sats" variant="sats" label="11,703 satoshis" />
        </Slip>
        <Money text="123,456,789,012" unit="sats" variant="hero" label="a long figure" />
      </section>

      <section>
        <h2>Status</h2>
        <Badge kind="warn" word="WAITING" />
        <Badge kind="warn" word="SEEN" />
        <Badge kind="good" word="CONFIRMED" />
        <Badge kind="manual" word="MANUAL" />
        <Badge kind="simulated" word="SIMULATED" />
        <StatusLine state="waiting" word="Waiting to be paid" />
        <StatusLine state="confirmed" word="Paid — seen on chain" />
        <StatusLine state="manual" word="Marked paid by you" />
      </section>

      <section>
        <h2>Rows</h2>
        <DataRow label="Total" value="11.00 USD" leader />
        <DataRow label="Address" value={SAMPLE.slice(0, 12)} sub="Watch-only. slip cannot spend this." />
      </section>

      <section>
        <h2>Code</h2>
        <QRCard payload={SAMPLE} displayed={SAMPLE} amountLabel="11.00 USD" />
        <QRCard payload={SAMPLE} displayed="bc1qdoesnotmatch" amountLabel="11.00 USD" />
        <Countdown secondsLeft={75} />
        <Countdown secondsLeft={40} />
        <Countdown secondsLeft={0} />
      </section>

      <section>
        <h2>Keypad</h2>
        <p className="v2-money-num">{digits || '0'}</p>
        <div className="v2-keys">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="v2-key"
              aria-label={key === '⌫' ? 'Delete last digit' : undefined}
              onClick={() =>
                setDigits((prev) => (key === '⌫' ? prev.slice(0, -1) : `${prev}${key}`.replace(/^0+(?=\d)/, '')))
              }
            >
              {key}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Notices and progress</h2>
        <Notice tone="info" word="Heads up">
          A cue is a courtesy, never evidence.
        </Notice>
        <Notice tone="bad" word="Refused">
          That looks like a private key. The field was cleared. It was not stored.
        </Notice>
        <Progress value={40} />
        <Progress />
        <Stepper step={2} of={3} labels={['Wallet', 'Compare', 'Done']} />
      </section>

      <section>
        <h2>The nine states</h2>
        <p className="prose">
          Every state the money path can be in, in words and in the component that carries it. A state
          that is drawn here but missing from a screen is a bug in the screen, not a gap in the page.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="panel p-3">
            <p className="eyebrow">Resting</p>
            <p className="mt-1 text-xs text-muted">Nothing typed. The till shows its resting line.</p>
            <p className="v2-display-idle-line mt-2">What would you like to sell?</p>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Blocked</p>
            <p className="mt-1 text-xs text-muted">The action is refused, and the reason is on screen.</p>
            <div className="mt-2">
              <Button kind="primary" blocked="Add a wallet first">
                Charge
              </Button>
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Loading</p>
            <p className="mt-1 text-xs text-muted">Waiting on a price source, said out loud.</p>
            <p className="mt-2 flex items-center gap-2 text-[11px] text-muted" role="status">
              <span className="v2-beat" aria-hidden />
              <span>Asking the price source…</span>
            </p>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Waiting</p>
            <p className="mt-1 text-xs text-muted">A code is on screen and nobody has paid yet.</p>
            <div className="mt-2 grid gap-1">
              <StatusLine state="waiting" word="Waiting to be paid" />
              <Countdown secondsLeft={75} />
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Seen, not paid</p>
            <p className="mt-1 text-xs text-muted">A transaction exists; confirmations do not yet.</p>
            <div className="mt-2">
              <StatusLine state="waiting" word="Seen on chain — waiting for confirmations" />
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Paid</p>
            <p className="mt-1 text-xs text-muted">The engine observed it. Only then does it say paid.</p>
            <div className="mt-2">
              <StatusLine state="confirmed" word="Paid — seen on chain" />
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Marked by you</p>
            <p className="mt-1 text-xs text-muted">A human said so. It says a human said so.</p>
            <div className="mt-2">
              <StatusLine state="manual" word="Marked paid by you" />
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Expired</p>
            <p className="mt-1 text-xs text-muted">The window closed with nothing taken.</p>
            <div className="mt-2">
              <Countdown secondsLeft={0} />
            </div>
          </div>
          <div className="panel p-3">
            <p className="eyebrow">Cancelled and refunded</p>
            <p className="mt-1 text-xs text-muted">Cancelled is not taken; refunded is taken and given back.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge kind="warn" word="CANCELLED" />
              <Badge kind="warn" word="REFUNDED" />
              <Badge kind="simulated" word="SIMULATED" />
            </div>
          </div>
        </div>

        <h3 className="mt-4">Which screen has which state</h3>
        <table className="mt-2 w-full text-left text-[11px]">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-2 font-semibold">State</th>
              <th className="py-1 pr-2 font-semibold">Till</th>
              <th className="py-1 pr-2 font-semibold">Receipt</th>
              <th className="py-1 pr-2 font-semibold">Books</th>
              <th className="py-1 font-semibold">Money in</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {[
              ['Resting', 'yes', '—', '—', 'yes'],
              ['Entry', 'yes', '—', '—', '—'],
              ['Loading', 'yes', '—', '—', '—'],
              ['Blocked', 'yes', '—', 'yes', '—'],
              ['Waiting', 'yes', 'yes', 'yes', 'yes'],
              ['Seen', 'yes', 'yes', '—', 'yes'],
              ['Paid', 'yes', 'yes', 'yes', 'yes'],
              ['Expired', 'yes', '—', 'yes', 'yes'],
              ['Cancelled', 'yes', '—', 'yes', '—'],
            ].map((row) => (
              <tr key={row[0]} className="border-t border-line">
                {row.map((cell) => (
                  <td key={cell} className="py-1 pr-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="prose mt-2">
          Read as an audit, not a boast: a dash means the surface has no such state, and that is a
          question for the design, not a promise that it never needs one.
        </p>
      </section>

      <section>
        <h2>Dialog and sheet</h2>
        <Button kind="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Button kind="secondary" onClick={() => setSheet(true)}>
          Open sheet
        </Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Close the till?"
          actions={
            <Button kind="primary" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          This only asks. It does not move money.
        </Dialog>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Tools">
          <p>The rate and the Lightning form will live here. Not yet.</p>
        </Sheet>
      </section>
    </main>
  );
}
