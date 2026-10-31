/**
 * The day book, and stamping it.
 *
 * A till's books are worth more than its wallets: anyone can see an address on chain, but only
 * the merchant can prove what they rang up. So slip hashes each day's completed sales into one
 * digest — locally, with no network — and only if the merchant asks does it hand that digest to
 * a public OpenTimestamps calendar.
 *
 * The wording matters. A submitted digest is not a Bitcoin confirmation yet; the calendar
 * upgrades it in its own time. The screen says exactly that, because a merchant who believes
 * they are timestamped when they are only queued has been lied to by the UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { CALENDARS, dayDigest, describeAnchor, submitAnchor, verifyLocally, type Anchor, type DayBook } from '../core/anchor';
import { formatSats } from '../core/money';
import { store as appStore } from '../core/storage';

function recentDays(count: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function AnchorPanel() {
  const ledger = useMemo(() => createLedger(appStore()), []);
  const days = useMemo(() => recentDays(7), []);
  const [date, setDate] = useState(days[0]!);
  const [book, setBook] = useState<DayBook | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>(() => ledger.load().anchors);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<string | null>(null);

  const compute = useCallback(async () => {
    const invoices = ledger.load().invoices;
    try {
      setBook(await dayDigest(invoices, date));
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'could not hash this day');
    }
  }, [date, ledger]);

  useEffect(() => {
    void compute();
  }, [compute]);

  const existing = anchors.find((a) => a.date === date) ?? null;

  async function stamp() {
    if (!book) return;
    if (book.count === 0) {
      setNote('nothing was completed on that day — there is nothing to stamp');
      return;
    }
    setBusy(true);
    try {
      const anchor = await submitAnchor(book);
      const next = [...anchors.filter((a) => a.date !== date), anchor];
      ledger.save({ ...ledger.load(), anchors: next });
      setAnchors(next);
      setNote(describeAnchor(anchor));
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    if (!existing) return;
    const invoices = ledger.load().invoices;
    const r = await verifyLocally(
      { date: existing.date, count: 0, totalAtoms: 0n, digestHex: existing.digestHex },
      invoices,
    );
    setCheck(r.ok ? 'The books still hash to the stamped digest.' : `The books no longer match: ${r.reason}`);
  }

  return (
    <section className="mt-6 panel" data-panel="anchor">
      <p className="eyebrow">Day book &amp; proof</p>
      <h2 className="panel-title mt-1">Prove what you rang up</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Each day&apos;s completed sales are hashed into one digest on this device. Nothing leaves
        until you press stamp, and stamping only submits the digest to a public calendar — it is
        not a Bitcoin confirmation yet.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="block" htmlFor="an-date">
          <span className="eyebrow">Day</span>
          <select
            id="an-date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setCheck(null);
              setNote(null);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-line px-2 py-1">
          <span className="eyebrow">Completed sales</span>
          <p className="figure mt-0.5 text-xs">
            {book ? `${book.count} · ${formatSats(book.totalAtoms)}` : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-line px-2 py-1">
          <span className="eyebrow">Day digest</span>
          <p className="mt-0.5 break-all font-mono text-[10px]">{book ? book.digestHex.slice(0, 32) + '…' : '—'}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void stamp()}
          disabled={busy || !book || book.count === 0 || existing?.status === 'submitted'}
          className="rounded-lg border border-accent px-3 py-2 text-[11px] uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
        >
          {busy ? 'submitting…' : existing?.status === 'submitted' ? 'already stamped' : 'stamp with a calendar'}
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => void recheck()}
            className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
          >
            re-hash my books
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Calendars: {CALENDARS.join(' · ')} — third parties we do not control. They learn that a
        digest of this shape exists, and nothing about your customers.
      </p>

      {existing && (
        <div className="mt-2 rounded-lg border border-line p-2 text-[11px]">
          <p className="text-ink">{describeAnchor(existing)}</p>
          <p className="mt-1 text-muted">
            {existing.status === 'submitted'
              ? `submitted ${existing.submittedAt?.slice(0, 16).replace('T', ' ')} UTC to ${existing.calendar} · proof kept (${existing.proofBase64?.length ?? 0} bytes)`
              : existing.status === 'failed'
                ? `nothing was sent successfully (${existing.error ?? 'unknown error'})`
                : 'hashed here only — never submitted'}
          </p>
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}
      {check && <p className="mt-1 text-[11px] text-ok">{check}</p>}
    </section>
  );
}
