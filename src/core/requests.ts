/**
 * Standing requests — rent, subscriptions, a monthly deposit to a parent.
 *
 * A "request" is not a payment. It is a recurring ask with an amount, a wallet and a due
 * date, so the app can answer "is Mum's rent covered this month?" without pretending to
 * know anything the chain has not told it.
 */

import type { Invoice } from './orders';

export type Cadence = 'once' | 'weekly' | 'monthly';

export interface StandingRequest {
  readonly id: string;
  readonly label: string;
  readonly walletId: string;
  readonly walletLabel: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly cadence: Cadence;
  /** ISO date (YYYY-MM-DD) this request is next due. */
  readonly nextDue: string;
  readonly createdAt: string;
  readonly lastPaidAt: string | null;
}

export function nextDueAfter(cadence: Cadence, from: Date): Date {
  const d = new Date(from.getTime());
  if (cadence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (cadence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDue(request: StandingRequest, now = new Date()): boolean {
  return request.nextDue <= now.toISOString().slice(0, 10);
}

/** Days late (positive) or days remaining (negative). */
export function daysFromDue(request: StandingRequest, now = new Date()): number {
  const due = new Date(`${request.nextDue}T00:00:00Z`).getTime();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((today - due) / 86_400_000);
}

export function markRequestPaid(request: StandingRequest, paidAt = new Date()): StandingRequest {
  const next = nextDueAfter(request.cadence, new Date(`${request.nextDue}T00:00:00Z`));
  return {
    ...request,
    lastPaidAt: paidAt.toISOString(),
    nextDue: next.toISOString().slice(0, 10),
  };
}

export interface BudgetClock {
  /** Completed takings in the last 30 days, in atoms. */
  readonly in30dAtoms: bigint;
  /** Sum of the requests that fall due in the next 30 days, in atoms (best effort). */
  readonly out30dAtoms: bigint;
  /** Days of runway if outflow continues — null when there is no outflow to divide by. */
  readonly runwayDays: number | null;
  readonly dueNow: number;
}

/**
 * A deliberately blunt clock: what came in over 30 days against what is committed over the
 * next 30. It is a sanity check, not accounting — the UI says so.
 */
export function budgetClock(
  invoices: readonly Invoice[],
  requests: readonly StandingRequest[],
  now = new Date(),
  atomsPerFiatMinor = 0n,
): BudgetClock {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const in30d = invoices
    .filter((i) => i.status === 'complete' && i.createdAt >= since)
    .reduce((sum, i) => sum + i.amountAtoms, 0n);

  const horizon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const out = requests
    .filter((r) => r.nextDue <= horizon)
    .reduce((sum, r) => sum + r.amountMinor, 0n);

  const outAtoms = atomsPerFiatMinor > 0n ? (out * atomsPerFiatMinor) / 1_000_000n : out;

  return {
    in30dAtoms: in30d,
    out30dAtoms: outAtoms,
    runwayDays: outAtoms > 0n ? Number((in30d * 30n) / outAtoms) : null,
    dueNow: requests.filter((r) => isDue(r, now)).length,
  };
}
