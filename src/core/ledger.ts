/**
 * Ledger persistence — catalog, invoices, standing requests and per-wallet index books.
 *
 * BigInt does not survive JSON, so every amount is stored as a decimal STRING and revived
 * as BigInt on read. That is not ceremony: `JSON.stringify({ n: 1n })` throws, and a
 * `number` round-trip silently loses precision above 2^53 — a sat is 1e-8 of a coin, so the
 * loss shows up as a wrong total on a real receipt.
 */

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
  return { items: [], invoices: [], requests: [], books: {}, watches: [], anchors: [], refunds: [] };
}

interface WireItem extends Omit<CatalogItem, 'priceMinor'> {
  priceMinor: string;
}
interface WireLine extends Omit<InvoiceLine, 'unitAtoms' | 'unitMinor'> {
  unitAtoms: string;
  unitMinor: string;
}
interface WireInvoice
  extends Omit<Invoice, 'amountAtoms' | 'amountMinor' | 'rateMinorPerCoin' | 'lines' | 'receivedAtoms'> {
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
    items: ledger.items.map((i) => ({ ...i, priceMinor: i.priceMinor.toString() })),
    invoices: ledger.invoices.map((i) => ({
      ...i,
      amountAtoms: i.amountAtoms.toString(),
      amountMinor: i.amountMinor.toString(),
      receivedAtoms:
        i.receivedAtoms === null || i.receivedAtoms === undefined ? null : i.receivedAtoms.toString(),
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
  return {
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
      receivedAtoms: i.receivedAtoms === null || i.receivedAtoms === undefined ? null : big(i.receivedAtoms),
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
      (a): a is Anchor => Boolean(a) && typeof a.date === 'string' && typeof a.digestHex === 'string',
    ),
    refunds: (wire.refunds ?? [])
      .filter((r) => Boolean(r) && typeof r.invoiceId === 'string')
      .map((r) => ({ ...r, atoms: big(r.atoms) })),
  };
}

export interface LedgerStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LedgerRepository {
  load(): Ledger;
  save(ledger: Ledger): void;
  book(walletId: string): IndexBook;
  putInvoice(invoice: Invoice): void;
  putInvoices(invoices: Invoice[]): void;
  touchInvoice(id: string, patch: Partial<Invoice>): Invoice | undefined;
  addItem(item: CatalogItem): void;
  replaceItems(items: CatalogItem[]): void;
  addRequest(request: StandingRequest): void;
  touchRequest(id: string, patch: Partial<StandingRequest>): void;
  removeRequest(id: string): void;
  setBook(walletId: string, book: IndexBook): void;
  addRefund(refund: Refund): void;
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
  const save = (ledger: Ledger) => store.setItem(LEDGER_KEY, JSON.stringify(toWire(ledger)));

  const repo: LedgerRepository = {
    load,
    save,

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
      if (existing >= 0) invoices[existing] = invoice;
      else invoices.unshift(invoice);
      save({ ...l, invoices });
    },

    putInvoices(list) {
      const l = load();
      const byId = new Map(l.invoices.map((i) => [i.id, i]));
      for (const i of list) byId.set(i.id, i);
      save({ ...l, invoices: [...byId.values()] });
    },

    touchInvoice(id, patch) {
      const l = load();
      const found = l.invoices.find((i) => i.id === id);
      if (!found) return undefined;
      const updated = { ...found, ...patch };
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

  return repo;
}
