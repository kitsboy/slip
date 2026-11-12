/**
 * The books, seen properly: every sale, grouped by day and by rail, closed and printed.
 *
 * Two things this file refuses to do:
 *  - it never treats a manual confirmation as an observed payment, so the day close always
 *    states how much of the total a human vouched for;
 *  - it never rounds a total through a float. Every figure is BigInt atoms until it is turned
 *    into text for a human at the very last moment.
 */

import { overpaidBy, type Invoice } from './orders';

import { formatCoinAmount } from './money';
import type { Coin } from './network';

export type Rail = 'onchain' | 'lightning' | 'manual' | 'other';

export interface RefundLike {
  readonly invoiceId: string;
  readonly atoms: bigint;
  readonly at: string;
  readonly reason: string;
}

export interface SaleRow {
  readonly id: string;
  /** The chain this sale was paid on. A row that does not name its coin is a row that can be added
   *  to a Bitcoin total by accident, which is how a shop gets a number that means nothing. */
  readonly coin: Coin;
  readonly at: string;
  readonly walletLabel: string;
  readonly rail: Rail;
  readonly atoms: bigint;
  readonly refundedAtoms: bigint;
  readonly netAtoms: bigint;
  readonly manual: boolean;
  readonly note: string;
  /** What the source reported arriving, or null when nobody looked. */
  readonly receivedAtoms: bigint | null;
  /** How much MORE arrived than was asked for, past tolerance. 0n is the ordinary case. */
  readonly overpaidAtoms: bigint;
}

export interface CoinTotals {
  readonly count: number;
  readonly grossAtoms: bigint;
  readonly refundedAtoms: bigint;
  readonly netAtoms: bigint;
  readonly manualAtoms: bigint;
  readonly observedAtoms: bigint;
  readonly cancelledAtoms: bigint;
  readonly cancelledCount: number;
  readonly byRail: Readonly<Record<Rail, bigint>>;
}

export interface DayClose {
  readonly date: string;
  readonly rows: readonly SaleRow[];
  readonly count: number;
  readonly grossAtoms: bigint;
  readonly refundedAtoms: bigint;
  readonly netAtoms: bigint;
  readonly byRail: Readonly<Record<Rail, bigint>>;
  /** How much of the day a human confirmed rather than the chain. */
  readonly manualAtoms: bigint;
  readonly observedAtoms: bigint;
  /** Sales started on this day and cancelled before they paid. Not takings — a separate number. */
  readonly cancelledAtoms: bigint;
  readonly cancelledCount: number;
  /** Totals kept apart by chain. The blended numbers above are only meaningful when `coins` has one
   *  entry; with two, the books must show these instead. */
  readonly byCoin: Readonly<Record<Coin, CoinTotals>>;
  /** Which chains appear in this day, in the order Bitcoin, Litecoin. */
  readonly coins: readonly Coin[];
}

/** Which rail a sale came in on — read from the invoice, never inferred from the amount. */
export function railOf(invoice: Invoice): Rail {
  if (invoice.manual) return 'manual';
  if (invoice.walletId.startsWith('ln:') || invoice.note.startsWith('lightning')) return 'lightning';
  if (invoice.walletId.startsWith('fedimint:')) return 'other';
  return 'onchain';
}

export function toRow(invoice: Invoice, refunds: readonly RefundLike[], coin: Coin = 'btc'): SaleRow {
  const refunded = refunds
    .filter((r) => r.invoiceId === invoice.id)
    .reduce((sum, r) => sum + r.atoms, 0n);
  return {
    id: invoice.id,
    coin,
    at: invoice.createdAt,
    walletLabel: invoice.walletLabel,
    rail: railOf(invoice),
    atoms: invoice.amountAtoms,
    refundedAtoms: refunded > invoice.amountAtoms ? invoice.amountAtoms : refunded,
    netAtoms:
      (refunded > invoice.amountAtoms ? invoice.amountAtoms : refunded) >= invoice.amountAtoms
        ? 0n
        : invoice.amountAtoms - refunded,
    manual: invoice.manual,
    note: invoice.note,
    receivedAtoms: invoice.receivedAtoms ?? null,
    overpaidAtoms: overpaidBy(invoice.amountAtoms, invoice.receivedAtoms),
  };
}

