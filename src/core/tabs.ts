/**
 * Parked sales, like tabs at a bar.
 *
 * A queue is the normal state of a busy counter: one customer's card declines, the next is
 * waiting, and losing the half-built cart is how a till gets abandoned for a paper notebook. A
 * parked tab keeps the lines, the note and the wallet choice — and nothing else: no address is
 * reserved until it is charged, so a parked tab costs no index and reveals no destination.
 */

import type { CatalogItem } from './catalog';

export interface TabLine {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitMinor: string;
  readonly priceCurrency: 'FIAT' | 'SATS';
}

export interface ParkedTab {
  readonly id: string;
  readonly label: string;
  readonly lines: readonly TabLine[];
  readonly custom: string;
  readonly walletId: string;
  readonly note: string;
  readonly createdAt: string;
}

export const MAX_TABS = 5;

export function toTabLine(item: CatalogItem, quantity: number): TabLine {
  return {
    itemId: item.id,
    name: item.name,
    quantity,
    unitMinor: item.priceMinor.toString(),
    priceCurrency: item.priceCurrency,
  };
}

export function tabSubtotalMinor(tab: ParkedTab): bigint {
  let total = 0n;
  for (const line of tab.lines) {
    if (line.priceCurrency === 'SATS') continue;
    total += BigInt(line.unitMinor) * BigInt(line.quantity);
  }
  const custom = tab.custom.trim();
  if (/^\d+(\.\d+)?$/.test(custom)) {
    // Parked tabs only display a subtotal; the exact money maths happens in the till on resume.
    const [whole, frac = ''] = custom.split('.');
    total += BigInt(whole ?? '0') * 100n + BigInt((frac + '00').slice(0, 2));
  }
  return total;
}

export interface ParkResult {
  readonly ok: boolean;
  readonly tabs: readonly ParkedTab[];
  readonly reason: string | null;
}

export function park(tabs: readonly ParkedTab[], tab: ParkedTab): ParkResult {
  if (tab.lines.length === 0 && tab.custom.trim() === '') {
    return { ok: false, tabs, reason: 'there is nothing to park yet' };
  }
  if (tabs.length >= MAX_TABS) {
    return { ok: false, tabs, reason: `you can park ${MAX_TABS} sales — resume or close one first` };
  }
  return { ok: true, tabs: [tab, ...tabs], reason: null };
}

export function closeTab(tabs: readonly ParkedTab[], id: string): ParkedTab[] {
  return tabs.filter((t) => t.id !== id);
}

/** A short label so the tab strip stays readable on a phone. */
export function tabLabel(tab: ParkedTab): string {
  if (tab.label.trim()) return tab.label.trim().slice(0, 18);
  if (tab.lines.length === 0) return 'custom amount';
  const first = tab.lines[0]!;
  const extra = tab.lines.length - 1;
  return `${first.quantity}× ${first.name}`.slice(0, 18) + (extra > 0 ? ` +${extra}` : '');
}

/** The last completed sale, kept so a shop that sells the same thing all day needs one tap. */
export interface RepeatSale {
  readonly lines: readonly TabLine[];
  readonly custom: string;
  readonly totalMinor: string;
  readonly at: string;
}

export function repeatable(last: RepeatSale | null): last is RepeatSale {
  return Boolean(last) && (last!.lines.length > 0 || last!.custom.trim() !== '');
}
