/**
 * The books, seen properly: every sale, grouped by day and by rail, closed and printed.
 *
 * Two things this file refuses to do:
 *  - it never treats a manual confirmation as an observed payment, so the day close always
 *    states how much of the total a human vouched for;
 *  - it never rounds a total through a float. Every figure is BigInt atoms until it is turned
 *    into text for a human at the very last moment.
 */

import type { Invoice } from './orders';

export type Rail = 'onchain' | 'lightning' | 'manual' | 'other';

export interface RefundLike {
  readonly invoiceId: string;
  readonly atoms: bigint;
  readonly at: string;
  readonly reason: string;
}

export interface SaleRow {
  readonly id: string;
  readonly at: string;
  readonly walletLabel: string;
  readonly rail: Rail;
  readonly atoms: bigint;
  readonly refundedAtoms: bigint;
  readonly netAtoms: bigint;
  readonly manual: boolean;
  readonly note: string;
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
}

/** Which rail a sale came in on — read from the invoice, never inferred from the amount. */
export function railOf(invoice: Invoice): Rail {
  if (invoice.manual) return 'manual';
  if (invoice.walletId.startsWith('ln:') || invoice.note.startsWith('lightning')) return 'lightning';
  if (invoice.walletId.startsWith('fedimint:')) return 'other';
  return 'onchain';
}

export function toRow(invoice: Invoice, refunds: readonly RefundLike[]): SaleRow {
  const refunded = refunds
    .filter((r) => r.invoiceId === invoice.id)
    .reduce((sum, r) => sum + r.atoms, 0n);
  return {
    id: invoice.id,
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
  };
}

/** Sales for one ISO date (YYYY-MM-DD), newest first. Only completed sales count as takings. */
export function dayClose(
  invoices: readonly Invoice[],
  refunds: readonly RefundLike[],
  date: string,
): DayClose {
  const rows = invoices
    .filter((i) => i.status === 'complete' && i.createdAt.slice(0, 10) === date)
    .map((i) => toRow(i, refunds))
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
  const header = ['invoice', 'date_time_utc', 'wallet', 'rail', 'sats', 'refunded_sats', 'net_sats', 'btc', 'manual', 'note'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.at,
        r.walletLabel,
        r.rail,
        r.atoms.toString(),
        r.refundedAtoms.toString(),
        r.netAtoms.toString(),
        btcString(r.netAtoms),
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
 * The Z-report: a plain-text sheet, one line per sale plus totals per rail. Text, not HTML, so
 * it can be printed, pasted into an email or written to a till roll without a renderer.
 */
export function closeReport(close: DayClose, shopName: string, currency: string): CloseReport {
  const money = (atoms: bigint) => `${btcString(atoms)} BTC`;
  const lines: string[] = [
    shopName || 'slip',
    `Day close — ${close.date}`,
    '',
    `Sales: ${close.count}`,
    `Gross: ${money(close.grossAtoms)}`,
    `Refunded: ${money(close.refundedAtoms)}`,
    `Net: ${money(close.netAtoms)}  ${currency}`,
    '',
    `On-chain: ${money(close.byRail.onchain)}`,
    `Lightning: ${money(close.byRail.lightning)}`,
    `Manual: ${money(close.byRail.manual)}`,
    close.byRail.other > 0n ? `Other rails: ${money(close.byRail.other)}` : '',
    '',
    `Observed by slip: ${money(close.observedAtoms)}`,
    `Confirmed by a human: ${money(close.manualAtoms)}`,
    '',
    ...close.rows.map(
      (r) =>
        `${r.at.slice(11, 16)}  ${r.id.padEnd(20).slice(0, 20)}  ${money(r.netAtoms).padStart(14)}  ${r.rail}${r.manual ? ' (manual)' : ''}`,
    ),
    '',
    'A manual line is a human confirmation, not an observation.',
  ].filter((l) => l !== '');
  return { title: `Close — ${close.date}`, lines };
}