/** Sales for one ISO date (YYYY-MM-DD), newest first. Only completed sales count as takings. */
export function dayClose(
  invoices: readonly Invoice[],
  refunds: readonly RefundLike[],
  date: string,
  /** Which chain each wallet takes. Without it every sale is assumed Bitcoin, which is what the
   *  books used to do silently for Litecoin. */
  coinOf: (walletId: string) => Coin = () => 'btc',
): DayClose {
  const rows = invoices
    .filter((i) => i.status === 'complete' && i.createdAt.slice(0, 10) === date)
    .map((i) => toRow(i, refunds, coinOf(i.walletId)))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const byRail: Record<Rail, bigint> = { onchain: 0n, lightning: 0n, manual: 0n, other: 0n };
  let gross = 0n;
  let refunded = 0n;
  let manual = 0n;
  for (const row of rows) {
    byRail[row.rail] += row.netAtoms;
    gross += row.atoms;
    refunded += row.refundedAtoms;
    if (row.manual) manual += row.atoms;
  }

  // Sales that never paid are not takings; the sheet tells the truth that a few were
  // started and walked away from, and never adds them to the total.
  const cancelled = invoices.filter((i) => i.status === 'cancelled' && i.createdAt.slice(0, 10) === date);
  const cancelledAtoms = cancelled.reduce((sum, i) => sum + i.amountAtoms, 0n);

  const blank = (): CoinTotals => ({
    count: 0,
    grossAtoms: 0n,
    refundedAtoms: 0n,
    netAtoms: 0n,
    manualAtoms: 0n,
    observedAtoms: 0n,
    cancelledAtoms: 0n,
    cancelledCount: 0,
    byRail: { onchain: 0n, lightning: 0n, manual: 0n, other: 0n },
  });
  const tally: Record<Coin, CoinTotals> = { btc: blank(), ltc: blank() };
  const rails: Record<Coin, Record<Rail, bigint>> = {
    btc: { onchain: 0n, lightning: 0n, manual: 0n, other: 0n },
    ltc: { onchain: 0n, lightning: 0n, manual: 0n, other: 0n },
  };
  for (const row of rows) {
    const t = tally[row.coin];
    rails[row.coin][row.rail] += row.netAtoms;
    tally[row.coin] = {
      ...t,
      count: t.count + 1,
      grossAtoms: t.grossAtoms + row.atoms,
      refundedAtoms: t.refundedAtoms + row.refundedAtoms,
      netAtoms: t.netAtoms + row.netAtoms,
      manualAtoms: row.manual ? t.manualAtoms + row.atoms : t.manualAtoms,
      observedAtoms: row.manual ? t.observedAtoms : t.observedAtoms + row.atoms,
    };
  }
  for (const invoice of cancelled) {
    const coin = coinOf(invoice.walletId);
    const t = tally[coin];
    tally[coin] = {
      ...t,
      cancelledAtoms: t.cancelledAtoms + invoice.amountAtoms,
      cancelledCount: t.cancelledCount + 1,
    };
  }
  const byCoin: Record<Coin, CoinTotals> = {
    btc: { ...tally.btc, byRail: rails.btc },
    ltc: { ...tally.ltc, byRail: rails.ltc },
  };
  const coins: Coin[] = (['btc', 'ltc'] as const).filter(
    (c) =>
      byCoin[c].count > 0 ||
      byCoin[c].cancelledCount > 0 ||
      byCoin[c].refundedAtoms > 0n,
  );

  return {
    date,
    rows,
    count: rows.length,
    grossAtoms: gross,
    refundedAtoms: refunded,
    netAtoms: gross - refunded,
    byRail,
    manualAtoms: manual,
    observedAtoms: gross - manual,
    cancelledAtoms,
    cancelledCount: cancelled.length,
    byCoin,
    coins: coins.length ? coins : ['btc'],
  };
}

/** Dates that have at least one completed sale, newest first. */
export function daysWithSales(invoices: readonly Invoice[]): string[] {
  const seen = new Set<string>();
  for (const i of invoices) if (i.status === 'complete') seen.add(i.createdAt.slice(0, 10));
  return [...seen].sort().reverse();
}

