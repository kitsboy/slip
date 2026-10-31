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
import { formatProof, type ReceiptProof } from '../core/proof';
import { fetchRate, requireFresh, type RateQuote } from '../core/providers/rates';
import { publishToDisplay, openCustomerDisplay } from './CustomerDisplay';
import { describeSweep, sweep } from '../core/reconcile';
import { closeTab, park, repeatable, tabLabel, tabSubtotalMinor, toTabLine, type ParkedTab, type RepeatSale } from '../core/tabs';
import FreshnessRing from './FreshnessRing';
import Explain from './Explain';
import { openPrintable } from './print';

interface CartLine {
  readonly item: CatalogItem;
  quantity: number;
}

const POLL_MS = 10_000;

/**
 * One rate request per minute per (coin, currency, endpoint).
 *
 * React's StrictMode mounts effects twice in development and a re-render can remount the
 * panel; without this the till would ask the same price feed several times a minute, which is
 * both a privacy leak and a way to get rate-limited at exactly the wrong moment.
 */
const RATE_CACHE = new Map<string, { at: number; promise: Promise<RateQuote> }>();

/** Parked sales and the last completed one, both local to this device. */
const TABS_KEY = 'slip.tabs.v1';
const LAST_SALE_KEY = 'slip.lastSale.v1';

function qrSvg(text: string, scale = 5): string {
  return renderQrSvg(text, { scale, margin: 2 });
}

