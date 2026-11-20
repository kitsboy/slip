import { c0, c5, c6, c12, c13, c14, c24 } from './classes';
/**
 * Fresh signet observation check; optional Lightning uses real money, not testnet.
 *
 * Everything else in slip can be tried with pretend money. This panel is the opposite: a genuine
 * invoice for a deliberately tiny amount, so a merchant can watch a real payment arrive before they
 * trust the till with a real price.
 *
 * Two rails, both keyless:
 *  - Lightning: the merchant's own Lightning address, via LNURL — no node, no credential.
 *  - Signet: test bitcoin, paid from a faucet wallet, watched through the public signet explorer.
 *
 * It cannot spend. It cannot send. It creates an invoice and watches an address — the same two
 * things the till does, at one hundred satoshis.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchPayParams, lightningUri, parseLightningAddress, requestInvoice, verifyPayment } from '../core/providers/lnurl';
import { fetchAddressActivity, targetFor } from '../core/providers/esplora';
import { checkAddress } from '../core/addresses';
import { formatSats } from '../core/money';
import { paymentUri, renderQrSvg } from '../core/qr';
import { paymentLabel } from '../core/brand';
import { loadSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

const TEST_SATS = 10_000n;

type Rail = 'lightning' | 'signet';

interface Live {
  readonly rail: Rail;
  readonly uri: string;
  readonly verifyUrl: string | null;
  readonly address: string | null;
  readonly sats: bigint;
  readonly baseline?: bigint;
  readonly baselineCount?: number;
}

export default function LiveTest() {
  const settings = loadSettings(appStore()).settings;
  const [rail, setRail] = useState<Rail>('signet');
  const [lightningAddress, setLightningAddress] = useState('');
  const [signetAddress, setSignetAddress] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [status, setStatus] = useState<string>('');
  const [settled, setSettled] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!live || settled) return;
    timer.current = window.setInterval(async () => {
      try {
        if (live.rail === 'lightning' && live.verifyUrl) {
          const r = await verifyPayment(live.verifyUrl);
          if (r.settled) {
            setSettled(true);
            setStatus('Wallet reports this real-money Lightning invoice settled. This is NOT a testnet readiness check.');
          }
        } else if (live.rail === 'signet' && live.address) {
          const target = targetFor('btc-signet', '');
          if (!target) return;
          const activity = await fetchAddressActivity(target, live.address);
          if (activity.chainReceivedAtoms >= (live.baseline ?? 0n) + live.sats && activity.txCount > (live.baselineCount ?? 0)) {
            setSettled(true);
            setStatus('Fresh increase mined on signet after the baseline — test coins only. Explorer totals are not proof of payer identity.');
          } else if (activity.chainReceivedAtoms + activity.mempoolReceivedAtoms > (live.baseline ?? 0n)) {
            setStatus('seen on signet — waiting for a block');
          }
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'the explorer did not answer');
      }
    }, 5_000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [live, settled]);

  async function startLightning() {
    setSettled(false);
    setLive(null);
    setStatus('');
    if (!parseLightningAddress(lightningAddress)) {
      setStatus('that is not a Lightning address — it looks like name@wallet.example');
      return;
    }
    try {
      setStatus('asking your wallet for a real invoice…');
      const params = await fetchPayParams(lightningAddress);
      const invoice = await requestInvoice(params, TEST_SATS);
      setLive({
        rail: 'lightning',
        uri: lightningUri(invoice.pr),
        verifyUrl: invoice.verifyUrl,
        address: null,
        sats: TEST_SATS,
      });
      setStatus(
        invoice.verifyUrl
          ? 'real invoice ready — pay it from your phone; slip will watch it settle'
          : 'real invoice ready — this wallet offers no verify link, so you must check it yourself',
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'could not get an invoice');
    }
  }

  async function startSignet() {
    setSettled(false);
    setLive(null);
    setStatus('');
    const check = checkAddress(signetAddress.trim(), 'btc-signet');
    if (!check.ok) {
      setStatus(check.problem ?? 'that is not a signet address');
      return;
    }
    const target = targetFor('btc-signet', '');
    if (!target) return;
    let baseline;
    try { baseline = await fetchAddressActivity(target, signetAddress.trim()); }
    catch { setStatus('Could not establish a baseline. No test started.'); return; }
    const uri = paymentUri('bitcoin', {
      address: signetAddress.trim(),
      amountSats: TEST_SATS,
      label: paymentLabel(settings.businessName || 'slip test', settings.signature),
    });
    setLive({ rail: 'signet', uri, verifyUrl: null, address: signetAddress.trim(), sats: TEST_SATS, baseline: baseline.chainReceivedAtoms + baseline.mempoolReceivedAtoms, baselineCount: baseline.txCount });
    setStatus('Baseline captured. Pay 10,000 NEW signet test sats (above typical dust); existing historical funds cannot pass this check. Test coins are worthless.');
  }

  return (
    <section className="mt-6 panel" data-panel="livetest">
      <p className="eyebrow">Live test</p>
      <h2 className="panel-title mt-1">Fresh testnet payment check</h2>
      <p className={c0}>
        Use signet test coins before real takings. slip captures a baseline before showing the
        request and waits for a new confirmed increase. Historical payouts are not a fresh sale.
        The optional Lightning tool below uses REAL money and is not a testnet readiness check.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setRail('lightning')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${rail === 'lightning' ? 'border-accent text-accent' : 'border-line text-muted'}`}
        >
          lightning
        </button>
        <button
          type="button"
          onClick={() => setRail('signet')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${rail === 'signet' ? 'border-accent text-accent' : 'border-line text-muted'}`}
        >
          signet
        </button>
      </div>

      {rail === 'lightning' ? (
        <label className="mt-3 block" htmlFor="lt-addr">
          <span className="eyebrow">Your Lightning address (real money)</span>
          <input
            id="lt-addr"
            value={lightningAddress}
            onChange={(e) => setLightningAddress(e.target.value)}
            placeholder="you@wallet.example"
            className={c5}
          />
        </label>
      ) : (
        <label className="mt-3 block" htmlFor="lt-signet">
          <span className="eyebrow">A signet address of your own (test bitcoin)</span>
          <input
            id="lt-signet"
            value={signetAddress}
            onChange={(e) => setSignetAddress(e.target.value)}
            placeholder="tb1…"
            className={c5}
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => (rail === 'lightning' ? void startLightning() : startSignet())}
        className={c12}
      >
        request {rail === 'signet' ? 'testnet' : 'REAL MONEY Lightning'} {TEST_SATS.toString()} sat invoice
      </button>

      {status && <p className={c6}>{status}</p>}

      {live && (
        <div className={c13}>
          <div
            className="h-48 w-48 rounded-lg bg-white p-1"
            dangerouslySetInnerHTML={{ __html: renderQrSvg(live.uri, { scale: 5, margin: 2 }) }}
          />
          <div className={c14}>
            <p className="figure text-sm text-ink">{formatSats(live.sats)}</p>
            <p>
              {live.rail === 'lightning'
                ? 'real Lightning invoice · paid from your own wallet'
                : 'bitcoin signet · test coins only, from a faucet'}
            </p>
            <p className={`mt-2 ${settled ? 'text-ok' : 'text-warn'}`}>
              {settled ? 'New receipt reported by the selected source. Not proof of payer identity or a physical end-to-end test.' : 'Waiting for fresh evidence. slip is checking every five seconds.'}
            </p>
            {live.rail === 'signet' && (
              <p className="mt-1">
                Need test coins?{' '}
                <a
                  href="https://signetfaucet.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted"
                >
                  signetfaucet.com
                </a>{' '}
                sends them to any tb1 address.
              </p>
            )}
          </div>
        </div>
      )}

      <p className={c24}>
        slip cannot spend or send. You pay separately from your wallet. This check is held in this tab only; no physical or funded test is certified.
      </p>
    </section>
  );
}
