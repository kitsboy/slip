/**
 * Ledger persistence — catalog, invoices, standing requests and per-wallet index books.
 *
 * BigInt does not survive JSON, so every amount is stored as a decimal STRING and revived
 * as BigInt on read. That is not ceremony: `JSON.stringify({ n: 1n })` throws, and a
 * `number` round-trip silently loses precision above 2^53 — a sat is 1e-8 of a coin, so the
 * loss shows up as a wrong total on a real receipt.
 */

import { isBrowserStore, mutateLedger } from './storage';
import type { DayClosure } from './day-close';
import type { CatalogItem } from './catalog';
import type { Invoice, InvoiceLine, InvoiceStatus } from './orders';
import type { StandingRequest } from './requests';
import { emptyBook, type IndexBook } from './indexes';
import type { Anchor } from './anchor';
import type { Refund } from './refunds';

export const LEDGER_KEY = 'slip.ledger.v1';

export interface Watch {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly networkId: string;
  readonly note: string;
  readonly addedAt: string;
}

export interface Ledger {
  closures?: DayClosure[];
  items: CatalogItem[];
  invoices: Invoice[];
  requests: StandingRequest[];
  books: Record<string, IndexBook>;
  /** Addresses we merely look at — a supplier, a landlord, a cold wallet. Never ours. */
  watches: Watch[];
  /** Day anchors, so a restored device keeps the proof it already paid for. */
  anchors: Anchor[];
  /** Refunds are records of money the merchant moved elsewhere — never movements by slip. */
  refunds: Refund[];
}

export function emptyLedger(): Ledger {
  return {
    items: [],
    invoices: [],
    requests: [],
    books: {},
    watches: [],
    anchors: [],
    refunds: [],
  };
}

interface WireItem extends Omit<CatalogItem, 'priceMinor'> {
  priceMinor: string;
}
interface WireLine extends Omit<InvoiceLine, 'unitAtoms' | 'unitMinor'> {
  unitAtoms: string;
  unitMinor: string;
}
interface WireInvoice
  extends Omit<
    Invoice,
    'amountAtoms' | 'amountMinor' | 'rateMinorPerCoin' | 'lines' | 'receivedAtoms'
  > {
  amountAtoms: string;
  amountMinor: string;
  rateMinorPerCoin: string | null;
  /** Additive: an older backup has no such field, and that is not an error. */
  receivedAtoms?: string | null;
  lines: WireLine[];
}
interface WireRequest extends Omit<StandingRequest, 'amountMinor'> {
  amountMinor: string;
}
interface WireLedger {
  closures?: DayClosure[];
  version: 1;
  watches?: Watch[];
  anchors?: Anchor[];
  refunds?: (Omit<Refund, 'atoms'> & { atoms: string })[];
  items: WireItem[];
  invoices: WireInvoice[];
  requests: WireRequest[];
  books: Record<string, { next: number; reserved: number[]; used: number[] }>;
}

function big(text: string | null | undefined): bigint {
  return text && /^-?\d+$/.test(text) ? BigInt(text) : 0n;
}

export function toWire(ledger: Ledger): WireLedger {
  return {
    version: 1,
    closures: ledger.closures,
    items: ledger.items.map((i) => ({ ...i, priceMinor: i.priceMinor.toString() })),
    invoices: ledger.invoices.map((i) => ({
      ...i,
      amountAtoms: i.amountAtoms.toString(),
      amountMinor: i.amountMinor.toString(),
      receivedAtoms:
        i.receivedAtoms === null || i.receivedAtoms === undefined
          ? null
          : i.receivedAtoms.toString(),
      rateMinorPerCoin: i.rateMinorPerCoin === null ? null : i.rateMinorPerCoin.toString(),
      lines: i.lines.map((l) => ({
        ...l,
        unitAtoms: l.unitAtoms.toString(),
        unitMinor: l.unitMinor.toString(),
      })),
    })),
    requests: ledger.requests.map((r) => ({ ...r, amountMinor: r.amountMinor.toString() })),
    books: ledger.books,
    watches: ledger.watches,
    anchors: ledger.anchors,
    refunds: ledger.refunds.map((r) => ({ ...r, atoms: r.atoms.toString() })),
  };
}