export default function Till() {
  const [settings, setSettings] = useState(() => loadSettings(window.localStorage).settings);
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
  const [staffId, setStaffId] = useState<string>('');
  const [quote, setQuote] = useState<RateQuote | null>(null);
  const [rateNote, setRateNote] = useState<string>('');
  const [proof, setProof] = useState<ReceiptProof | null>(null);
  /** A split sale's second leg: its own address, its own QR, its own status. */
  const [leg2, setLeg2] = useState<Invoice | null>(null);
  const [split, setSplit] = useState(false);
  const [splitWalletId, setSplitWalletId] = useState('');
  const [splitPercent, setSplitPercent] = useState('50');
  const [sweepNote, setSweepNote] = useState<string>('');
  const [tabs, setTabs] = useState<ParkedTab[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(TABS_KEY) ?? '[]') as ParkedTab[];
    } catch {
      return [];
    }
  });
  const [lastSale, setLastSale] = useState<RepeatSale | null>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(LAST_SALE_KEY) ?? 'null') as RepeatSale | null;
    } catch {
      return null;
    }
  });
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
    const onSettings = () => setSettings(loadSettings(window.localStorage).settings);
    window.addEventListener('slip:settings-changed', onSettings);
    window.addEventListener('slip:data-changed', onChange);
    const onNet = () => setOnline(navigator.onLine);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      window.removeEventListener('slip:data-changed', onChange);
      window.removeEventListener('slip:settings-changed', onSettings);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      if (poller.current) window.clearInterval(poller.current);
    };
  }, [reload]);

  /**
   * Offline reconciliation. A till that sold through a dropped connection has invoices nobody
   * re-asked about; this sweeps them when the app loads and every time the network returns, and
   * says what changed. It is a courtesy, not a transaction: a failure changes nothing.
   */
  const reconcile = useCallback(async () => {
    const accounts = createRepository(window.localStorage).load().accounts;
    const l = ledger.load();
    if (l.invoices.length === 0) return;
    const runner = async (target: typeof l.invoices[number]) => {
      const account = accounts.find((a) => a.id === target.walletId);
      if (!account) throw new Error('that wallet is no longer on this device');
      const t = targetFor(account.networkId, settings.explorerUrl);
      if (!t) throw new Error('no explorer for that network');
      return fetchAddressActivity(t, target.address);
    };
    const result = await sweep(l.invoices, runner);
    if (result.updated.length > 0) ledger.putInvoices([...result.updated]);
    setSweepNote(describeSweep(result));
    if (result.changes.length > 0) window.dispatchEvent(new Event('slip:data-changed'));
  }, [ledger, settings.explorerUrl]);

  useEffect(() => {
    void reconcile();
    const onOnline = () => void reconcile();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reconcile]);

  /**
   * The rate, when the merchant asked slip to fetch one. The quote is stored with its age and
   * refused once it is stale: selling against a ten-minute-old price is how a shop loses money
   * to a quiet outage, and the UI must say so rather than quietly using it.
   */
  useEffect(() => {
    const coin = wallet?.coin ?? 'btc';
    if (!settings.autoRate) {
      setQuote(null);
      setRateNote('');
      return;
    }
    const key = `${coin}|${settings.currency}|${settings.rateEndpoint}`;

    // Deduplicate on the PROMISE rather than on the result: a remount that reaches here while
    // the first request is still in flight must join it, not start a second one. Cancelling on
    // unmount would otherwise throw the answer away and cost a second request.
    let entry = RATE_CACHE.get(key);
    if (!entry || Date.now() - entry.at > 60_000) {
      entry = {
        at: Date.now(),
        promise: fetchRate({
          coin,
          currency: settings.currency,
          ...(settings.rateEndpoint ? { endpoint: settings.rateEndpoint } : {}),
        }),
      };
      RATE_CACHE.set(key, entry);
    }

    let cancelled = false;
    const current = entry;
    current.promise
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setRate((prev) => prev.trim() || (Number(q.minorPerCoin) / 100).toFixed(2));
        setRateNote(`fetched ${q.fetchedAt.slice(11, 16)} UTC from ${q.source}`);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A failed fetch must not stay cached as a failure: the next attempt deserves a try.
        RATE_CACHE.delete(key);
        setQuote(null);
        setRateNote(
          `${e instanceof Error ? e.message : 'the rate service did not answer'} — type the rate yourself`,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [settings.autoRate, settings.currency, settings.rateEndpoint, wallet?.coin]);

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

  function saveTabs(next: ParkedTab[]) {
    setTabs(next);
    window.localStorage.setItem(TABS_KEY, JSON.stringify(next));
  }

  function parkCurrent() {
    if (!wallet) return;
    const draft: ParkedTab = {
      id: `tab_${Date.now().toString(36)}`,
      label: '',
      lines: cart.map((l) => toTabLine(l.item, l.quantity)),
      custom,
      walletId: wallet.id,
      note: tipJar ? 'tip jar' : '',
      createdAt: new Date().toISOString(),
    };
    const result = park(tabs, draft);
    if (!result.ok) {
      setStatus(result.reason ?? 'could not park that sale');
      return;
    }
    saveTabs([...result.tabs]);
    setCart([]);
    setCustom('');
    setTipJar(false);
    setStatus('parked — tap it above to resume');
  }

  function resumeTab(tab: ParkedTab) {
    const lines: CartLine[] = [];
    const missing: string[] = [];
    for (const line of tab.lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (item) lines.push({ item, quantity: line.quantity });
      else missing.push(line.name);
    }
    setCart(lines);
    setCustom(tab.custom);
    if (tab.walletId && wallets.some((w) => w.id === tab.walletId)) setWalletId(tab.walletId);
    saveTabs(closeTab(tabs, tab.id));
    setStatus(
      missing.length > 0
        ? `resumed, but ${missing.join(', ')} is no longer in the catalog`
        : 'resumed',
    );
  }

  function repeatLast() {
    if (!repeatable(lastSale)) return;
    const lines: CartLine[] = [];
    for (const line of lastSale.lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (item) lines.push({ item, quantity: line.quantity });
    }
    setCart(lines);
    setCustom(lastSale.custom);
    setTipJar(false);
    setStatus('last sale loaded — check the total, then charge');
  }

  function charge() {
    // In tip-jar mode a named staff member's own wallet takes the money, so their tips land in
    // their wallet and not the shop's. It is the same watch-only rule either way.
    const payee = tipJar && staffId ? (wallets.find((w) => w.id === staffId) ?? wallet) : wallet;
    if (!payee || !totals || chargeSats === null) return;

    // A fetched rate that has gone stale is refused, not used: the merchant needs to see the
    // price move before a customer is quoted it.
    if (settings.autoRate && quote) {
      try {
        requireFresh(quote);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'the rate is stale — refresh it first');
        return;
      }
    }

    // Split: a percentage of this sale is billed to a second wallet, with its own address.
    // Both legs are ordinary invoices, so both obey the index rule.
    const leg2Wallet = split && splitWalletId && splitWalletId !== payee.id
      ? wallets.find((w) => w.id === splitWalletId)
      : null;
    const pct = (() => {
      const n = Number(splitPercent);
      if (!Number.isInteger(n) || n <= 0 || n >= 100) return 0n;
      return BigInt(n);
    })();
    const leg2Atoms = leg2Wallet && pct > 0n ? (chargeSats * pct) / 100n : 0n;
    if (leg2Atoms > 0n && leg2Atoms >= chargeSats) {
      setStatus('a split needs two positive amounts — adjust the percentage');
      return;
    }
    const primaryAtoms = chargeSats - leg2Atoms;

    if (settings.assist.rehearsal) {
      // A rehearsal shows the real QR and the real flow, but reserves no index and writes no
      // books: a practice sale must not become a sale. The first address is used because it is
      // already public to the merchant and nothing new is revealed.
      const now = new Date();
      setInvoice({
        id: `inv_rehearsal_${now.getTime().toString(36)}`,
        walletId: payee.id,
        walletLabel: payee.label,
        address: payee.firstAddress,
        index: null,
        amountAtoms: chargeSats,
        amountMinor: totals.roundedTotalMinor,
        currency: settings.currency,
        rateMinorPerCoin: parseRate(rate, settings.currency),
        rateAt: now.toISOString(),
        lines: [],
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        status: 'awaiting',
        seenAt: null,
        confirmedAt: null,
        manual: false,
        note: 'rehearsal',
      });
      setReceipt(null);
      setProof(null);
      setLeg2(null);
      setStatus('rehearsal — nothing is being watched and nothing will be recorded');
      return;
    }

    const book = ledger.book(payee.id);
    const lines = cart.map((l) => ({
      name: l.item.name,
      quantity: l.quantity,
      unitAtoms: l.item.priceCurrency === 'SATS' ? l.item.priceMinor : 0n,
      unitMinor: l.item.priceCurrency === 'SATS' ? 0n : l.item.priceMinor,
    }));

    try {
      const created = createInvoice({
        wallet: payee,
        book,
        amountAtoms: primaryAtoms,
        amountMinor: (totals.roundedTotalMinor * primaryAtoms) / chargeSats,
        currency: settings.currency,
        rateMinorPerCoin: parseRate(rate, settings.currency),
        lines,
        buildAddress: (index) => deriveForAccount(payee, index),
        note: tipJar ? `tip jar${staffId ? ` for ${settings.staff.find((s) => s.walletId === staffId)?.name ?? ''}` : ''}` : '',
      });
      // The address is about to reach a payer, so the index is burned now — not at
      // creation, so an abandoned cart never consumes one.
      ledger.setBook(payee.id, burnInvoiceIndex(created.invoice, created.book));
      ledger.putInvoice(created.invoice);
      setInvoice(created.invoice);
      setReceipt(null);
      setProof(null);
      setStatus('waiting');

      if (leg2Wallet && leg2Atoms > 0n) {
        const second = createInvoice({
          wallet: leg2Wallet,
          book: ledger.book(leg2Wallet.id),
          amountAtoms: leg2Atoms,
          amountMinor: totals.roundedTotalMinor - (totals.roundedTotalMinor * primaryAtoms) / chargeSats,
          currency: settings.currency,
          rateMinorPerCoin: parseRate(rate, settings.currency),
          buildAddress: (index) => deriveForAccount(leg2Wallet, index),
          note: `split with ${payee.label}`,
        });
        ledger.setBook(leg2Wallet.id, burnInvoiceIndex(second.invoice, second.book));
        ledger.putInvoice(second.invoice);
        setLeg2(second.invoice);
      } else {
        setLeg2(null);
      }

      publishToDisplay({
        kind: 'pay',
        uri: paymentUri('bitcoin', {
          address: created.invoice.address,
          amountSats: created.invoice.amountAtoms,
          label: payee.label,
        }),
        sats: created.invoice.amountAtoms.toString(),
        label: payee.label,
        status: 'awaiting',
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'could not create the invoice');
    }
  }

  const check = useCallback(
    async (target: Invoice) => {
      if (target.note === 'rehearsal') {
        setStatus('this is a rehearsal — no payment is expected and nothing is being watched');
        return;
      }
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
        publishToDisplay({
          kind: 'status',
          sats: updated.amountAtoms.toString(),
          label: updated.walletLabel,
          status: updated.status === 'complete' ? 'paid' : updated.status === 'seen' ? 'seen' : 'awaiting',
        });
        if (updated.status === 'complete' && leg2 && leg2.status !== 'complete') {
          // A split sale is not a sale until both legs are in. Say so rather than printing a
          // receipt for half a payment.
          try {
            const secondAccount = wallets.find((w) => w.id === leg2.walletId);
            const secondTarget = secondAccount ? targetFor(secondAccount.networkId, settings.explorerUrl) : null;
            if (secondTarget) {
              const secondActivity = await fetchAddressActivity(secondTarget, leg2.address);
              const secondNext = statusFromObservation(leg2, { activity: secondActivity });
              const secondUpdated = completeIfConfirmed(applyStatus(leg2, secondNext));
              ledger.putInvoice(secondUpdated);
              setLeg2(secondUpdated);
              if (secondUpdated.status !== 'complete') {
                setStatus('first wallet paid — waiting for the second leg');
                return;
              }
            }
          } catch {
            setStatus('first wallet paid — could not check the second leg');
            return;
          }
        }
        if (updated.status === 'complete') {
          // The day's anchor depends on the day digest, which is computed elsewhere; a receipt
          // made before the day is stamped carries a dash, and says so.
          const anchor = ledger.load().anchors.find((a) => a.date === updated.createdAt.slice(0, 10));
          setProof({
            id: updated.id,
            address: updated.address,
            amountAtoms: updated.amountAtoms,
            createdAt: updated.createdAt,
            dayDigestHex: anchor?.status === 'submitted' ? anchor.digestHex : null,
          });
          setReceipt(updated);
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'could not reach the explorer');
      }
    },
    [leg2, ledger, settings.explorerUrl, wallets],
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
    // A rehearsal never touches the books, even when the merchant confirms it.
    if (invoice.note !== 'rehearsal') ledger.putInvoice(updated);
    setInvoice(updated);
    const anchor = ledger.load().anchors.find((a) => a.date === updated.createdAt.slice(0, 10));
    setProof({
      id: updated.id,
      address: updated.address,
      amountAtoms: updated.amountAtoms,
      createdAt: updated.createdAt,
      dayDigestHex: anchor?.status === 'submitted' ? anchor.digestHex : null,
    });
    setReceipt(updated);
    publishToDisplay({ kind: 'status', sats: updated.amountAtoms.toString(), label: updated.walletLabel, status: 'paid' });
    await callAgent('slip:paid', { invoice: updated, manual: true });
  }

  async function finish() {
    if (receipt) {
      // Remember what was sold, so the next identical order is one tap. Local only.
      if (cart.length > 0 || custom.trim() !== '') {
        const sale: RepeatSale = {
          lines: cart.map((l) => toTabLine(l.item, l.quantity)),
          custom,
          totalMinor: receipt.amountMinor.toString(),
          at: new Date().toISOString(),
        };
        setLastSale(sale);
        window.localStorage.setItem(LAST_SALE_KEY, JSON.stringify(sale));
      }
      await callAgent('slip:paid', { invoice: receipt, manual: receipt.manual });
    }
    publishToDisplay({ kind: 'clear' });
    setProof(null);
    setReceipt(null);
    setInvoice(null);
    setCart([]);
    setCustom('');
    setTipJar(false);
    setStatus('');
    reload();
    // Every panel reads the same store: the books changed, so the footer seal and the day close
    // must recompute rather than showing the digest from before this sale.
    window.dispatchEvent(new Event('slip:data-changed'));
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
              entered
              {invoice.rateAt ? ` · rate read ${invoice.rateAt.slice(11, 16)} UTC` : ''}
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

        {leg2 && (
          <div className="mt-4 rounded-xl border border-line p-3" data-split-leg="2">
            <p className="eyebrow">Second leg · {leg2.walletLabel}</p>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <div
                className="h-40 w-40 shrink-0 rounded-lg bg-white p-1"
                dangerouslySetInnerHTML={{
                  __html: qrSvg(
                    paymentUri('bitcoin', {
                      address: leg2.address,
                      amountSats: leg2.amountAtoms,
                      label: leg2.walletLabel,
                    }),
                    4,
                  ),
                }}
              />
              <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
                <p className="figure text-sm text-ink">{formatSats(leg2.amountAtoms)}</p>
                <p>
                  {leg2.status === 'complete'
                    ? 'this leg is paid'
                    : leg2.status === 'seen'
                      ? 'seen in the mempool — not mined yet'
                      : 'waiting for payment'}
                </p>
                <p className="mt-1 break-all font-mono text-[10px]">{leg2.address}</p>
                <p className="mt-1 text-warn">
                  A split sale is one sale: the receipt appears when both legs are paid.
                </p>
              </div>
            </div>
          </div>
        )}

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
          {receipt.note === 'rehearsal'
            ? 'REHEARSAL — nothing was charged'
            : receipt.manual
              ? 'Marked paid by you'
              : 'Paid — seen on chain'}
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
              onClick={() => printReceipt(receipt, proof, settings.businessName, settings.receiptFooter)}
              className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted hover:text-ink"
            >
              print receipt
            </button>
          </div>
        </div>

        {proof && receipt.note !== 'rehearsal' && (
          <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3">
            <div
              className="h-28 w-28 rounded-lg bg-white p-1"
              dangerouslySetInnerHTML={{ __html: qrSvg(formatProof(proof), 4) }}
            />
            <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
              <p className="text-ink">Proof the customer keeps</p>
              <p className="mt-0.5">
                Scanning this shows the invoice, the address, the amount and — if the day was
                stamped — the day digest. It is a record, not a signature: slip holds no key that
                could sign one.
              </p>
              <p className="mt-1 break-all font-mono text-[10px]">{formatProof(proof)}</p>
            </div>
          </div>
        )}

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
    <section className="mt-6 panel" data-panel="till">
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
              {(tabs.length > 0 || repeatable(lastSale)) && (
            <div className="mt-3 flex flex-wrap items-center gap-1" data-tabs={tabs.length}>
              {tabs.map((tab) => (
                <span key={tab.id} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => resumeTab(tab)}
                    className="text-muted hover:text-ink"
                    title={`Resume ${tabLabel(tab)}`}
                  >
                    {tabLabel(tab)} · {formatFiat({ minor: tabSubtotalMinor(tab), currency: settings.currency })}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveTabs(closeTab(tabs, tab.id))}
                    aria-label={`Close ${tabLabel(tab)}`}
                    className="text-[10px] text-muted hover:text-bad"
                  >
                    ×
                  </button>
                </span>
              ))}
              {repeatable(lastSale) && (
                <button
                  type="button"
                  onClick={repeatLast}
                  className="rounded-full border border-accent px-2 py-1 text-[11px] uppercase tracking-wider text-accent"
                >
                  repeat last
                </button>
              )}
            </div>
          )}

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
              {(cart.length > 0 || custom.trim() !== '') && (
                <>
                  <button
                    type="button"
                    onClick={parkCurrent}
                    className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
                  >
                    park sale
                  </button>
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted"
                  >
                    clear cart
                  </button>
                </>
              )}
            </div>
          </div>

          {tipJar && settings.staff.length > 0 && (
            <label className="mt-2 block" htmlFor="tl-staff">
              <span className="eyebrow">Whose tips are these</span>
              <select
                id="tl-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
              >
                <option value="">the shop&apos;s wallet</option>
                {settings.staff
                  .filter((s) => wallets.some((w) => w.id === s.walletId))
                  .map((s) => (
                    <option key={s.walletId} value={s.walletId}>
                      {s.name} — their own wallet
                    </option>
                  ))}
              </select>
            </label>
          )}

          <label className="mt-2 flex items-start gap-2 text-xs" htmlFor="tl-split">
            <input
              id="tl-split"
              type="checkbox"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Split this sale across two wallets
              <span className="mt-0.5 block text-[10px] text-muted">
                Each leg gets its own address and its own QR. The receipt waits for both.
              </span>
            </span>
          </label>
          {split && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block" htmlFor="tl-split-wallet">
                <span className="eyebrow">Second wallet</span>
                <select
                  id="tl-split-wallet"
                  value={splitWalletId}
                  onChange={(e) => setSplitWalletId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">— choose —</option>
                  {wallets
                    .filter((w) => w.id !== walletId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block" htmlFor="tl-split-pct">
                <span className="eyebrow">Percent to the second wallet</span>
                <input
                  id="tl-split-pct"
                  value={splitPercent}
                  onChange={(e) => setSplitPercent(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
                />
              </label>
            </div>
          )}

          {rateNote && (
            <p className="mt-1 flex items-center gap-2 text-[10px] text-muted">
              {quote && settings.assist.freshnessRings && <FreshnessRing fetchedAt={quote.fetchedAt} />}
              <span>{rateNote}</span>
            </p>
          )}
          {sweepNote && <p className="mt-1 text-[10px] text-muted">Reconciliation: {sweepNote}</p>}

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
                ...(split
                  ? [['Split', `${splitPercent}% to ${wallets.find((w) => w.id === splitWalletId)?.label ?? '—'}`] as [string, string]]
                  : []),
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line px-2 py-1">
                  <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                  <dd className="figure mt-0.5 text-xs">
                {k === 'Charge' ? <Explain id="charge">{v}</Explain> : v}
              </dd>
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
              {settings.assist.rehearsal ? 'rehearse' : 'charge'} {chargeSats !== null ? formatSats(chargeSats) : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                const opened = openCustomerDisplay();
                setStatus(opened ? 'customer screen opened' : 'your browser blocked the second window — allow pop-ups for slip');
              }}
              className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
            >
              customer screen
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

/**
 * A printed receipt is paper, and paper is ink. This builds a white sheet with black text in its
 * own window instead of calling window.print() on the dark till, which would either waste a
 * cartridge or come out unreadable.
 */
function printReceipt(
  invoice: Invoice,
  proof: ReceiptProof | null,
  shopName: string,
  footer: string,
): void {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
  const at = (invoice.confirmedAt ?? invoice.createdAt).slice(0, 16).replace('T', ' ');
  const html = `<!doctype html><title>receipt ${esc(invoice.id)}</title>
<style>
  @page { margin: 10mm }
  body { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #000; background: #fff; margin: 0 }
  h1 { font-size: 15px; margin: 0 0 2px }
  .muted { color: #444 }
  hr { border: 0; border-top: 1px solid #000; margin: 8px 0 }
  .big { font-size: 20px; font-weight: 700; margin: 4px 0 }
  code { font-size: 10px; word-break: break-all }
  table { width: 100%; border-collapse: collapse }
  td { padding: 1px 0; vertical-align: top }
</style>
<h1>${esc(shopName || 'slip')}</h1>
<div class="muted">${esc(at)} UTC</div>
<hr>
<div class="big">${formatSats(invoice.amountAtoms)}</div>
<div>${esc(formatFiat({ minor: invoice.amountMinor, currency: invoice.currency }))}</div>
<hr>
<table>
  <tr><td>Invoice</td><td>${esc(invoice.id)}</td></tr>
  <tr><td>Wallet</td><td>${esc(invoice.walletLabel)}</td></tr>
  <tr><td>Address</td><td><code>${esc(invoice.address)}</code></td></tr>
  <tr><td>Index</td><td>${invoice.index === null ? 'fixed address' : `#${invoice.index}`}</td></tr>
  <tr><td>Status</td><td>${invoice.manual ? 'confirmed by a human' : 'observed by slip at the address above'}</td></tr>
</table>
${proof ? `<hr><div class="muted">Proof</div><code>${esc(formatProof(proof))}</code>` : ''}
<hr>
<div class="muted">${esc(footer || 'Thank you')}</div>
<div class="muted">slip · watch-only · no keys, no server</div>`;
  openPrintable(html, 'slip-receipt', 'width=380,height=620');
}

function parseFiatSafe(text: string, currency: string): bigint | null {
  try {
    return parseFiat(text, currency).minor;
  } catch {
    return null;
  }
}
