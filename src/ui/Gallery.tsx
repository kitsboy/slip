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
 * The parts, on a page of their own. Dev server only — the production build
 * drops this file. Nothing here moves money or reads a wallet.
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