export function fromWire(wire: WireLedger): Ledger {
  const result: Ledger = {
    closures: wire.closures ?? [],
    items: (wire.items ?? []).map((i) => ({ ...i, priceMinor: big(i.priceMinor) })),
    invoices: (wire.invoices ?? []).map((i) => ({
      ...i,
      // A stored status is a claim; an unknown one falls back to awaiting rather than
      // being trusted into "complete".
      status: ([
        'awaiting',
        'seen',
        'confirmed',
        'complete',
        'underpaid',
        'expired',
        'cancelled',
      ].includes(i.status as string)
        ? i.status
        : 'awaiting') as InvoiceStatus,
      amountAtoms: big(i.amountAtoms),
      amountMinor: big(i.amountMinor),
      receivedAtoms:
        i.receivedAtoms === null || i.receivedAtoms === undefined ? null : big(i.receivedAtoms),
      rateMinorPerCoin: i.rateMinorPerCoin === null ? null : big(i.rateMinorPerCoin),
      lines: (i.lines ?? []).map((l) => ({
        ...l,
        unitAtoms: big(l.unitAtoms),
        unitMinor: big(l.unitMinor),
      })),
    })),
    requests: (wire.requests ?? []).map((r) => ({ ...r, amountMinor: big(r.amountMinor) })),
    books: wire.books ?? {},
    // Additive field: an older backup has no watches, which is not an error.
    watches: (wire.watches ?? []).filter(
      (w): w is Watch => Boolean(w) && typeof w.address === 'string' && typeof w.label === 'string',
    ),
    anchors: (wire.anchors ?? []).filter(
      (a): a is Anchor =>
        Boolean(a) && typeof a.date === 'string' && typeof a.digestHex === 'string',
    ),
    refunds: (wire.refunds ?? [])
      .filter((r) => Boolean(r) && typeof r.invoiceId === 'string')
      .map((r) => ({ ...r, atoms: big(r.atoms) })),
  };
  numberReceipts(result);
  return result;
}

/** Additive legacy migration: stable creation/id ordering; existing references never change. */
function numberReceipts(ledger: Ledger): void {
  const next = new Map<string, number>();
  for (const invoice of ledger.invoices) {
    const day = invoice.createdAt?.slice(0, 10) ?? 'undated';
    const n = invoice.receiptNumber?.startsWith(day + '-')
      ? Number(invoice.receiptNumber.slice(day.length + 1))
      : 0;
    if (Number.isSafeInteger(n)) next.set(day, Math.max(next.get(day) ?? 0, n));
  }
  const missing = ledger.invoices
    .filter((i) => !i.receiptNumber)
    .sort(
      (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id),
    );
  const assigned = new Map<string, string>();
  for (const invoice of missing) {
    const day = invoice.createdAt?.slice(0, 10) ?? 'undated';
    const n = (next.get(day) ?? 0) + 1;
    next.set(day, n);
    assigned.set(invoice.id, `${day}-${String(n).padStart(3, '0')}`);
  }
  ledger.invoices = ledger.invoices.map((i) =>
    assigned.has(i.id) ? { ...i, receiptNumber: assigned.get(i.id) } : i,
  );
}

export interface LedgerStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LedgerRepository {
  load(): Ledger;
  transaction<T>(change: (repo: LedgerRepository) => T): T | Promise<T>;
  save(ledger: Ledger): void | Promise<void>;
  book(walletId: string): IndexBook;
  putInvoice(invoice: Invoice): void | Promise<void>;
  putInvoices(invoices: Invoice[]): void | Promise<void>;
  touchInvoice(
    id: string,
    patch: Partial<Invoice>,
  ): Invoice | undefined | Promise<Invoice | undefined>;
  addItem(item: CatalogItem): void | Promise<void>;
  replaceItems(items: CatalogItem[]): void | Promise<void>;
  addRequest(request: StandingRequest): void | Promise<void>;
  touchRequest(id: string, patch: Partial<StandingRequest>): void | Promise<void>;
  removeRequest(id: string): void | Promise<void>;
  setBook(walletId: string, book: IndexBook): void | Promise<void>;
  addRefund(refund: Refund): void | Promise<void>;
  refunds(): Refund[];
}

