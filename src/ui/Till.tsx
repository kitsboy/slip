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
import { computeTotals, fiatToAtoms, formatCoinAmount, formatFiat, formatSats, parseFiat, parseRate } from '../core/money';
import { loadSettings } from '../core/settings';
import { fetchAddressActivity, targetFor } from '../core/providers/esplora';
import { paymentUri, renderQrSvg } from '../core/qr';
import { cancelInvoice, takingsToday } from '../core/orders';
import { formatProof, type ReceiptProof } from '../core/proof';
import { fetchRate, requireFresh, type RateQuote } from '../core/providers/rates';
import { publishToDisplay, openCustomerDisplay } from './CustomerDisplay';
import { closeTab, park, repeatable, tabLabel, tabSubtotalMinor, toTabLine, type ParkedTab, type RepeatSale } from '../core/tabs';
import FreshnessRing from './FreshnessRing';
import Explain from './Explain';
import { openPrintable } from './print';
import { paymentLabel } from '../core/brand';
import { registerDemoSale } from '../demo/fakeExplorer';
import { isDemo } from '../core/storage';
import Badge from './Badge';
import { isCompareStopped } from '../core/compare-stop';
import { resumeOpenSale } from '../core/resume-sale';
import { shortcutAllowed } from '../core/digit-guard';
import AddressText from './AddressText';
import { store as appStore } from '../core/storage';
import AwaitingStrip from './AwaitingStrip';
import OpenTill, { type OpenShift } from './OpenTill';
import ScanToCart from './ScanToCart';
import InfoVideo from './InfoVideo';
import AmountPad from './AmountPad';
import Failure from './Failure';
import ItemMark from './Mark';
import { announceOnce, cueForTransition, primeAudio } from '../core/sound';

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

function qrSvg(text: string, scale = 8): string {
  return renderQrSvg(text, { scale, margin: 4 });
}