function csvCell(value: string): string {
  // RFC 4180: quote when the value contains a comma, quote or newline, and double the quotes.
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A CSV an accountant can open. Amounts are atoms (integers), plus a BTC column computed with
 * string maths so the file never contains a float that disagrees with the app.
 */
export function salesCsv(rows: readonly SaleRow[]): string {
  const header = [
    'invoice',
    'date_time_utc',
    'wallet',
    'coin',
    'rail',
    'atoms',
    'refunded_atoms',
    'net_atoms',
    'amount',
    'overpaid_atoms',
    'manual',
    'note',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.at,
        r.walletLabel,
        r.coin,
        r.rail,
        r.atoms.toString(),
        r.refundedAtoms.toString(),
        r.netAtoms.toString(),
        formatCoinAmount(r.netAtoms, r.coin),
        r.overpaidAtoms.toString(),
        r.manual ? 'yes' : 'no',
        r.note,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

/** Sats -> BTC decimal string, integer maths only. */
export function btcString(atoms: bigint): string {
  const sign = atoms < 0n ? '-' : '';
  const abs = atoms < 0n ? -atoms : atoms;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, '0');
  return `${sign}${whole}.${frac}`;
}

export interface CloseReport {
  readonly title: string;
  readonly lines: readonly string[];
}

/**
 * The Z-report: a plain-text sheet, one line per sale plus totals. Text, not HTML, so it can be
 * printed, pasted into an email or written to a till roll without a renderer.
 *
 * With two chains in one day there is no single total. Atoms of Litecoin and atoms of Bitcoin are
 * different money, and adding them produces a number that is true of nothing — so the report prints a
 * block per coin and says out loud that they are kept apart.
 */
export function closeReport(close: DayClose, shopName: string, currency: string): CloseReport {
  const words = (atoms: bigint, coin: Coin) => formatCoinAmount(atoms, coin);
  const lines: string[] = [shopName || 'slip', `Day close — ${close.date}`, ''];
  const mixed = close.coins.length > 1;

  lines.push(`Sales: ${close.count}`);
  if (mixed) {
    lines.push(
      `Coins in this day: ${close.coins.map((c) => (c === 'ltc' ? 'Litecoin' : 'Bitcoin')).join(' and ')} — kept apart, never added.`,
    );
  }

  for (const coin of close.coins) {
    const t = close.byCoin[coin];
    if (t.count === 0 && t.cancelledCount === 0) continue;
    if (mixed) lines.push('', coin === 'ltc' ? '— Litecoin —' : '— Bitcoin —');
    lines.push(
      `${mixed ? '' : 'Gross: '}${words(t.grossAtoms, coin)}`,
      `Refunded: ${words(t.refundedAtoms, coin)}`,
      `Net: ${words(t.netAtoms, coin)}  ${currency}`,
      '',
      `On-chain: ${words(t.byRail.onchain, coin)}`,
      `Lightning: ${words(t.byRail.lightning, coin)}`,
      `Manual: ${words(t.byRail.manual, coin)}`,
      t.byRail.other > 0n ? `Other rails: ${words(t.byRail.other, coin)}` : '',
      '',
      `Observed by slip: ${words(t.observedAtoms, coin)}`,
      `Confirmed by a human: ${words(t.manualAtoms, coin)}`,
      t.cancelledCount > 0
        ? `Cancelled, not taken: ${t.cancelledCount} (${words(t.cancelledAtoms, coin)})`
        : '',
    );
  }

  if (close.rows.length > 0) lines.push('', ...close.rows.map((r) => {
    const amount = words(r.netAtoms, r.coin);
    return `${r.at.slice(11, 16)}  ${r.id.padEnd(20).slice(0, 20)}  ${amount.padStart(16)}  ${r.rail}${r.manual ? ' (manual)' : ''}`;
  }));

  const overRows = close.rows.filter((r) => r.overpaidAtoms > 0n);
  if (overRows.length > 0) {
    const extra = overRows.reduce((sum, r) => sum + r.overpaidAtoms, 0n);
    lines.push(
      '',
      `${overRows.length} sale${overRows.length === 1 ? '' : 's'} arrived ABOVE the ask, ${words(
        extra,
        overRows[0]!.coin,
      )} more in total. The money is real and in the wallet; check the customer meant it.`,
    );
  }

  lines.push('', 'A manual line is a human confirmation, not an observation.');
  return { title: `Close — ${close.date}`, lines: lines.filter((l) => l !== '') };
}