export function createLedger(store: LedgerStore): LedgerRepository {
  const load = (): Ledger => {
    const raw = store.getItem(LEDGER_KEY);
    if (!raw) return emptyLedger();
    try {
      const parsed = JSON.parse(raw) as WireLedger;
      if (parsed.version !== 1) return emptyLedger();
      return fromWire(parsed);
    } catch {
      // A corrupt ledger must not brick the till; start empty and let the UI say so.
      return emptyLedger();
    }
  };
  const save = (ledger: Ledger) => {
    numberReceipts(ledger);
    store.setItem(LEDGER_KEY, JSON.stringify(toWire(ledger)));
  };

  const repo: LedgerRepository = {
    load,
    save,
    transaction: (change) => change(repo),

    book(walletId) {
      return load().books[walletId] ?? emptyBook();
    },

    setBook(walletId, book) {
      const l = load();
      save({ ...l, books: { ...l.books, [walletId]: book } });
    },

    putInvoice(invoice) {
      const l = load();
      const existing = l.invoices.findIndex((i) => i.id === invoice.id);
      const invoices = [...l.invoices];
      if (existing >= 0)
        invoices[existing] = { ...invoice, receiptNumber: invoices[existing]!.receiptNumber };
      else invoices.unshift(invoice);
      save({ ...l, invoices });
    },

    putInvoices(list) {
      const l = load();
      const byId = new Map(l.invoices.map((i) => [i.id, i]));
      for (const i of list)
        byId.set(i.id, { ...i, receiptNumber: byId.get(i.id)?.receiptNumber ?? i.receiptNumber });
      save({ ...l, invoices: [...byId.values()] });
    },

    touchInvoice(id, patch) {
      const l = load();
      const found = l.invoices.find((i) => i.id === id);
      if (!found) return undefined;
      const updated = { ...found, ...patch, receiptNumber: found.receiptNumber };
      save({ ...l, invoices: l.invoices.map((i) => (i.id === id ? updated : i)) });
      return updated;
    },

    addItem(item) {
      const l = load();
      save({ ...l, items: [...l.items, item] });
    },

    replaceItems(items) {
      const l = load();
      save({ ...l, items });
    },

    addRequest(request) {
      const l = load();
      save({ ...l, requests: [request, ...l.requests] });
    },

    touchRequest(id, patch) {
      const l = load();
      save({ ...l, requests: l.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    },

    removeRequest(id) {
      const l = load();
      save({ ...l, requests: l.requests.filter((r) => r.id !== id) });
    },

    addRefund(refund) {
      const l = load();
      save({ ...l, refunds: [refund, ...l.refunds] });
    },

    refunds() {
      return load().refunds;
    },
  };

  if (!isBrowserStore(store)) return repo;
  const transaction = async <T>(change: (draft: LedgerRepository) => T): Promise<Awaited<T>> => {
    let result!: T;
    await mutateLedger(async (base) => {
      let value = base;
      const draft = createLedger({
        getItem: () => value,
        setItem: (_key, next) => {
          value = next;
        },
      });
      result = change(draft);
      if (result instanceof Promise)
        throw new Error('Ledger transactions must not await external work.');
      return value;
    });
    return result as Awaited<T>;
  };
  return {
    ...repo,
    transaction,
    save: (value) => transaction((draft) => draft.save(value)),
    setBook: (id, book) => transaction((draft) => draft.setBook(id, book)),
    putInvoice: (invoice) => transaction((draft) => draft.putInvoice(invoice)),
    putInvoices: (list) => transaction((draft) => draft.putInvoices(list)),
    touchInvoice: (id, delta) => transaction((draft) => draft.touchInvoice(id, delta)),
    addItem: (item) => transaction((draft) => draft.addItem(item)),
    replaceItems: (items) => transaction((draft) => draft.replaceItems(items)),
    addRequest: (request) => transaction((draft) => draft.addRequest(request)),
    touchRequest: (id, delta) => transaction((draft) => draft.touchRequest(id, delta)),
    removeRequest: (id) => transaction((draft) => draft.removeRequest(id)),
    addRefund: (refund) => transaction((draft) => draft.addRefund(refund)),
  };
}
