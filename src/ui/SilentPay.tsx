import { c0, c5, c9, c11, c12, c13, c14 } from './classes';
/**
 * Silent Payments, told straight.
 *
 * An sp1 address is a receive destination. Detecting a payment to it needs the wallet's scan key,
 * which slip will never hold — so this panel takes the sale, shows the QR, and records the result
 * as a manual confirmation. The alternative (asking for a scan key) would break the one rule the
 * whole app is built on.
 */

import { useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { checkSilentPaymentAddress, silentPaymentCapability, silentPaymentUri } from '../core/silentpay';
import { fiatToAtoms, formatFiat, formatSats, parseFiat, parseRate } from '../core/money';
import { loadSettings } from '../core/settings';
import { renderQrSvg } from '../core/qr';
import { ScanField } from './Scan';
import { store as appStore } from '../core/storage';

export default function SilentPay() {
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const ledger = useMemo(() => createLedger(appStore()), []);
  const cap = silentPaymentCapability();

  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [shown, setShown] = useState<{ uri: string; sats: bigint; minor: bigint } | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  const check = address.trim() ? checkSilentPaymentAddress(address) : null;

  function build() {
    const c = checkSilentPaymentAddress(address);
    if (!c.ok) {
      setNote({ kind: 'bad', text: c.reason ?? 'that address is not usable' });
      return;
    }
    try {
      const minor = parseFiat(amount, settings.currency).minor;
      if (!rate.trim()) throw new Error('set a rate, or nothing can be priced in sats');
      const sats = fiatToAtoms({ minor, currency: settings.currency }, parseRate(rate, settings.currency));
      setShown({ uri: silentPaymentUri(address, sats), sats, minor });
      setNote(null);
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'could not price that sale' });
    }
  }

  async function recordManual() {
    if (!shown) return;
    const now = new Date();
    const invoice = {
      id: `inv_sp_${now.getTime().toString(36)}`,
      walletId: 'sp1:' + address.slice(0, 16),
      walletLabel: 'Silent Payments',
      address,
      index: null,
      amountAtoms: shown.sats,
      amountMinor: shown.minor,
      currency: settings.currency,
      rateMinorPerCoin: null,
      rateAt: now.toISOString(),
      lines: [],
      createdAt: now.toISOString(),
      expiresAt: now.toISOString(),
      status: 'complete' as const,
      seenAt: null,
      confirmedAt: now.toISOString(),
      manual: true,
      note: 'silent payments · confirmed by the merchant',
    };
    await ledger.putInvoice(invoice);
    setNote({
      kind: 'ok',
      text: 'recorded as a manual confirmation — slip cannot watch an sp1 address, and your wallet is the authority here.',
    });
    setShown(null);
  }

  return (
    <section className="mt-6 panel" data-panel="silentpay">
      <p className="eyebrow">Silent Payments</p>
      <h2 className="panel-title mt-1">Take a payment to your sp1 address</h2>
      <p className={c0}>{cap.explanation}</p>

      <ScanField
        id="sp-addr"
        label="Your Silent Payments address"
        placeholder="sp1… or tsp1…"
        onScan={(text) => {
          setAddress(text);
          const c = checkSilentPaymentAddress(text);
          setNote(c.ok ? { kind: 'ok', text: c.network === 'btc-mainnet' ? 'mainnet sp1 address' : 'testnet sp1 address' } : { kind: 'bad', text: c.reason ?? '' });
        }}
      />
      {check && !check.ok && <p className="mt-1 text-[11px] text-bad">{check.reason}</p>}
      {check?.ok && (
        <p className={c9}>
          {check.network === 'btc-mainnet' ? 'Bitcoin mainnet' : 'Bitcoin testnet'} · this address is
          never stored with anything that could spend it.
        </p>
      )}

      <div className={c11}>
        <label className="block" htmlFor="sp-amount">
          <span className="eyebrow">Amount ({settings.currency})</span>
          <input
            id="sp-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="12.50"
            className={c5}
          />
        </label>
        <label className="block" htmlFor="sp-rate">
          <span className="eyebrow">Rate per 1 BTC ({settings.currency})</span>
          <input
            id="sp-rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="60000.00"
            className={c5}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={build}
        className={c12}
      >
        show payment QR
      </button>

      {note && (
        <p className={`mt-2 text-[11px] ${note.kind === 'bad' ? 'text-bad' : note.kind === 'warn' ? 'text-warn' : 'text-muted'}`}>
          {note.text}
        </p>
      )}

      {shown && (
        <div className={c13}>
          <div
            className="qr-pocket h-48 w-48"
            dangerouslySetInnerHTML={{ __html: renderQrSvg(shown.uri, { scale: 5, margin: 2 }) }}
          />
          <div className={c14}>
            <p className="figure text-sm text-ink">{formatSats(shown.sats)}</p>
            <p>{formatFiat({ minor: shown.minor, currency: settings.currency })} · sp1 destination</p>
            <p className="mt-1 text-warn">
              Pay on the {check?.network === 'btc-testnet' ? 'testnet' : 'mainnet'} network, exact amount.
              The customer&apos;s wallet derives a fresh one-time address from this — that is the privacy
              Silent Payments buys.
            </p>
            <button
              type="button"
              onClick={recordManual}
              className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              record as paid (manual)
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
