import type { Ledger } from './ledger';
export interface DayClosure {
  date: string;
  at: string;
  fingerprint: string;
}
export function dayFingerprint(l: Ledger, date: string): string {
  const invoices = l.invoices
    .filter((i) => i.createdAt.slice(0, 10) === date)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(invoices.map((i) => i.id));
  return JSON.stringify(
    [
      invoices,
      l.refunds.filter((r) => ids.has(r.invoiceId)).sort((a, b) => a.id.localeCompare(b.id)),
    ],
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );
}
export function unresolved(l: Ledger, date: string) {
  return l.invoices.filter(
    (i) => i.createdAt.slice(0, 10) === date && i.status !== 'complete' && i.status !== 'cancelled',
  );
}
export function unclosedDays(l: Ledger, today: string): string[] {
  return [...new Set(l.invoices.map((i) => i.createdAt.slice(0, 10)))]
    .filter(
      (d) =>
        d < today &&
        !l.closures?.some((c) => c.date === d && c.fingerprint === dayFingerprint(l, d)),
    )
    .sort()
    .reverse();
}
export function closeDay(
  l: Ledger,
  date: string,
  e: { fingerprint: string; report: boolean; backup: boolean; reviewed: boolean },
): void {
  if (
    unresolved(l, date).length ||
    !e.report ||
    !e.backup ||
    !e.reviewed ||
    e.fingerprint !== dayFingerprint(l, date)
  )
    throw new Error(
      'Day not closed: resolve payments, review totals, export the current report and confirm a current backup first.',
    );
  l.closures = [
    ...(l.closures ?? []).filter((c) => c.date !== date),
    { date, at: new Date().toISOString(), fingerprint: e.fingerprint },
  ];
}
