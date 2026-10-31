/**
 * The owner's Sunday letter.
 *
 * A week is the natural unit for a small shop: long enough to see a pattern, short enough to
 * remember what happened. This writes it from the books, in sentences rather than a dashboard,
 * because a shopkeeper reads a letter and ignores a chart.
 *
 * Nothing here is emailed. There is no server to email from, and a weekly report that leaves the
 * device would be the first thing slip ever sent about a merchant's business.
 */

import type { Invoice } from './orders';
import type { Refund } from './refunds';

export interface LetterInput {
  readonly invoices: readonly Invoice[];
  readonly refunds: readonly Refund[];
  readonly parkedTabs: number;
  readonly shopName: string;
  readonly now?: Date;
}

export interface Letter {
  readonly title: string;
  readonly lines: readonly string[];
  readonly netAtoms: bigint;
  readonly sales: number;
}

const DAY = 86_400_000;

export function weeklyLetter(input: LetterInput): Letter {
  const now = input.now ?? new Date();
  const start = new Date(now.getTime() - 7 * DAY);
  const startIso = start.toISOString();
  const iso = now.toISOString();

  const week = input.invoices.filter(
    (i) => i.status === 'complete' && i.createdAt >= startIso && i.createdAt <= iso,
  );
  const gross = week.reduce((s, i) => s + i.amountAtoms, 0n);
  const refunded = input.refunds
    .filter((r) => r.at >= startIso)
    .reduce((s, r) => s + (r.atoms > 0n ? r.atoms : 0n), 0n);
  const net = gross > refunded ? gross - refunded : 0n;

  const manual = week.filter((i) => i.manual);
  const hours = new Map<number, number>();
  for (const i of week) {
    const h = new Date(i.createdAt).getUTCHours();
    hours.set(h, (hours.get(h) ?? 0) + 1);
  }
  const busiest = [...hours.entries()].sort((a, b) => b[1] - a[1])[0];

  const lines: string[] = [];
  lines.push(
    week.length === 0
      ? 'No sales this week — the books are empty, which is its own kind of information.'
      : `${week.length} sale${week.length === 1 ? '' : 's'}, ${net} sats net after refunds.`,
  );
  if (refunded > 0n) lines.push(`Refunds: ${refunded} sats recorded (slip moved nothing — you did).`);
  if (manual.length > 0) {
    lines.push(
      `${manual.length} sale${manual.length === 1 ? '' : 's'} confirmed by a human rather than observed: that is ${manual.reduce((s, i) => s + i.amountAtoms, 0n)} sats of your own word.`,
    );
  }
  if (busiest) lines.push(`Busiest hour: ${String(busiest[0]).padStart(2, '0')}:00 UTC, ${busiest[1]} sale${busiest[1] === 1 ? '' : 's'}.`);
  if (input.parkedTabs > 0) {
    lines.push(`${input.parkedTabs} sale${input.parkedTabs === 1 ? '' : 's'} still parked from the week — worth closing or clearing.`);
  }
  lines.push('Nothing in this letter left your device to be written.');

  return {
    title: `${input.shopName || 'Your shop'} — week to ${iso.slice(0, 10)}`,
    lines,
    netAtoms: net,
    sales: week.length,
  };
}