export default function Till() {
  const [settings, setSettings] = useState(() => loadSettings(appStore()).settings);
  const [wallets, setWallets] = useState<CounterAccount[]>([]);
  const [walletId, setWalletId] = useState<string>('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [custom, setCustom] = useState('');
  const [tipJar, setTipJar] = useState(false);
  // The rate you last charged at. Offered back with its age on the face of it, never dressed up
  // as a live quote — a shop should not re-type a number it already decided, nor trust a stale one.
  const [rate, setRate] = useState(() => {
    try {
      const saved = appStore().getItem('rate:last');
      return saved ? (JSON.parse(saved) as { value: string }).value : '';
    } catch {
      return '';
    }
  });
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  const [status, setStatus] = useState<string>('');
  const [notice, setNotice] = useState('');
  const [compareStopped, setCompareStoppedFlag] = useState(() => isCompareStopped());
  useEffect(() => {
    const sync = () => setCompareStoppedFlag(isCompareStopped());
    window.addEventListener('slip:compare-stop', sync);
    return () => window.removeEventListener('slip:compare-stop', sync);
  }, []);
  const [online, setOnline] = useState(navigator.onLine);
  const [staffId, setStaffId] = useState<string>('');
  const [quote, setQuote] = useState<RateQuote | null>(null);
  const [rateFailed, setRateFailed] = useState<string | null>(null);
  /** The loading state of the price line. Without it a slow price source looks like a dead till. */
  const [rateBusy, setRateBusy] = useState(false);
  const [rateNote, setRateNote] = useState<string>(() => {
    try {
      const saved = appStore().getItem('rate:last');
      if (!saved) return '';
      const { at } = JSON.parse(saved) as { at?: string };
      if (!at) return 'you set this last time';
      const hours = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 3_600_000));
      return hours < 1 ? 'you set this less than an hour ago' : `you set this ${hours}h ago`;
    } catch {
      return '';
    }
  });
  const [proof, setProof] = useState<ReceiptProof | null>(null);
  /** A split sale's second leg: its own address, its own QR, its own status. */
  const [leg2, setLeg2] = useState<Invoice | null>(null);
  const [bigLeg, setBigLeg] = useState<1 | 2 | null>(null);
  const [split, setSplit] = useState(false);
  const [splitWalletId, setSplitWalletId] = useState('');
  const [splitPercent, setSplitPercent] = useState('50');
  const [sweepNote, setSweepNote] = useState<string>('');
  // When the till last looked. Shown on the payment screen: visible watching is the difference
  // between trust and "is it working?" — and it is a timestamp of a real request, not decoration.
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  /** Open sales, for the strip above the counter. Refreshed with the rest of the ledger. */
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  /** The shift, derived from the hashed log — never from a second store of its own. */
  const [shift, setShift] = useState<OpenShift | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<ParkedTab[]>(() => {
    try {
      return JSON.parse(appStore().getItem(TABS_KEY) ?? '[]') as ParkedTab[];
    } catch {
      return [];
    }
  });
  const [lastSale, setLastSale] = useState<RepeatSale | null>(() => {
    try {
      return JSON.parse(appStore().getItem(LAST_SALE_KEY) ?? 'null') as RepeatSale | null;
    } catch {
      return null;
    }
  });
  const poller = useRef<number | null>(null);
  const focusSearch = useRef(false);

  const ledger = useMemo<LedgerRepository>(() => createLedger(appStore()), []);
  const wallet = wallets.find((w) => w.id === walletId) ?? null;

  /** The coin a given wallet takes, falling back to the counter's own wallet. */
  const coinOf = (id?: string) => wallets.find((w) => w.id === id)?.coin ?? wallet?.coin ?? 'btc';

  const reload = useCallback(() => {
    const accounts = createRepository(appStore()).load().accounts;
    setWallets(accounts);
    setWalletId((current) => current || (accounts.find((a) => statusOf(a) === 'ready')?.id ?? ''));
    const l = ledger.load();
    setItems(l.items);
    setInvoices(l.invoices);
  }, [ledger]);

  /**
   * The till is open when the last event for the active counter today is `open` or `handoff`.
   * Derived from the hashed log rather than kept beside it: a second copy of "is the till open"
   * is a second thing that can disagree with the books.
   */
  const loadShift = useCallback(() => {
    const repo = createRepository(appStore());
    const account = repo.active();
    if (!account) {
      setShift(null);
      return;
    }
    const log = repo.shifts();
    const today = new Date().toISOString().slice(0, 10);
    const events = log.events.filter((e) => e.accountId === account.id && e.at.slice(0, 10) === today);
    const last = events[events.length - 1];
    if (!last || (last.kind !== 'open' && last.kind !== 'handoff')) {
      setShift(null);
      return;
    }
    const counted = last.detail?.match(/float\s+(\d+)/i)?.[1];
    setShift({
      staff: last.staff ?? 'unassigned',
      since: last.at,
      floatMinor: counted ? BigInt(counted) : null,
    });
  }, []);

  useEffect(() => {
    loadShift();
    const onChanged = () => loadShift();
    window.addEventListener('slip:data-changed', onChanged);
    return () => window.removeEventListener('slip:data-changed', onChanged);
  }, [loadShift]);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    const onSettings = () => setSettings(loadSettings(appStore()).settings);
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

  // A reload used to forget the sale. The books still hold it, and the strip above the
  // till is how it is reopened. Opening the pay screen here hid the till, so the page
  // had no counter. The customer screen still gets the same code back.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const found = resumeOpenSale(ledger.load().invoices);
    if (!found) return;
    const shop = loadSettings(appStore()).settings;
    publishToDisplay({
      kind: 'pay',
      uri: paymentUri('bitcoin', {
        address: found.primary.address,
        amountSats: found.primary.amountAtoms,
        label: paymentLabel(found.primary.walletLabel, shop.signature),
      }),
      uri2: found.second
        ? paymentUri('bitcoin', {
            address: found.second.address,
            amountSats: found.second.amountAtoms,
            label: found.second.walletLabel,
          })
        : undefined,
      sats: found.primary.amountAtoms.toString(),
      sats2: found.second ? found.second.amountAtoms.toString() : undefined,
      label: found.primary.walletLabel,
      status: 'awaiting',
      shop: shop.businessName,
    });
  }, [ledger]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('slip-display');
    } catch {
      return;
    }
    channel.onmessage = (e: MessageEvent<{ kind?: string }>) => {
      if (e.data?.kind !== 'hello') return;
      const found = resumeOpenSale(ledger.load().invoices);
      if (!found) return;
      const shop = loadSettings(appStore()).settings;
      publishToDisplay({
        kind: 'pay',
        uri: paymentUri('bitcoin', {
          address: found.primary.address,
          amountSats: found.primary.amountAtoms,
          label: paymentLabel(found.primary.walletLabel, shop.signature),
        }),
        uri2: found.second
          ? paymentUri('bitcoin', {
              address: found.second.address,
              amountSats: found.second.amountAtoms,
              label: found.second.walletLabel,
            })
          : undefined,
        sats: found.primary.amountAtoms.toString(),
        sats2: found.second ? found.second.amountAtoms.toString() : undefined,
        label: found.primary.walletLabel,
        status: 'awaiting',
        shop: shop.businessName,
      });
    };
    return () => channel?.close();
  }, [ledger]);

  /**
   * Offline reconciliation lives in the app shell now (src/ui/Watcher.tsx): it sweeps on load, on
   * reconnect, on tab focus and on a timer, so a sale is spotted from any panel. The till only
   * shows what the watcher found — one poller, not two racing the same invoices.
   */
  useEffect(() => {
    const onSwept = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string') setSweepNote(detail);
    };
    window.addEventListener('slip:swept', onSwept);
    return () => window.removeEventListener('slip:swept', onSwept);
  }, []);

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
    setRateBusy(true);
    const current = entry;
    current.promise
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setRate((prev) => prev.trim() || (Number(q.minorPerCoin) / 100).toFixed(2));
        setRateFailed(null);
        setRateBusy(false);
        setRateNote(`fetched ${q.fetchedAt.slice(11, 16)} UTC from ${q.source}`);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A failed fetch must not stay cached as a failure: the next attempt deserves a try.
        RATE_CACHE.delete(key);
        setQuote(null);
        setRateFailed(e instanceof Error ? e.message : 'the rate service did not answer');
        setRateBusy(false);
        setRateNote('');
      });

    return () => {
      cancelled = true;
    };
  }, [settings.autoRate, settings.currency, settings.rateEndpoint, wallet?.coin]);

  const visible = useMemo(() => {
    const filtered = category === 'All' ? items : items.filter((i) => i.category === category);
    return searchItems(filtered, query);
  }, [items, category, query]);

  useEffect(() => {
    if (query.trim() === '') return;
    const tile = document.querySelector('[data-panel="till"] .v2-tile');
    if (!(tile instanceof HTMLElement)) return;
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    tile.classList.add('v2-jump');
    const id = window.setTimeout(() => tile.classList.remove('v2-jump'), 280);
    return () => window.clearTimeout(id);
  }, [query, visible]);

  useEffect(() => {
    if (focusSearch.current && !receipt && !invoice) {
      focusSearch.current = false;
      document.getElementById('tl-search')?.focus();
      return;
    }
    if (receipt) {
      document.getElementById('tl-next')?.focus();
      return;
    }
    if (!invoice) return;
    const check = document.getElementById('tl-check');
    check?.focus({ preventScroll: true });
    document.querySelector('#tl-pay .v2-qr, #tl-pay .v2-split-codes')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [invoice?.id, receipt?.id]);

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

  // Removing a line completely is destructive, so it leaves a way back for a moment.
  const [undone, setUndone] = useState<{ item: CatalogItem; quantity: number } | null>(null);
  const [padOpen, setPadOpen] = useState(false);

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
    appStore().setItem(TABS_KEY, JSON.stringify(next));
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

  // A demo shop has no rate to type and nobody to ask: prefill a plausible one so the walkthrough
  // reaches a QR in two taps. It is still an ordinary, visible, editable field.
  useEffect(() => {
    // Matches the simulated quote, so the figure on screen is the figure that would be charged.
    if (isDemo && rate.trim() === '') setRate('94000.00');
  }, [rate]);

  function charge() {
    // Before the sale exists, remember the rate it was priced at — with the moment, so next time
    // the screen can say how old it is instead of implying it is fresh.
    try {
      const trimmed = rate.trim();
      if (trimmed) appStore().setItem('rate:last', JSON.stringify({ value: trimmed, at: new Date().toISOString() }));
    } catch {
      /* private mode: the rate simply is not remembered */
    }
    // Browsers only allow audio after a gesture. Prime it on the press that starts the sale, so the
    // cue that matters later is not the one the browser refuses.
    primeAudio();
    // In tip-jar mode a named staff member's own wallet takes the money, so their tips land in
    // their wallet and not the shop's. It is the same watch-only rule either way.
    const payee = tipJar && staffId ? (wallets.find((w) => w.id === staffId) ?? wallet) : wallet;
    if (!payee || !totals || chargeSats === null) return;
    if (compareStopped) {
      setStatus('The addresses did not match. Open Setup and check address 0/0. slip will not take a sale until they match.');
      return;
    }

    // Nobody should have to open the till before their first customer. Not awaited: the sale is the
    // important thing, and the log line is written beside it.
    void ensureShiftOpen();

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
      // In the demo the explorer is simulated: it needs to know the amount so it can "confirm"
      // after a few seconds and the walkthrough can show the whole sequence.
      if (isDemo) registerDemoSale(created.invoice.address, created.invoice.amountAtoms);
      setInvoice(created.invoice);
      setReceipt(null);
      setProof(null);
      setStatus('waiting');

      let secondInvoice: Invoice | null = null;
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
        // Both legs are real addresses to the payer, so both must be registered: an unregistered
        // leg used to fall back to a made-up 100,000 sats, or hang for ever on 'waiting'.
        if (isDemo) registerDemoSale(second.invoice.address, second.invoice.amountAtoms);
        secondInvoice = second.invoice;
        setLeg2(second.invoice);
      } else {
        setLeg2(null);
      }

      publishToDisplay({
        kind: 'pay',
        uri: paymentUri('bitcoin', {
          address: created.invoice.address,
          amountSats: created.invoice.amountAtoms,
          label: paymentLabel(payee.label, settings.signature),
        }),
        uri2: secondInvoice
          ? paymentUri('bitcoin', {
              address: secondInvoice.address,
              amountSats: secondInvoice.amountAtoms,
              label: secondInvoice.walletLabel,
            })
          : undefined,
        sats: created.invoice.amountAtoms.toString(),
        sats2: secondInvoice ? secondInvoice.amountAtoms.toString() : undefined,
        label: payee.label,
        status: 'awaiting',
        shop: settings.businessName,
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
        setCheckedAt(Date.now());
        const next = statusFromObservation(target, { activity });
        const updated = completeIfConfirmed(applyStatus(target, next));
        // A cue is a courtesy, never evidence: nothing about the invoice changes here.
        const cue = cueForTransition(target.status, updated.status);
        if (cue) announceOnce(updated.id, cue, { enabled: settings.assist.soundOnPayment });
        ledger.putInvoice(updated);
        setInvoice((cur) => (cur && cur.id === updated.id ? updated : cur));
        const bothIn = !leg2 || leg2.status === 'complete';
        const displayPaid = updated.status === 'complete' && bothIn;
        publishToDisplay({
          kind: 'status',
          uri: paymentUri('bitcoin', {
            address: updated.address,
            amountSats: updated.amountAtoms,
            label: paymentLabel(updated.walletLabel, settings.signature),
          }),
          uri2: leg2
            ? paymentUri('bitcoin', {
                address: leg2.address,
                amountSats: leg2.amountAtoms,
                label: leg2.walletLabel,
              })
            : undefined,
          sats: updated.amountAtoms.toString(),
          sats2: leg2 ? leg2.amountAtoms.toString() : undefined,
          label: updated.walletLabel,
          status: displayPaid ? 'paid' : updated.status === 'seen' ? 'seen' : 'awaiting',
          shop: settings.businessName,
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
                setStatus(`${updated.walletLabel} is in. ${secondUpdated.walletLabel} is still waiting. The sale is not paid.`);
                return;
              }
            }
          } catch {
            setStatus(`${updated.walletLabel} is in. ${leg2.walletLabel} could not be checked, so this sale is not paid.`);
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
    [leg2, ledger, settings.explorerUrl, settings.assist.soundOnPayment, wallets],
  );

  async function openTill(staffName: string, floatMinor: bigint | null) {
    setShiftBusy(true);
    setShiftError(null);
    try {
      const repo = createRepository(appStore());
      const account = repo.active();
      if (!account) throw new Error('no counter chosen yet — add one in Setup first');
      await repo.recordShift(
        'open',
        account,
        staffName,
        `float ${floatMinor === null ? 'none' : floatMinor.toString()}`,
      );
      loadShift();
      window.dispatchEvent(new Event('slip:data-changed'));
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : 'could not open the till');
    } finally {
      setShiftBusy(false);
    }
  }

  /** Renaming who holds the till is a hand-off line, so the log keeps both names and both times. */
  async function sayWhoIsOn(staffName: string) {
    setShiftBusy(true);
    setShiftError(null);
    try {
      const repo = createRepository(appStore());
      const account = repo.active();
      if (!account) throw new Error('no counter chosen yet');
      await repo.recordShift('handoff', account, staffName, 'named on the counter');
      loadShift();
      window.dispatchEvent(new Event('slip:data-changed'));
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : 'could not record who is on');
    } finally {
      setShiftBusy(false);
    }
  }

  async function closeTill() {
    setShiftBusy(true);
    setShiftError(null);
    try {
      const repo = createRepository(appStore());
      const account = repo.active();
      if (!account) throw new Error('no counter chosen yet');
      await repo.recordShift('return', account, shift?.staff ?? null, 'till closed from the counter');
      loadShift();
      window.dispatchEvent(new Event('slip:data-changed'));
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : 'could not close the till');
    } finally {
      setShiftBusy(false);
    }
  }

  /**
   * The first sale of the day opens the till.
   *
   * The shift log needs a beginning or the day cannot be reconciled — but making a shopkeeper press
   * "Open the till" before their first customer is a step that exists for the books, not for them.
   * So the first Charge writes the `open` line itself and names it plainly; the counter card then
   * offers the one thing the shop may still want to say, which is who is on.
   */
  async function ensureShiftOpen(): Promise<void> {
    if (shift) return;
    const repo = createRepository(appStore());
    const account = repo.active();
    if (!account) return;
    try {
      await repo.recordShift('open', account, repo.currentStaff() ?? 'unassigned', 'opened by the first sale of the day');
      loadShift();
      window.dispatchEvent(new Event('slip:data-changed'));
    } catch {
      /* a sale must never fail because the log entry did */
    }
  }

  /**
   * Counter shortcuts: `/` search, `c` charge, `n` next sale, `p` print. Letter keys only, and
   * never while a field has focus — someone typing a customer's name must not fire a sale.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const typing =
        el !== null &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (event.key === 'Escape') {
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
        if (!invoice || receipt) return;
        event.preventDefault();
        if (bigLeg) {
          setBigLeg(null);
          setNotice('Showing both codes.');
          return;
        }
        abandon();
        return;
      }
      if (!shortcutAllowed(event.key, typing)) return;

      if (event.key === '/') {
        const field = document.getElementById('tl-search');
        if (!field) return;
        event.preventDefault();
        field.focus();
        return;
      }
      if (!receipt) return;
      if (event.key === 'n') {
        event.preventDefault();
        void finish();
      }
      if (event.key === 'p') {
        event.preventDefault();
        printReceipt(receipt, proof, settings.businessName, settings.receiptFooter);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receipt, proof, settings.businessName, settings.receiptFooter, invoice, bigLeg]);

  // Poll only while a payment screen is open. Never in the background: a till that chatters
  // to an explorer while idle is a privacy leak with no benefit.
  useEffect(() => {
    if (poller.current) window.clearInterval(poller.current);
    if (!invoice || invoice.status === 'complete') return;
    poller.current = window.setInterval(
      () => {
        void check(invoice);
      },
      isDemo ? 2_000 : POLL_MS,
    );
    return () => {
      if (poller.current) window.clearInterval(poller.current);
    };
  }, [invoice, check]);

  useEffect(() => {
    if (!invoice || invoice.status === 'complete') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1_000);
    return () => window.clearInterval(t);
  }, [invoice]);

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
    setLeg2(null);
    setBigLeg(null);
    setStatus('');
    setNotice('Sale cancelled. Nothing was paid.');
    // A cancelled sale leaves the strip at once; a "waiting" line for a dead invoice is a lie.
    setInvoices(ledger.load().invoices);
    window.dispatchEvent(new CustomEvent('slip:books'));
  }

  async function markPaid() {
    if (!invoice) return;
    const updated = markManualPaid(invoice);
    // A rehearsal never touches the books, even when the merchant confirms it.
    if (invoice.note !== 'rehearsal') ledger.putInvoice(updated);
    setInvoice(updated);
    if (leg2 && leg2.status !== 'complete') {
      setStatus(`${updated.walletLabel} is marked by you. ${leg2.walletLabel} is still waiting. The sale is not paid.`);
      publishToDisplay({
        kind: 'status',
        uri: paymentUri('bitcoin', {
          address: updated.address,
          amountSats: updated.amountAtoms,
          label: paymentLabel(updated.walletLabel, settings.signature),
        }),
        sats: updated.amountAtoms.toString(),
        label: updated.walletLabel,
        status: 'awaiting',
        shop: settings.businessName,
        uri2: paymentUri('bitcoin', {
          address: leg2.address,
          amountSats: leg2.amountAtoms,
          label: leg2.walletLabel,
        }),
        sats2: leg2.amountAtoms.toString(),
      });
      return;
    }
    announceOnce(updated.id, 'paid', { enabled: settings.assist.soundOnPayment });
    const anchor = ledger.load().anchors.find((a) => a.date === updated.createdAt.slice(0, 10));
    setProof({
      id: updated.id,
      address: updated.address,
      amountAtoms: updated.amountAtoms,
      createdAt: updated.createdAt,
      dayDigestHex: anchor?.status === 'submitted' ? anchor.digestHex : null,
    });
    setReceipt(updated);
    publishToDisplay({
      kind: 'status',
      uri: paymentUri('bitcoin', {
        address: updated.address,
        amountSats: updated.amountAtoms,
        label: paymentLabel(updated.walletLabel, settings.signature),
      }),
      sats: updated.amountAtoms.toString(),
      label: updated.walletLabel,
      status: leg2 && leg2.status !== 'complete' ? 'awaiting' : 'paid',
      shop: settings.businessName,
      uri2: leg2
        ? paymentUri('bitcoin', {
            address: leg2.address,
            amountSats: leg2.amountAtoms,
            label: leg2.walletLabel,
          })
        : undefined,
      sats2: leg2 ? leg2.amountAtoms.toString() : undefined,
    });
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
        appStore().setItem(LAST_SALE_KEY, JSON.stringify(sale));
      }
      await callAgent('slip:paid', { invoice: receipt, manual: receipt.manual });
    }
    publishToDisplay({ kind: 'clear' });
    setProof(null);
    setReceipt(null);
    setInvoice(null);
    setLeg2(null);
    setBigLeg(null);
    setCart([]);
    setCustom('');
    setTipJar(false);
    setStatus('');
    setNotice('');
    focusSearch.current = true;
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
      label: paymentLabel(invoice.walletLabel, settings.signature),
    });
    const pending = invoice.status === 'awaiting' || invoice.status === 'seen';
    const shown = bigLeg === 2 && leg2 ? leg2 : invoice;
    const waitingLine = !leg2
      ? ''
      : invoice.status === 'complete' && leg2.status !== 'complete'
        ? `${invoice.walletLabel} is in. ${leg2.walletLabel} is still waiting. The sale is not paid.`
        : leg2.status === 'complete' && invoice.status !== 'complete'
          ? `${leg2.walletLabel} is in. ${invoice.walletLabel} is still waiting. The sale is not paid.`
          : `${invoice.walletLabel} is waiting. ${leg2.walletLabel} is waiting. The sale is not paid until both are in.`;
    const legWords = (item: Invoice) =>
      item.status === 'complete'
        ? 'this wallet is in — the sale is not paid yet'
        : item.status === 'seen'
          ? 'seen on its way — not confirmed yet'
          : 'waiting — not paid';
    const legUri = (item: Invoice) =>
      paymentUri('bitcoin', {
        address: item.address,
        amountSats: item.amountAtoms,
        label: item.walletLabel,
      });
    return (
      <section className={`mt-6 panel v2-pay`} id="tl-pay" tabIndex={-1}>
        {/* Said out loud, once, for anyone listening rather than looking: a screen-reader user gets the
            same news a sighted one does the moment the screen changes, instead of having to hunt for it. */}
        <p className="sr-only" role="status" aria-live="polite" data-sale-announcer>
          {invoice.status === 'complete'
            ? `Paid. ${formatSats(shown.amountAtoms)} is in at ${shown.walletLabel}.`
            : invoice.status === 'seen'
              ? `Seen on its way, not confirmed yet. ${formatSats(shown.amountAtoms)} at ${shown.walletLabel}.`
              : `${leg2 ? waitingLine : `Waiting to be paid, ${formatSats(invoice.amountAtoms)} at ${invoice.walletLabel}. The code is on screen.`}`}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Payment</p>
          <span className={`chip ${pending ? 'border-warn text-warn' : 'chip-good'}`}>
            {invoice.status === 'awaiting' ? 'waiting for payment' : invoice.status === 'seen' ? 'seen on its way — not confirmed yet' : invoice.status}
          </span>
        </div>
        <h2 className="panel-title mt-1">Pay exactly</h2>
        <p
          className={[
            'figure mt-1 text-[2.5rem] font-bold leading-none tabular-nums',
            'v2-engrave',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {formatCoinAmount(shown.amountAtoms, coinOf(shown.walletId))}
        </p>
        {<span className="v2-rule" aria-hidden />}
        {(wallet?.source === 'xpub' || wallet?.source === 'descriptor') && (
          <p className="mt-1 text-sm text-ink">
            HD wallet. Address #{invoice.index ?? 0} comes from your public code. Each sale gets the next one. slip cannot spend it.
          </p>
        )}
        {leg2 && (
          <p className="v2-wait-line mt-1 text-base text-ink" data-split-wait>
            {waitingLine} The second leg is {leg2.walletLabel}. A split sale is one sale: the receipt appears when both legs are paid.
          </p>
        )}
        <p className="mt-1 text-sm text-secondary">
          {checkedAt === null
            ? 'watching — the first check is on its way'
            : `checked ${Math.max(0, Math.round((Date.now() - checkedAt) / 1000))}s ago · it keeps looking`}
        </p>

        {notice && (
          <p className="v2-notice" data-cancelled>
            {notice}
          </p>
        )}
        {leg2 ? (
          bigLeg ? (
            <div className="v2-split-big" data-split-big={bigLeg}>
              <p className="v2-split-who">{shown.walletLabel}</p>
              <div className="v2-qr">
                <div className="v2-qr-box" dangerouslySetInnerHTML={{ __html: qrSvg(legUri(shown), 8) }} />
              </div>
              <p className="v2-split-wait">{legWords(shown)}</p>
              <p className="text-base text-ink">
                {shown.index === null
                  ? 'This wallet has ONE fixed address; it is reused for every sale.'
                  : `Address #${shown.index} for this sale. Do not pay it twice.`}
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => setBigLeg(null)}>
                Show both codes
              </button>
            </div>
          ) : (
          <div className="v2-split-codes">
            <article>
              <button type="button" className="v2-code-btn" onClick={() => setBigLeg(1)} aria-label={`Show ${invoice.walletLabel} large`}>
                <p className="text-sm text-ink">{invoice.walletLabel} · {formatCoinAmount(invoice.amountAtoms, coinOf(invoice.walletId))}</p>
                <div className="v2-qr">
                  <div className="v2-qr-box" dangerouslySetInnerHTML={{ __html: qrSvg(uri, 8) }} />
                </div>
                <p>{legWords(invoice)}</p>
              </button>
            </article>
            <article data-split-leg="2">
              <button type="button" className="v2-code-btn" onClick={() => setBigLeg(2)} aria-label={`Show ${leg2.walletLabel} large`}>
                <p className="text-sm text-ink">{leg2.walletLabel} · {formatCoinAmount(leg2.amountAtoms, coinOf(leg2.walletId))}</p>
                <div className="v2-qr">
                  <div className="v2-qr-box" dangerouslySetInnerHTML={{ __html: qrSvg(legUri(leg2), 8) }} />
                </div>
                <p>{legWords(leg2)}</p>
              </button>
            </article>
            <p className="v2-split-hint">Tap a code to fill the screen.</p>
          </div>
          )
        ) : (
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className={`relative shrink-0 rounded-2xl bg-white p-4 v2-qr`}>
            <div
              className="v2-qr-box"
              dangerouslySetInnerHTML={{ __html: qrSvg(uri, 8) }}
            />
            <span aria-hidden className="pointer-events-none absolute -left-1 -top-1 h-4 w-4 border-l-2 border-t-2 border-accent" />
            <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 h-4 w-4 border-r-2 border-t-2 border-accent" />
            <span aria-hidden className="pointer-events-none absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-accent" />
            <span aria-hidden className="pointer-events-none absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-muted">
              Scan with any Bitcoin wallet, or copy the address. slip is watching this address on{' '}
              <span className="text-ink">{invoice.walletLabel}</span>.
            </p>
            <p className="mt-2 break-all rounded-lg border border-line bg-bg p-2 font-mono text-[11px]">
              <AddressText address={invoice.address} />
            </p>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(invoice.address)}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink"
            >
              copy address
            </button>

            <p className="mt-3 text-xs leading-relaxed text-warn">
              · Pay the exact amount, on the <span className="text-ink">{wallet?.networkId}</span> network.
              {!online && <span className="text-bad"> · Offline: detection paused, money is not lost.</span>}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {invoice.index === null
                ? 'This wallet has ONE fixed address; it is reused for every sale.'
                : `Address #${invoice.index} for this sale. Do not pay it twice.`}
            </p>
            <details className="mt-2 text-[11px] leading-relaxed text-muted">
              <summary className="cursor-pointer">The rest of the small print</summary>
              <ul className="mt-1 space-y-1">
                <li>· A different amount cannot be matched to this sale.</li>
                <li>· An invoice is good for 15 minutes; a late payment is judged, not assumed.</li>
              </ul>
            </details>

            <p className="mt-2 text-[11px] text-muted">
              {formatFiat({ minor: invoice.amountMinor, currency: invoice.currency })} at the rate you
              entered
              {invoice.rateAt ? ` · rate read ${invoice.rateAt.slice(11, 16)} UTC` : ''}
            </p>
          </div>
        </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void check(invoice)}
            id="tl-check"
            className="btn btn-secondary"
          >
            Check now
          </button>
          <button
            type="button"
            onClick={() => void markPaid()}
            className="btn btn-ghost"
          >
            I have the money (manual)
          </button>
          <button
            type="button"
            onClick={abandon}
            className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
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
              <section className="v2-receipt">
        {/* The same news, spoken. 'Marked paid by you' and 'seen on chain' are different claims, and a
            screen-reader user must hear which one it is — not just that something finished. */}
        <p className="sr-only" role="status" aria-live="polite" data-sale-announcer>
          {receipt.manual
            ? `Marked paid by you. ${formatSats(receipt.amountAtoms)}. slip did not observe this payment.`
            : receipt.note === 'rehearsal'
              ? 'Rehearsal finished. Nothing was charged.'
              : `Paid — seen on chain. ${formatSats(receipt.amountAtoms)}.`}
        </p>
        <div
          className={['flex items-start justify-between gap-3', 'v2-receipt-head']
            .filter(Boolean)
            .join(' ')}
        >
          <div>
            <p className="eyebrow">Receipt</p>
            <p
              className={[
                'figure mt-1 text-[2rem] font-bold leading-none tabular-nums',
                'v2-paid-figure',
                'v2-engrave',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {formatSats(receipt.amountAtoms)}
            </p>
            {<span className="v2-rule v2-rule-tight" aria-hidden />}
            <p className="mt-1 text-xs text-muted">
              <span className="v2-yours">{settings.businessName || 'Your shop'}</span>
              {' · '}
              {formatFiat({ minor: receipt.amountMinor, currency: receipt.currency })} ·{' '}
              {receipt.confirmedAt?.slice(0, 16).replace('T', ' ')}
            </p>
          </div>
          {
            <span className="shrink-0">
              <Badge
                kind={receipt.note === 'rehearsal' ? 'simulated' : receipt.manual ? 'manual' : 'good'}
                word={
                  receipt.note === 'rehearsal'
                    ? 'rehearsal'
                    : receipt.manual
                      ? 'marked paid by you'
                      : 'seen on chain'
                }
              />
            </span>
          }
        </div>
        <h2
          className={`mt-2 text-sm font-semibold v2-paid${
            receipt.note !== 'rehearsal' && !receipt.manual ? ' v2-yours' : ''
          }`}
        >
          {receipt.note === 'rehearsal'
            ? 'REHEARSAL — nothing was charged'
            : receipt.manual
              ? 'Marked paid by you'
              : 'Paid — seen on chain'}
        </h2>
        {receipt.index !== null && (
          <p className={`mt-2 text-sm font-semibold text-ink v2-next-address`}>
            This sale was address #{receipt.index}. Next sale uses address #{ledger.book(receipt.walletId).next}.
          </p>
        )}

        <div
          className={['mt-3 flex flex-wrap items-start gap-3', 'v2-receipt-body']
            .filter(Boolean)
            .join(' ')}
        >
          <div
            className="v2-receipt-qr"
            dangerouslySetInnerHTML={{ __html: qrSvg(proofUri, 5) }}
          />
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
            <p className="break-all font-mono">
              <AddressText address={receipt.address} />
            </p>
            <p className="mt-1">
              {receipt.manual
                ? 'This receipt records a manual confirmation. slip did not observe a payment.'
                : 'slip observed this payment at this address.'}
            </p>
            <p className="mt-1">
              Invoice {receipt.id} · wallet {receipt.walletLabel}
              {receipt.index !== null ? ` · index #${receipt.index}` : ' · fixed address'}
            </p>
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
              <p className="mt-1 break-all font-mono text-[11px]">{formatProof(proof)}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 pb-1">
          <button type="button" id="tl-next" onClick={() => void finish()} className={`btn btn-primary v2-charge`}>
            Next sale
          </button>
          <button
            type="button"
            onClick={() => printReceipt(receipt, proof, settings.businessName, settings.receiptFooter)}
            className="btn btn-secondary"
          >
            Print receipt
          </button>
          <button
            type="button"
            onClick={() => printReceipt(receipt, proof, settings.businessName, settings.receiptFooter, 'a4')}
            className="btn btn-secondary"
          >
            Print on A4
          </button>
          <span className="text-[11px] text-muted">
            Saved in Books{receipt.confirmedAt ? ` — ${receipt.confirmedAt.slice(0, 10)}` : ''}
          </span>
        </div>
      </section>
    );
  }

  // --- sale building --------------------------------------------------------
  const cats = ['All', ...categories(items)];
  const walletTakings = wallet ? takingsToday(ledger.load().invoices, wallet.id) : 0n;

  return (
    <section className="mt-6 panel" data-panel="till">
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1${wallets.length === 0 ? ' v2-open-status' : ''}`}>
        <p className="eyebrow">Till</p>
        <span className={`badge ${online ? 'badge-pending' : 'badge-bad'} v2-watch`}>
          {online ? 'Watching for payments' : 'Offline — not watching'}
          {(wallet?.source === 'xpub' || wallet?.source === 'descriptor') &&
            ` · next address #${ledger.book(wallet.id).next}`}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <h2 className="panel-title">Take a payment</h2>
        <InfoVideo
          src="videos/02-take-a-payment.mp4"
          poster="videos/02-take-a-payment.jpg"
          title="Taking a payment"
          seconds={11}
        />
      </div>

      <AwaitingStrip
        invoices={invoices}
        onOpen={(prior) => {
          setReceipt(null);
          setInvoice(prior);
          setStatus('picked the sale back up');
        }}
      />

      {wallets.length > 0 && (
        <OpenTill
          staff={settings.staff.map((person) => person.name)}
          shift={shift}
          counter={wallet?.label ?? ''}
          currency={settings.currency}
          busy={shiftBusy}
          error={shiftError}
          onOpen={openTill}
          onClose={closeTill}
          onHandoff={sayWhoIsOn}
        />
      )}

      {wallets.length === 0 ? (
        <p className="mt-3 rounded-lg border border-warn p-3 text-xs text-warn">
          Tell slip where to send the money first — under <span className="font-semibold">Setup → Wallets</span>.
        </p>
      ) : (
        <>
          {/* On a shop laptop the counter is two panes: choose and ring up on the left, the money
              and the Charge press on the right, held in place while the list scrolls (D-83). */}
          <div className={`lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 v2-two`}>
          <div className={`min-w-0 v2-sale`}>
          <div className={`mt-3 grid gap-2 sm:grid-cols-2 v2-wallet-row`}>
            <label className="block" htmlFor="tl-wallet">
              <span className="eyebrow">Which wallet gets the money</span>
              <select
                id="tl-wallet"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} disabled={statusOf(w) !== 'ready'}>
                    {w.label}
                    {w.networkId === 'btc-mainnet' ? '' : ` · ${w.networkId}`}
                    {statusOf(w) !== 'ready' ? ' (not checked yet)' : ''}
                  </option>
                ))}
              </select>
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
                    className="rounded-lg border border-accent px-3 py-2 text-xs text-accent"
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
                    className="text-[11px] text-muted hover:text-bad"
                  >
                    ×
                  </button>
                </span>
              ))}
              {repeatable(lastSale) && (
                <button
                  type="button"
                  onClick={repeatLast}
                  className="rounded-full border border-accent px-2 py-1 text-xs text-accent"
                >
                  repeat last
                </button>
              )}
            </div>
          )}

          <div className={`mt-3 flex flex-wrap gap-1 v2-cats`}>
                {cats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    tabIndex={2}
                    className={`rounded-full border px-3 text-[11px] ${category === c ? 'border-accent text-accent' : 'border-line text-muted'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className={`mt-2 flex flex-wrap items-start gap-2 v2-find`}>
                {notice && (
                  <p className="v2-notice w-full text-base text-ink" data-cancelled>
                    {notice}
                  </p>
                )}
                <input
                  id="tl-search"
                  tabIndex={1}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const first = visible[0];
                    if (first) addLine(first);
                    window.setTimeout(() => {
                      const charge = document.getElementById('tl-charge') as HTMLButtonElement | null;
                      if (charge && !charge.disabled) charge.focus();
                      else document.getElementById('tl-rate')?.focus();
                    }, 0);
                  }}
                  placeholder="search items"
                  aria-label="Search items"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
                />
                <ScanToCart
                  items={items}
                  currency={settings.currency}
                  onPick={addLine}
                  onAmount={(raw) => {
                    setCustom(raw);
                    setStatus('amount from the scan is in the custom field — check it, then charge');
                  }}
                />
              </div>
              {items.length > 0 && visible.length === 0 && (
                // A search that matches nothing used to leave blank space where the shelf should be:
                // the till looked broken rather than empty-handed. Say what was searched for, and
                // offer the one thing that helps — everything back on the shelf.
                <div className="mt-3 rounded-lg border border-line p-3" data-catalog-empty>
                  <p className="text-xs text-muted">
                    Nothing on the shelf matches &ldquo;{query}&rdquo;. Search checks the item name and
                    its note.
                  </p>
                  <button type="button" onClick={() => setQuery('')} className="btn btn-secondary mt-2 text-xs">
                    Show everything
                  </button>
                </div>
              )}
              <div className={`mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 v2-catalog`}>
                {visible.map((i) => {
                  const inCart = cart.find((l) => l.item.id === i.id);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      tabIndex={3}
                      onClick={() => addLine(i)}
                      className={`relative flex min-h-24 flex-col justify-between rounded-xl border border-line bg-surface-2 p-3 text-left transition hover:border-accent active:scale-[0.98] v2-tile`}
                    >
                      {inCart && (
                        <span
                          className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-bg"
                          aria-label={`${inCart.quantity} in the cart`}
                        >
                          ×{inCart.quantity}
                        </span>
                      )}
                      <span className="block" aria-hidden>
                        <ItemMark id={i.id} emoji={i.emoji} />
                      </span>
                      <span className="mt-2 block text-sm font-semibold leading-tight">{i.name}</span>
                      <span className="figure mt-1 block text-sm tabular-nums text-secondary">
                        {i.priceCurrency === 'SATS'
                          ? formatSats(i.priceMinor)
                          : formatFiat({ minor: i.priceMinor, currency: settings.currency })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <details className="v2-tools" open>
            {<summary>Tools</summary>}
            {(
              <label className="v2-price mt-2 block" htmlFor="tl-rate">
                <span className="eyebrow">What one {wallet?.coin === 'ltc' ? 'Litecoin' : 'Bitcoin'} is worth</span>
                <span className="v2-price-in">
                  <input
                    id="tl-rate"
                    tabIndex={4}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const charge = document.getElementById('tl-charge') as HTMLButtonElement | null;
                      if (charge && !charge.disabled) charge.focus();
                    }}
                    inputMode="decimal"
                    placeholder="60000.00"
                    aria-label={`What one ${wallet?.coin === 'ltc' ? 'Litecoin' : 'Bitcoin'} is worth (${settings.currency})`}
                  />
                  <span className="v2-unit" aria-hidden>{settings.currency}</span>
                </span>
              </label>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="block" htmlFor="tl-custom">
              <span className="eyebrow">Custom amount ({settings.currency}) — added to the items</span>
              <span className="v2-custom-in">
                <input
                  id="tl-custom"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  inputMode="decimal"
                  placeholder="12.50"
                  className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
                />
                {<span className="v2-unit" aria-hidden>{settings.currency}</span>}
              </span>
              <button
                type="button"
                onClick={() => setPadOpen(true)}
                className="btn btn-secondary mt-1 w-full sm:hidden"
              >
                Use the keypad
              </button>
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
                aria-pressed={tipJar}
                className={`btn btn-secondary${tipJar ? ' v2-on' : ''}`}
              >
                Tip jar
              </button>
              {(cart.length > 0 || custom.trim() !== '') && (
                <>
                  <button
                    type="button"
                    onClick={parkCurrent}
                    className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink"
                  >
                    park sale
                  </button>
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="rounded-lg border border-line px-3 py-2 text-xs text-muted"
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
              <span className="mt-0.5 block text-[11px] text-muted">
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

          </details>

          {rateBusy && !rateNote && !rateFailed && (
            // The loading state of the price line. A price source that is slow is not a broken till,
            // and silence in this spot used to read as one.
            <p className="mt-1 flex items-center gap-2 text-[11px] text-muted" role="status" data-rate-busy>
              <span className="v2-beat" aria-hidden />
              <span>Asking the price source… you can still type a rate in Tools.</span>
            </p>
          )}
          {rateNote && (
            <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              {quote && settings.assist.freshnessRings && <FreshnessRing fetchedAt={quote.fetchedAt} />}
              <span>{rateNote}</span>
            </p>
          )}
          {rateFailed && (
            <Failure
              coin={wallet?.coin === 'ltc' ? 'Litecoin' : 'Bitcoin'}
              kind={rateFailed === 'offline' || /network|fetch|offline/i.test(rateFailed) ? 'network' : 'rate'}
              what="The price service did not answer, so slip has no rate to price this sale with."
              safe="Nothing was taken. A rate is only a number for the receipt — no money moves on it."
              next="Type the rate yourself in Tools, or open Setup and point slip at a different price source."
              detail={rateFailed}
            />
          )}
          {sweepNote && sweepNote !== 'nothing was open to check' && (
            <p className="mt-1 text-[11px] text-muted">Open sales: {sweepNote}</p>
          )}


          </div>

          <div className={`lg:sticky lg:top-20 v2-held`}>
          {cart.length > 0 && (
            <ul className="mt-3 space-y-1">
              {cart.map((l) => (
                <li key={l.item.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-sm">
                  <span className="flex-1">{l.item.name}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.item.id)}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-line text-base text-secondary"
                    aria-label={`One fewer ${l.item.name}`}
                  >
                    −
                  </button>
                  <span className="figure w-6 text-center tabular-nums">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => addLine(l.item)}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-line text-base text-secondary"
                    aria-label={`One more ${l.item.name}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUndone({ item: l.item, quantity: l.quantity });
                      setCart((lines) => lines.filter((x) => x.item.id !== l.item.id));
                    }}
                    className={`grid h-9 w-9 place-items-center rounded-lg border border-line text-base text-secondary v2-qremove`}
                    aria-label={`Remove ${l.item.name} entirely`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {undone && (
            <p className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs" role="status">
              <span className="flex-1">
                {undone.item.name} removed — {undone.quantity} × {formatFiat({ minor: undone.item.priceMinor, currency: settings.currency })}
              </span>
              <button
                type="button"
                className="btn btn-secondary px-2 py-1 text-xs"
                onClick={() => {
                  setCart((lines) => {
                    const existing = lines.find((l) => l.item.id === undone.item.id);
                    return existing
                      ? lines.map((l) => (l.item.id === undone.item.id ? { ...l, quantity: l.quantity + undone.quantity } : l))
                      : [...lines, { item: undone.item, quantity: undone.quantity }];
                  });
                  setUndone(null);
                }}
              >
                Undo
              </button>
              <button type="button" className="text-muted" onClick={() => setUndone(null)} aria-label="Dismiss">
                ×
              </button>
            </p>
          )}
          {totals && (
            <div className="mt-3 rounded-xl border border-line bg-surface p-3" data-totals>
              <p className="eyebrow">The customer pays</p>
              <p className="figure mt-1 text-[2.25rem] font-bold leading-none tabular-nums">
                {formatFiat({ minor: totals.roundedTotalMinor, currency: settings.currency })}
              </p>
              <p className="mt-1 text-sm text-secondary">
                <Explain id="charge">
                  {chargeSats === null ? 'set a price first' : formatSats(chargeSats)}
                </Explain>
              </p>
              <p className="mt-2 text-xs text-muted">
                {formatFiat({ minor: totals.subtotalMinor, currency: settings.currency })} +{' '}
                {formatFiat({ minor: totals.taxMinor, currency: settings.currency })} tax
                {split
                  ? ` · ${splitPercent}% to ${wallets.find((w) => w.id === splitWalletId)?.label ?? '—'}`
                  : ''}
              </p>
              {(
                <p className="v2-rate-line">
                  Price used: {rate.trim() === '' ? 'not set' : `${rate} ${settings.currency}`}
                </p>
              )}
            </div>
          )}

          {/* The bar stays at thumb height on a phone: the shopkeeper never scrolls to find the
              button that takes the money. */}
          <div className={`charge-bar mt-3 flex flex-wrap items-center gap-2 v2-rail`}>
            {(
              <p className="v2-figure">
                {totals && chargeSats !== null ? (
                  <>
                    <span className="v2-sats" aria-hidden>≈ {formatSats(chargeSats)}</span>
                    <span className="v2-fiat">{formatFiat({ minor: totals.roundedTotalMinor, currency: settings.currency })}</span>
                  </>
                ) : (
                  <>
                    <span className="v2-sats">0 sats</span>
                    <span className="v2-fiat">0.00 {settings.currency}</span>
                  </>
                )}
              </p>
            )}
            {(
              <p className="v2-rate-line">
                {rate.trim() === '' ? 'Bitcoin price not set' : `${rate} ${settings.currency} per Bitcoin`}
              </p>
            )}
            {/* Refused is not the same as absent. A disabled button cannot be reached by a keyboard or
                announced by a screen reader, so the one control that takes the money would simply not
                exist for those users — and the reason it is refused would be invisible to them. It stays
                focusable and says why (D-83). */}
            <button
              type="button"
              id="tl-charge"
              onClick={() => {
                if (!wallet || !totals || chargeSats === null || compareStopped) return;
                charge();
              }}
              aria-disabled={!wallet || !totals || chargeSats === null || compareStopped || undefined}
              aria-describedby={
                !wallet || !totals || chargeSats === null || compareStopped ? 'tl-charge-blocker' : undefined
              }
              className={`btn btn-primary flex-1 sm:flex-none v2-charge${
                !wallet || !totals || chargeSats === null || compareStopped ? ' v2-blocked' : ''
              }`}
            >
              {settings.assist.rehearsal ? 'Rehearse' : 'Charge'}
              {totals && chargeSats !== null ? ` ${formatSats(chargeSats)}` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                const opened = openCustomerDisplay();
                setStatus(opened ? 'customer screen opened' : 'your browser blocked the second window — allow pop-ups for slip');
              }}
              className="btn btn-secondary"
            >
              Customer screen
            </button>
            <span className="text-[11px] text-muted">
              today on this wallet: <span className="figure">{formatSats(walletTakings)}</span>
            </span>
            {/* A greyed button with no reason is a dead end. Say what is missing, and where. */}
            {(!wallet || !totals || chargeSats === null || compareStopped) && (
              <div className="w-full" id="tl-charge-blocker" data-charge-blocker>
                {compareStopped ? (
                  <Failure
                    kind="chain"
                    what="The first address slip builds from this wallet does not match the one your wallet shows for address 0/0."
                    safe="Nothing was taken and nothing was sent. slip is watch-only, so a wrong match cannot move money — it can only mislabel a payment."
                    next="Open Setup, Wallets, and check that the wallet you added is the one you meant. There is no skip."
                  />
                ) : !wallet ? (
                  <Failure
                    kind="wallet"
                    what="No wallet is attached to this till, so slip has no address to show a customer."
                    safe="Nothing was taken. With no wallet there is nothing to pay and nothing to lose."
                    next="Open Setup, then Wallets, and paste a public wallet code — an xpub, a descriptor or a Lightning address."
                  />
                ) : (
                  <p className="text-xs text-warn">
                    {!totals
                      ? 'Add an item or type an amount first.'
                      : 'Set what one Bitcoin is worth first.'}
                  </p>
                )}
              </div>
            )}
          </div>
          {status && <p className="mt-2 text-[11px] text-bad">{status}</p>}
          </div>
          </div>

          <AmountPad
            currency={settings.currency}
            open={padOpen}
            onClose={() => setPadOpen(false)}
            onAmount={(raw) => {
              setCustom(raw);
              setStatus('amount added — check it, then charge');
            }}
          />
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
  page: 'roll' | 'a4' = 'roll',
): void {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
  const at = (invoice.confirmedAt ?? invoice.createdAt).slice(0, 16).replace('T', ' ');
  const status = invoice.note === 'rehearsal'
    ? 'REHEARSAL — nothing was charged'
    : invoice.manual
      ? 'Marked paid by you'
      : 'Paid — seen on chain';
  const observed = invoice.manual
    ? 'slip did not observe a payment. This is a record of what you marked.'
    : invoice.note === 'rehearsal'
      ? 'This is a rehearsal. Nothing was charged.'
      : 'slip observed this payment at the address above.';
  const body = `<h1>${esc(shopName || 'slip')}</h1>
<div class="when">${esc(at)} UTC</div>
<div class="big">${formatSats(invoice.amountAtoms)}</div>
<div class="fiat">${esc(formatFiat({ minor: invoice.amountMinor, currency: invoice.currency }))}</div>
<div class="status ${invoice.manual || invoice.note === 'rehearsal' ? 'status-manual' : ''}">${esc(status)}</div>
<table>
  <tr><td>Invoice</td><td>${esc(invoice.id)}</td></tr>
  <tr><td>Wallet</td><td>${esc(invoice.walletLabel)}</td></tr>
  <tr><td>Address</td><td><code>${esc(invoice.address)}</code></td></tr>
  <tr><td>Index</td><td>${invoice.index === null ? 'fixed address' : `#${invoice.index}`}</td></tr>
</table>
<p class="note">${observed}</p>
${proof ? `<p class="note">Proof</p><code>${esc(formatProof(proof))}</code>` : ''}
<div class="foot">${esc(footer || 'Thank you')}<br>slip · watch-only · no keys, no server</div>`;
  const html = page === 'a4'
    ? `<!doctype html><title>receipt ${esc(invoice.id)}</title>
<style>
  @page { size: A4; margin: 18mm }
  html, body { margin: 0; background: #fff; color: #000 }
  body { font: 16px/1.45 Palatino, Georgia, serif }
  .page { width: 174mm; margin: 0 auto; padding-top: 8mm }
  .rule { border-top: 3px solid #000; border-bottom: 1px solid #000; height: 4px; margin: 0 0 14px }
  h1 { font-size: 36px; font-weight: 500; line-height: 1.1; margin: 0 }
  .when { margin-top: 6px; font: 14px/1.4 ui-monospace, Menlo, monospace }
  .big { margin: 22px 0 0; font-size: 52px; font-weight: 700; letter-spacing: -0.03em; line-height: 1 }
  .fiat { margin: 6px 0 14px; font-size: 20px }
  .status { display: inline-block; border: 2px solid #000; padding: 6px 10px; font: 700 16px/1.2 ui-monospace, Menlo, monospace }
  .status-manual { border-style: dashed }
  table { width: 100%; margin-top: 22px; border-collapse: collapse; font: 15px/1.45 ui-monospace, Menlo, monospace }
  td { padding: 8px 0; border-bottom: 1px solid #000; vertical-align: top }
  td:first-child { width: 32mm }
  code { font-size: 14px; word-break: break-all }
  .note { margin: 16px 0 0 }
  .foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #000; font: 13px/1.45 ui-monospace, Menlo, monospace }
</style>
<div class="page"><div class="rule"></div>${body}</div>`
    : `<!doctype html><title>receipt ${esc(invoice.id)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm }
  body { width: 72mm; font: 16px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #000; background: #fff; margin: 0 }
  .tear { height: 10px; margin: 0 0 8px; background: radial-gradient(circle at 8px 0, #fff 7px, #000 7.5px) 0 0 / 16px 10px repeat-x }
  h1 { font: 22px/1.2 Palatino, Georgia, serif; margin: 0 0 4px }
  .when { }
  .big { font-size: 28px; font-weight: 700; margin: 6px 0 }
  .fiat { }
  hr, .rule { border: 0 }
  table { width: 100%; border-collapse: collapse }
  td { padding: 4px 0; vertical-align: baseline; border-bottom: 1px dotted #000 }
  td:last-child { text-align: right }
  code { font-size: 14px; word-break: break-all }
  .status { display: inline-block; margin-top: 8px; border: 2px solid #000; padding: 4px 8px; font-weight: 700; font-size: 16px }
  .status-manual { border-style: dashed }
  .note { }
  .foot { margin-top: 8px; border-top: 1px dotted #000; padding-top: 8px }
</style>
<div class="tear" aria-hidden="true"></div>${body}`;
  openPrintable(html, page === 'a4' ? 'slip-receipt-a4' : 'slip-receipt', page === 'a4' ? 'width=840,height=1120' : 'width=380,height=620');
}

function parseFiatSafe(text: string, currency: string): bigint | null {
  try {
    return parseFiat(text, currency).minor;
  } catch {
    return null;
  }
}
