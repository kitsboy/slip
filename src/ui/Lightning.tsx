/**
 * Lightning, the way a café actually takes it: no node, no channel, no credential.
 *
 * The merchant's Lightning address (you@wallet.example) is public, so slip can ask that wallet's
 * own LNURL-pay endpoint for an invoice at the exact amount. If the endpoint offers a `verify`
 * URL, the payment can be watched to settlement — which is the only Lightning "paid" this app
 * will ever show. If it does not, the screen says the payment cannot be auto-checked, because
 * guessing is how a till marks a coffee paid that never was.
 */

import { useEffect, useRef, useState } from 'react';
import { createLedger } from '../core/ledger';
import { fetchPayParams, lightningUri, parseLightningAddress, requestInvoice, verifyPayment } from '../core/providers/lnurl';
import { loadSettings } from '../core/settings';
import { fiatToAtoms, formatFiat, formatSats, parseFiat, parseRate } from '../core/money';
import { renderQrSvg } from '../core/qr';
import { isDemo, store as appStore } from '../core/storage';

const DEMO_RATE: Readonly<Record<string, string>> = {
  USD: '94000',
  EUR: '86500',
  GBP: '74200',
};

interface Live {
  readonly address: string;
  readonly pr: string;
  readonly verifyUrl: string | null;
  readonly sats: bigint;
  readonly minor: bigint;
  readonly createdAt: string;
}

export default function Lightning() {
  const settings = loadSettings(appStore()).settings;
  const ledger = createLedger(appStore());
  // A demo shop has a pretend Lightning address already filled in: one less thing to invent before
  // a visitor can see the whole flow work. It resolves against the simulator, never the internet.
  const [address, setAddress] = useState(() => (isDemo ? 'till@demo.local' : ''));
  const [amount, setAmount] = useState('');
  // A demo needs a price to turn pounds into sats, and a price is exactly what the simulated
  // internet now answers for. Prefilling it keeps the demo to one press; it stays editable.
  const [rate, setRate] = useState(() => (isDemo ? DEMO_RATE[loadSettings(appStore()).settings.currency] ?? '94000' : ''));
  const [memo, setMemo] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [status, setStatus] = useState<string>('');
  const [settled, setSettled] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!live?.verifyUrl || settled) return;
    timer.current = window.setInterval(async () => {
      try {
        const r = await verifyPayment(live.verifyUrl!);
        if (r.settled) {
          setSettled(true);
          setStatus('settled — the wallet confirmed it');
          ledger.putInvoice({
            id: `inv_ln_${Date.now().toString(36)}`,
            walletId: `ln:${live.address}`,
            walletLabel: 'Lightning',
            address: live.address,
            index: null,
            amountAtoms: live.sats,
            amountMinor: live.minor,
            currency: settings.currency,
            rateMinorPerCoin: null,
            rateAt: live.createdAt,
            lines: [],
            createdAt: live.createdAt,
            expiresAt: live.createdAt,
            status: 'complete',
            seenAt: live.createdAt,
            confirmedAt: new Date().toISOString(),
            manual: false,
            note: 'lightning · LNURL-verify',
          });
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'the verifier did not answer');
      }
    }, 5000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [live, settled, ledger, settings.currency]);

  async function generate() {
    setSettled(false);
    setLive(null);
    setStatus('');
    if (!parseLightningAddress(address)) {
      setStatus('that is not a Lightning address — it looks like name@wallet.example');
      return;
    }
    let sats: bigint;
    let minor: bigint;
    try {
      if (amount.trim()) {
        minor = parseFiat(amount, settings.currency).minor;
        if (!rate.trim()) throw new Error('set a rate, or type the amount in sats');
        sats = fiatToAtoms({ minor, currency: settings.currency }, parseRate(rate, settings.currency));
      } else {
        throw new Error('type an amount');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'could not work out the amount');
      return;
    }

    try {
      setStatus('asking the wallet for an invoice…');
      const params = await fetchPayParams(address);
      const invoice = await requestInvoice(params, sats, memo.trim() ? { comment: memo.trim() } : {});
      setLive({
        address,
        pr: invoice.pr,
        verifyUrl: invoice.verifyUrl,
        sats,
        minor,
        createdAt: new Date().toISOString(),
      });
      setStatus(
        invoice.verifyUrl
          ? 'invoice ready — slip will watch it settle'
          : 'invoice ready — this wallet offers no verify URL, so settlement cannot be auto-checked',
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'the wallet did not return an invoice');
    }
  }

  return (
    <section className="mt-6 panel" data-panel="lightning">
      <p className="eyebrow">Lightning</p>
      <h2 className="panel-title mt-1">Take a Lightning payment</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Your Lightning address is public, so slip can ask your own wallet for an invoice at the
        exact amount. No node, no channel, no credential — and nothing here can spend.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block" htmlFor="ln-addr">
          <span className="eyebrow">Lightning address</span>
          <input
            id="ln-addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="shop@getalby.com"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="ln-amt">
          <span className="eyebrow">Amount ({settings.currency})</span>
          <input
            id="ln-amt"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="4.50"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="ln-rate">
          <span className="eyebrow">Rate per 1 BTC ({settings.currency})</span>
          <input
            id="ln-rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="60000.00"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="ln-memo">
          <span className="eyebrow">Note (optional)</span>
          <input
            id="ln-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="two coffees"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        className="btn btn-primary mt-2"
      >
        Request invoice
      </button>

      {status && <p className="mt-2 text-[11px] text-muted">{status}</p>}

      {live && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div
            className="h-48 w-48 rounded-lg bg-white p-1"
            dangerouslySetInnerHTML={{ __html: renderQrSvg(lightningUri(live.pr), { scale: 5, margin: 2 }) }}
          />
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
            <p className="figure text-sm text-ink">{formatSats(live.sats)}</p>
            <p>
              {formatFiat({ minor: live.minor, currency: settings.currency })} · to {live.address}
            </p>
            <p className="mt-1 break-all font-mono text-[11px]">{live.pr.slice(0, 64)}…</p>
            <p className={`mt-2 ${settled ? 'text-ok' : 'text-warn'}`}>
              {settled
                ? 'Settled — this payment was confirmed by the wallet itself.'
                : live.verifyUrl
                  ? 'Waiting. slip asks the wallet every 5 seconds; only its answer counts.'
                  : 'No verify URL from this wallet: mark the sale by eye, and the receipt will say it was manual.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
