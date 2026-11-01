/**
 * The real-money rehearsal: 100 sats on a real rail.
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

const TEST_SATS = 100n;

type Rail = 'lightning' | 'signet';

interface Live {
  readonly rail: Rail;
  readonly uri: string;
  readonly verifyUrl: string | null;
  readonly address: string | null;
  readonly sats: bigint;
}

export default function LiveTest() {
  const settings = loadSettings(appStore()).settings;
  const [rail, setRail] = useState<Rail>('lightning');
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
            setStatus('settled — your wallet confirmed a real 100 sat payment');
          }
        } else if (live.rail === 'signet' && live.address) {
          const target = targetFor('btc-signet', '');
          if (!target) return;
          const activity = await fetchAddressActivity(target, live.address);
          if (activity.chainReceivedAtoms >= live.sats) {
            setSettled(true);
            setStatus('mined on signet — the test payment arrived');
          } else if (activity.mempoolReceivedAtoms > 0n) {
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

  function startSignet() {
    setSettled(false);
    setLive(null);
    setStatus('');
    const check = checkAddress(signetAddress.trim(), 'btc-signet');
    if (!check.ok) {
      setStatus(check.problem ?? 'that is not a signet address');
      return;
    }
    const uri = paymentUri('bitcoin', {
      address: signetAddress.trim(),
      amountSats: TEST_SATS,
      label: paymentLabel(settings.businessName || 'slip test', settings.signature),
    });
    setLive({ rail: 'signet', uri, verifyUrl: null, address: signetAddress.trim(), sats: TEST_SATS });
    setStatus('signet invoice ready — pay 100 test sats and slip will watch the block');
  }

  return (
    <section className="mt-6 panel" data-panel="livetest">
      <p className="eyebrow">Live test</p>
      <h2 className="panel-title mt-1">A real 100 sat payment</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Everything else here can be practised with pretend money. This is the opposite: a genuine
        invoice for one hundred satoshis, on a rail you choose, so you can watch real money arrive
        before the till handles a real price. slip still cannot spend anything.
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
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
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
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => (rail === 'lightning' ? void startLightning() : startSignet())}
        className="mt-2 rounded-lg border border-accent px-3 py-2 text-xs text-accent"
      >
        request a real {TEST_SATS.toString()} sat invoice
      </button>

      {status && <p className="mt-2 text-[11px] text-muted">{status}</p>}

      {live && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div
            className="h-48 w-48 rounded-lg bg-white p-1"
            dangerouslySetInnerHTML={{ __html: renderQrSvg(live.uri, { scale: 5, margin: 2 }) }}
          />
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
            <p className="figure text-sm text-ink">{formatSats(live.sats)}</p>
            <p>
              {live.rail === 'lightning'
                ? 'real Lightning invoice · paid from your own wallet'
                : 'bitcoin signet · test coins only, from a faucet'}
            </p>
            <p className={`mt-2 ${settled ? 'text-ok' : 'text-warn'}`}>
              {settled ? 'Settled — this was a real payment, watched end to end.' : 'Waiting. slip is checking every five seconds.'}
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

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        This panel spends real (or test) money from your wallet, never slip’s — slip has none. Nothing
        is stored about the test except the invoice it watched.
      </p>
    </section>
  );
}
