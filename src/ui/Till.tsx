/**
 * The till.
 *
 * Everything a sale needs, with the two rules that keep it honest baked in:
 *   - the address on screen comes from a RESERVED index, created with the invoice — not from
 *     whatever the last render happened to compute;
 *   - "paid" is never guessed. It is either observed through the explorer (and says whether
 *     it is mined or still in the mempool) or a human pressed "I have the money", which is
 *     recorded as manual and labelled as such.
 *
 * QR appears three times, deliberately: on the payment screen for the customer, on the
 * receipt as proof, and in the rent/subscription panel where a standing request is often
 * paid by someone standing in front of you.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRepository, deriveForAccount, statusOf, type CounterAccount } from '../core/accounts';
import { createLedger, type LedgerRepository } from '../core/ledger';
import {
  applyStatus,
  burnInvoiceIndex,
  completeIfConfirmed,
  createInvoice,
  markManualPaid,
  statusFromObservation,
  type Invoice,
} from '../core/orders';
import { TEMPLATES, categories, searchItems, templateItems, type CatalogItem } from '../core/catalog';
import { computeTotals, fiatToAtoms, formatFiat, formatSats, parseFiat, parseRate } from '../core/money';
import { loadSettings } from '../core/settings';
import { fetchAddressActivity, targetFor } from '../core/providers/esplora';
import { paymentUri, renderQrSvg } from '../core/qr';
import { cancelInvoice, takingsToday } from '../core/orders';

interface CartLine {
  readonly item: CatalogItem;
  quantity: number;
}

const POLL_MS = 10_000;

function qrSvg(text: string, scale = 5): string {
  return renderQrSvg(text, { scale, margin: 2 });
}

export default function Till() {
  const settings = useMemo(() => loadSettings(window.localStorage).settings, []);
  const [wallets, setWallets] = useState<CounterAccount[]>([]);
  const [walletId, setWalletId] = useState<string>('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [custom, setCustom] = useState('');
  const [tipJar, setTipJar] = useState(false);
  const [rate, setRate] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  const [status, setStatus] = useState<string>('');
  const [online, setOnline] = useState(navigator.onLine);
  const poller = useRef<number | null>(null);

  const ledger = useMemo<LedgerRepository>(() => createLedger(window.localStorage), []);
  const wallet = wallets.find((w) => w.id === walletId) ?? null;

  const reload = useCallback(() => {
    const accounts = createRepository(window.localStorage).load().accounts;
    setWallets(accounts);
    setWalletId((current) => current || (accounts.find((a) => statusOf(a) === 'ready')?.id ?? ''));
    const l = ledger.load();
    setItems(l.items);
  }, [ledger]);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener('slip:data-changed', onChange);
    const onNet = () => setOnline(navigator.onLine);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      window.removeEventListener('slip:data-changed', onChange);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      if (poller.current) window.clearInterval(poller.current);
    };
  }, [reload]);

  const visible = useMemo(() => {
    const filtered = category === 'All' ? items : items.filter((i) => i.category === category);
    return searchItems(filtered, query);
  }, [items, category, query]);

  const totals = useMemo(() => {
    if (!wallet) return null;
    const lines = cart.map((l) => ({
      unitMinor: l.item.priceCurrency === 'SATS' ? l.item.priceMinor : l.item.priceMinor,
      priceCurrency: l.item.priceCurrency,
      quantity: BigInt(l.quantity),
    }));
    const customMinor = custom.trim() ? parseFiatSafe(custom, settings.currency) : null;
    if (customMinor !== null) lines.push({ unitMinor: customMinor, priceCurrency: 'FIAT' as const, quantity: 1n });
    if (lines.length === 0) return null;

    try {
      const rateMinor = rate.trim() ? parseRate(rate, settings.currency) : undefined;
      return computeTotals({
        currency: settings.currency,
        lines,
        ...(settings.taxBps > 0 ? { tax: { rateBps: BigInt(settings.taxBps), inclusive: settings.taxInclusive } } : {}),
        ...(rateMinor !== undefined ? { rateMinorPerCoin: rateMinor } : {}),
      });
    } catch {
      return null;
    }
  }, [cart, custom, rate, settings, wallet]);

  const chargeSats = useMemo(() => {
    if (!totals || !rate.trim()) return null;
    try {
      const rateMinor = parseRate(rate, settings.currency);
      return fiatToAtoms({ minor: totals.roundedTotalMinor, currency: settings.currency }, rateMinor);
    } catch {
      return null;
    }
  }, [totals, rate, settings.currency]);

  function addLine(item: CatalogItem) {
    setCart((lines) => {
      const existing = lines.find((l) => l.item.id === item.id);
      if (existing) return lines.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...lines, { item, quantity: 1 }];
    });
  }

  function removeLine(id: string) {
    setCart((lines) => lines.map((l) => (l.item.id === id ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0));
  }

  function charge() {
    if (!wallet || !totals || chargeSats === null) return;
    const book = ledger.book(wallet.id);
    const lines = cart.map((l) => ({
      name: l.item.name,
      quantity: l.quantity,
      unitAtoms: l.item.priceCurrency === 'SATS' ? l.item.priceMinor : 0n,
      unitMinor: l.item.priceCurrency === 'SATS' ? 0n : l.item.priceMinor,
    }));

    try {
      const created = createInvoice({
        wallet,
        book,
        amountAtoms: chargeSats,
        amountMinor: totals.roundedTotalMinor,
        currency: settings.currency,
        rateMinorPerCoin: parseRate(rate, settings.currency),
        lines,
        buildAddress: (index) => deriveForAccount(wallet, index),
        note: tipJar ? 'tip jar' : '',
      });
      // The address is about to reach a payer, so the index is burned now — not at
      // creation, so an abandoned cart never consumes one.
      ledger.setBook(wallet.id, burnInvoiceIndex(created.invoice, created.book));
      ledger.putInvoice(created.invoice);
      setInvoice(created.invoice);
      setReceipt(null);
      setStatus('waiting');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'could not create the invoice');
    }
  }

  const check = useCallback(
    async (target: Invoice) => {
      const account = wallets.find((w) => w.id === target.walletId);
      if (!account) return;
      const t = targetFor(account.networkId, settings.explorerUrl);
      if (!t) {
        setStatus('no explorer for this network — confirm by eye');
        return;
      }
      try {
        const activity = await fetchAddressActivity(t, target.address);
        const next = statusFromObservation(target, { activity });
        const updated = completeIfConfirmed(applyStatus(target, next));
        ledger.putInvoice(updated);
        setInvoice((cur) => (cur && cur.id === updated.id ? updated : cur));
        if (updated.status === 'complete') setReceipt(updated);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'could not reach the explorer');
      }
    },
    [ledger, settings.explorerUrl, wallets],
  );

  // Poll only while a payment screen is open. Never in the background: a till that chatters
  // to an explorer while idle is a privacy leak with no benefit.
  useEffect(() => {
    if (poller.current) window.clearInterval(poller.current);
    if (!invoice || invoice.status === 'complete') return;
    poller.current = window.setInterval(() => {
      void check(invoice);
    }, POLL_MS);
    return () => {
      if (poller.current) window.clearInterval(poller.current);
    };
  }, [invoice, check]);

  async function callAgent(event: string, detail: unknown) {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  }

  function abandon() {
    if (!invoice) return;
    if (invoice.status === 'awaiting' || invoice.status === 'seen') {
      ledger.setBook(invoice.walletId, cancelInvoice(invoice, ledger.book(invoice.walletId)));
      ledger.touchInvoice(invoice.id, { status: 'cancelled' });
    }
    setInvoice(null);
    setStatus('');
  }

  async function markPaid() {
    if (!invoice) return;
    const updated = markManualPaid(invoice);
    ledger.putInvoice(updated);
    setInvoice(updated);
    setReceipt(updated);
    await callAgent('slip:paid', { invoice: updated, manual: true });
  }

  async function finish() {
    if (receipt) await callAgent('slip:paid', { invoice: receipt, manual: receipt.manual });
    setReceipt(null);
    setInvoice(null);
    setCart([]);
    setCustom('');
    setTipJar(false);
    setStatus('');
    reload();
  }

  // --- payment screen -------------------------------------------------------
  if (invoice && !receipt) {
    const uri = paymentUri('bitcoin', {
      address: invoice.address,
      amountSats: invoice.amountAtoms,
      label: invoice.walletLabel,
    });
    const pending = invoice.status === 'awaiting' || invoice.status === 'seen';
    return (
      <section className="mt-6 panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Payment</p>
          <span className={`chip ${pending ? 'border-warn text-warn' : 'chip-good'}`}>
            {invoice.status === 'awaiting' ? 'waiting for payment' : invoice.status === 'seen' ? 'seen in mempool — not mined yet' : invoice.status}
          </span>
        </div>
        <h2 className="panel-title mt-1">
          Pay exactly <span className="figure">{formatSats(invoice.amountAtoms)}</span>
        </h2>

        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div
            className="h-56 w-56 shrink-0 rounded-xl bg-white p-2"
            // Our own SVG built from a matrix — no merchant text is injected here.
            dangerouslySetInnerHTML={{ __html: qrSvg(uri, 6) }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-muted">
              Scan with any Bitcoin wallet, or copy the address. slip is watching this address on{' '}
              <span className="text-ink">{invoice.walletLabel}</span>.
            </p>
            <p className="mt-2 break-all rounded-lg border border-line bg-bg p-2 font-mono text-[11px]">
              {invoice.address}
            </p>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(invoice.address)}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
            >
              copy address
            </button>

            <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-warn">
              <li>· Pay the exact amount — a different amount cannot be matched to this sale.</li>
              <li>· Send on the <span className="text-ink">{wallet?.networkId}</span> network only.</li>
              <li>
                · {invoice.index === null
                  ? 'This wallet has ONE fixed address; it is reused for every sale.'
                  : `Address #${invoice.index} for this sale. Do not pay it twice.`}
              </li>
              <li>· An invoice is good for 15 minutes; a late payment is judged, not assumed.</li>
              {!online && <li className="text-bad">· Offline: detection paused, money is not lost.</li>}
            </ul>

            <p className="mt-2 text-[11px] text-muted">
              {formatFiat({ minor: invoice.amountMinor, currency: invoice.currency })} at the rate you
              entered · <span className="figure">{invoice.rateMinorPerCoin ? formatSats(0n).replace('0 sats', '') : ''}</span>
              {invoice.rateAt ? `rate read ${invoice.rateAt.slice(11, 16)}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void check(invoice)}
            className="rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent"
          >
            check now
          </button>
          <button
            type="button"
            onClick={() => void markPaid()}
            className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink"
          >
            I have the money (manual)
          </button>
          <button
            type="button"
            onClick={abandon}
            className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink"
          >
            cancel sale
          </button>
        </div>

        {status && <p className="mt-2 text-[11px] text-muted">{status}</p>}
      </section>
    );
  }

  // --- receipt --------------------------------------------------------------
  if (receipt) {
    const proofUri = paymentUri('bitcoin', { address: receipt.address, amountSats: receipt.amountAtoms });
    return (
      <section className="mt-6 panel">
        <p className="eyebrow">Receipt</p>
        <h2 className="panel-title mt-1">
          {receipt.manual ? 'Marked paid by you' : 'Paid — seen on chain'}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {settings.businessName || 'Your shop'} ·{' '}
          {formatFiat({ minor: receipt.amountMinor, currency: receipt.currency })} ={' '}
          {formatSats(receipt.amountAtoms)} · {receipt.confirmedAt?.slice(0, 16).replace('T', ' ')}
        </p>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div
            className="h-32 w-32 rounded-lg bg-white p-1"
            dangerouslySetInnerHTML={{ __html: qrSvg(proofUri, 5) }}
          />
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
            <p className="break-all font-mono">{receipt.address}</p>
            <p className="mt-1">
              {receipt.manual
                ? 'This receipt records a manual confirmation. slip did not observe a payment.'
                : 'slip observed this payment at this address.'}
            </p>
            <p className="mt-1">
              Invoice {receipt.id} · wallet {receipt.walletLabel}
              {receipt.index !== null ? ` · index #${receipt.index}` : ' · fixed address'}
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted hover:text-ink"
            >
              print receipt
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void finish()}
          className="mt-4 rounded-lg border border-accent px-4 py-2 text-xs uppercase tracking-wider text-accent"
        >
          new sale
        </button>
      </section>
    );
  }

  // --- sale building --------------------------------------------------------
  const cats = ['All', ...categories(items)];
  const walletTakings = wallet ? takingsToday(ledger.load().invoices, wallet.id) : 0n;

  return (
    <section className="mt-6 panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Till</p>
          <h2 className="panel-title mt-1">Take a payment</h2>
        </div>
        <span className="chip">
          {online ? 'detection live' : 'offline — detection paused'}
        </span>
      </div>

      {wallets.length === 0 ? (
        <p className="mt-3 rounded-lg border border-warn p-3 text-xs text-warn">
          Add a wallet above first — a till needs somewhere to be paid.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block" htmlFor="tl-wallet">
              <span className="eyebrow">Wallet taking this sale</span>
              <select
                id="tl-wallet"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} disabled={statusOf(w) !== 'ready'}>
                    {w.label} · {w.networkId} {statusOf(w) !== 'ready' ? '(unchecked)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="tl-rate">
              <span className="eyebrow">Rate per 1 {wallet?.coin === 'ltc' ? 'LTC' : 'BTC'} ({settings.currency})</span>
              <input
                id="tl-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="60000.00"
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          {items.length === 0 && (
            <div className="mt-3 rounded-lg border border-line p-3">
              <p className="text-xs text-muted">No items yet. Start from a template:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      ledger.replaceItems(templateItems(t.id));
                      reload();
                    }}
                    className="rounded-lg border border-accent px-3 py-2 text-[11px] uppercase tracking-wider text-accent"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap gap-1">
                {cats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-3 text-[11px] ${category === c ? 'border-accent text-accent' : 'border-line text-muted'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search items"
                aria-label="Search items"
                className="mt-2 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
              />
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visible.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => addLine(i)}
                    className="rounded-xl border border-line bg-surface-2 p-3 text-left hover:border-accent"
                  >
                    <span className="block text-lg" aria-hidden>
                      {i.emoji ?? '•'}
                    </span>
                    <span className="mt-1 block text-xs">{i.name}</span>
                    <span className="figure mt-0.5 block text-[11px] text-muted">
                      {i.priceCurrency === 'SATS'
                        ? formatSats(i.priceMinor)
                        : formatFiat({ minor: i.priceMinor, currency: settings.currency })}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="block" htmlFor="tl-custom">
              <span className="eyebrow">Custom amount ({settings.currency})</span>
              <input
                id="tl-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                inputMode="decimal"
                placeholder="12.50"
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustom('');
                  setCart([]);
                  setTipJar(true);
                  setCategory('All');
                }}
                className={`rounded-lg border px-3 py-2 text-[11px] uppercase tracking-wider ${tipJar ? 'border-accent text-accent' : 'border-line text-muted'}`}
              >
                tip jar mode
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted"
                >
                  clear cart
                </button>
              )}
            </div>
          </div>

          {cart.length > 0 && (
            <ul className="mt-3 space-y-1">
              {cart.map((l) => (
                <li key={l.item.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-xs">
                  <span className="flex-1">{l.item.name}</span>
                  <span className="figure text-muted">× {l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.item.id)}
                    className="rounded border border-line px-2 text-[10px] uppercase text-muted"
                    aria-label={`Remove one ${l.item.name}`}
                  >
                    −
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totals && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ['Subtotal', formatFiat({ minor: totals.subtotalMinor, currency: settings.currency })],
                ['Tax', formatFiat({ minor: totals.taxMinor, currency: settings.currency })],
                ['Total', formatFiat({ minor: totals.roundedTotalMinor, currency: settings.currency })],
                ['Charge', chargeSats === null ? 'set a rate' : formatSats(chargeSats)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line px-2 py-1">
                  <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                  <dd className="figure mt-0.5 text-xs">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={charge}
              disabled={!wallet || !totals || chargeSats === null}
              className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
            >
              charge {chargeSats !== null ? formatSats(chargeSats) : ''}
            </button>
            <span className="text-[11px] text-muted">
              today on this wallet: <span className="figure">{formatSats(walletTakings)}</span>
            </span>
          </div>
          {status && <p className="mt-2 text-[11px] text-bad">{status}</p>}
        </>
      )}
    </section>
  );
}

function parseFiatSafe(text: string, currency: string): bigint | null {
  try {
    return parseFiat(text, currency).minor;
  } catch {
    return null;
  }
}
