/**
 * Sales history and the day close.
 *
 * This is the screen an accountant asks for: every completed sale for a date, split by rail,
 * with refunds subtracted and the manual confirmations stated separately from what slip actually
 * observed. It prints as plain text and exports as CSV, because both outlive a web page.
 *
 * The refund form lives here rather than on the receipt for one reason: a refund is usually
 * decided minutes or days later, and the receipt is gone by then.
 */

import { useEffect, useMemo, useState } from 'react';
import { createLedger } from '../core/ledger';
import { closeReport, dayClose, daysWithSales, salesCsv, type SaleRow } from '../core/history';
import { findSales } from '../core/findsale';
import { METHOD_LABEL, checkRefund, makeRefund, refundedSoFar, type RefundMethod } from '../core/refunds';
import { loadSettings } from '../core/settings';
import { formatSats } from '../core/money';
import { ScanField } from './Scan';
import { escapeHtml, openPrintable } from './print';
import { isSkinV2 } from './skin';
import Sheet from './Sheet';
import InfoVideo from './InfoVideo';
import Blocker from './Blocker';
import { store as appStore } from '../core/storage';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function History() {
  const ledger = useMemo(() => createLedger(appStore()), []);
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const [version, setVersion] = useState(0);
  const todayIso = today();
  const [date, setDate] = useState(todayIso);
  const [find, setFind] = useState('');

  // The reconciliation sweep can complete a sale while this panel is open; without this the
  // day close would quietly show the numbers from before the sweep.
  useEffect(() => {
    const onChanged = () => setVersion((v) => v + 1);
    window.addEventListener('slip:data-changed', onChanged);
    return () => window.removeEventListener('slip:data-changed', onChanged);
  }, []);

  const data = ledger.load();
  const days = useMemo(() => {
    const list = daysWithSales(data.invoices);
    return list.includes(date) ? list : [date, ...list];
  }, [data.invoices, date]);

  const close = useMemo(() => dayClose(data.invoices, data.refunds, date), [data, date]);

  // The search runs over the day's rows, so a match keeps the day's totals beside it.
  const visibleRows = useMemo(() => {
    if (find.trim().length < 2) return close.rows;
    const matched = new Set(findSales(data.invoices, find, 40).map((m) => m.invoice.id));
    const rows = close.rows.filter((r) => matched.has(r.id));
    return rows.length > 0 ? rows : close.rows;
  }, [find, close.rows, data.invoices]);

  // Sales that were started on this day and walked away from. Kept separate from the
  // takings: they were never paid, so they never join the day's total.
  const cancelledRows = useMemo(
    () =>
      data.invoices
        .filter((i) => i.status === 'cancelled' && i.createdAt.slice(0, 10) === date)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    [data.invoices, date],
  );

  const [refunding, setRefunding] = useState<SaleRow | null>(null);
  const [atoms, setAtoms] = useState('');
  const [method, setMethod] = useState<RefundMethod>('onchain-sent');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  const invoiceFor = (row: SaleRow) => data.invoices.find((i) => i.id === row.id)!;

  function startRefund(row: SaleRow) {
    const remaining = invoiceFor(row).amountAtoms - refundedSoFar(data.refunds, row.id);
    setRefunding(row);
    setAtoms(remaining.toString());
    setMethod('onchain-sent');
    setReason('');
    setReference('');
    setNote(null);
  }

  function saveRefund() {
    if (!refunding) return;
    const invoice = invoiceFor(refunding);
    let value: bigint;
    try {
      value = BigInt(atoms.trim());
    } catch {
      setNote({ kind: 'bad', text: 'type a whole number of sats' });
      return;
    }
    const check = checkRefund(invoice, data.refunds, value);
    if (!check.ok) {
      setNote({ kind: 'bad', text: check.reason ?? 'that refund is not possible' });
      return;
    }
    if (reason.trim().length < 3) {
      setNote({ kind: 'bad', text: 'give a reason — your future self will want it' });
      return;
    }
    const refund = makeRefund({ invoice, atoms: value, method, reason, reference });
    ledger.addRefund(refund);
    setVersion((v) => v + 1);
    setRefunding(null);
    setNote({
      kind: 'ok',
      text: `refund recorded: ${value} sats (${METHOD_LABEL[method]}). slip did not move any money — this is a record.`,
    });
  }

  function downloadCsv() {
    const csv = salesCsv(close.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slip-sales-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const readProse = (node: HTMLElement) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('button, select, label').forEach((el) => el.remove());
      copy.querySelectorAll('.chip').forEach((el) => el.insertAdjacentText('afterend', ' '));
      const lines: string[] = [];
      const walk = (el: HTMLElement) => {
        const hasText = [...el.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0,
        );
        if (hasText || el.children.length === 0) {
          const line = el.innerText.replace(/\s+/g, ' ').trim();
          if (line) lines.push(line);
          return;
        }
        for (const child of el.children) walk(child as HTMLElement);
      };
      walk(copy);
      return lines.join('\n');
    };
    const bits = [
      document.querySelector('[data-today-line]'),
      document.querySelector('[data-books-observed]'),
      ...document.querySelectorAll('[data-sale-row]'),
    ]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => readProse(node))
      .filter((bit) => bit.length > 0);
    const words = bits.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    const html =
      `<!doctype html><title>Books</title>` +
      '<style>body{background:#fff;color:#000;font:16px/1.45 ui-monospace,monospace;margin:16px}pre{white-space:pre-wrap;margin:0}</style>' +
      `<pre>${escapeHtml(words)}</pre>`;
    openPrintable(html, 'slip-books');
  }

  function printClose() {
    const report = closeReport(close, settings.businessName, settings.currency);
    const rows = report.lines
      .map((line) => {
        const cut = line.indexOf(': ');
        if (cut > 0 && cut < 28) {
          return `<div class="row"><span>${escapeHtml(line.slice(0, cut))}</span><span>${escapeHtml(line.slice(cut + 2))}</span></div>`;
        }
        return `<p>${escapeHtml(line)}</p>`;
      })
      .join('');
    const html =
      `<!doctype html><title>${escapeHtml(report.title)}</title>` +
      '<style>@page{size:80mm auto;margin:4mm}body{width:72mm;font:12px/1.45 ui-monospace,monospace;color:#000;background:#fff;margin:0}' +
      '.row{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted #000;padding:3px 0}' +
      '.row span:last-child{font-weight:700}p{margin:6px 0}</style>' +
      rows;
    if (!openPrintable(html, 'slip-close')) {
      setNote({ kind: 'warn', text: 'allow pop-ups to print the day close' });
    }
  }

  return (
    <section
      className={`mt-6 panel ${isSkinV2() ? 'v2-books' : ''}`}
      data-version={version}
      data-panel="history"
      data-close-count={close.count}
      data-close-net={close.netAtoms.toString()}
      data-close-refunded={close.refundedAtoms.toString()}
      data-close-observed={close.observedAtoms.toString()}
      data-close-manual={close.manualAtoms.toString()}
      data-rail-onchain={close.byRail.onchain.toString()}
      data-rail-lightning={close.byRail.lightning.toString()}
      data-rail-manual={close.byRail.manual.toString()}
    >
      <p className="eyebrow">History &amp; day close</p>
      <div className="flex items-center gap-2">
        <h2 className="panel-title mt-1">What you rang up</h2>
        <InfoVideo
          src="videos/04-books.mp4"
          poster="videos/04-books.jpg"
          title="The books and the day close"
          seconds={13}
        />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Completed sales only. Refunds are subtracted, and the sheet always states how much a human
        confirmed rather than slip observed.
      </p>

      {/* The day's line before its detail: the number a shopkeeper came for, and what it is made of. */}
      <div className={`mt-3 rounded-xl border border-line bg-surface p-3 ${isSkinV2() ? 'v2-slip v2-slip-tear' : ''}`} data-today-line data-books-sheet data-cancelled-count={close.cancelledCount} data-cancelled-atoms={close.cancelledAtoms.toString()}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">{date === todayIso ? 'Today' : 'That day'}</p>
          <p className="text-[11px] text-muted">
            {close.count === 0
              ? 'Nothing taken'
              : `${close.count} ${close.count === 1 ? 'sale' : 'sales'}${close.manualAtoms > 0n ? ` · ${formatSats(close.manualAtoms)} confirmed by you` : ' · all seen by slip'}`}
          </p>
        </div>
        <p className="figure mt-1 text-[2rem] font-bold leading-none tabular-nums">
          {formatSats(close.netAtoms)}
        </p>
        {close.cancelledCount > 0 && (
          <p className="mt-1 text-xs text-muted" data-cancelled>
            {close.cancelledCount} {close.cancelledCount === 1 ? 'sale was' : 'sales were'} started and cancelled —{' '}
            {formatSats(close.cancelledAtoms)} was never taken
          </p>
        )}
        {close.count > 0 && (
          <p className="mt-1 text-xs text-muted">
            {formatSats(close.byRail.onchain)} on-chain · {formatSats(close.byRail.lightning)} Lightning ·{' '}
            {formatSats(close.byRail.manual)} marked by hand
            {close.refundedAtoms > 0n ? ` · ${formatSats(close.refundedAtoms)} refunded` : ''}
          </p>
        )}
        {close.count === 0 && close.cancelledCount > 0 && (
          <p className="mt-3 text-sm text-ink" data-empty-drawer>
            Nothing was taken. The drawer is empty. Cancelled lines are listed below, and they are not in this total.
          </p>
        )}
        {close.count === 0 && close.cancelledCount === 0 && (
          <p className="mt-3 text-sm text-ink">No sales on this day yet. Ring one up on Sell, and it lands here.</p>
        )}
        {date !== todayIso && (
          <button type="button" className="btn btn-secondary mt-2 px-2 py-1 text-xs" onClick={() => setDate(todayIso)}>
            Show today
          </button>
        )}
      </div>

      <div className={`mt-3 grid gap-2 sm:grid-cols-4 ${isSkinV2() ? 'v2-leaders' : ''}`} data-books-totals>
        <label className="block" htmlFor="hs-date">
          <span className="eyebrow">Day</span>
          <select
            id="hs-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            {days.slice(0, 60).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        {[
          ['Sales', String(close.count)],
          ['Net', formatSats(close.netAtoms)],
          ['Refunded', formatSats(close.refundedAtoms)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line px-2 py-1">
            <span className="eyebrow">{k}</span>
            <p className="figure mt-0.5 text-xs">{v}</p>
          </div>
        ))}
      </div>

      <div className={`mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 ${isSkinV2() ? 'v2-leaders' : ''}`} data-books-rails>
        {(
          [
            ['on-chain', close.byRail.onchain],
            ['lightning', close.byRail.lightning],
            ['manual', close.byRail.manual],
            ['other', close.byRail.other],
          ] as ReadonlyArray<readonly [string, bigint]>
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line px-2 py-1">
            <span className="eyebrow">{k}</span>
            <p className="figure mt-0.5 text-[11px]">{formatSats(v)}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted" data-books-observed>
        Observed by slip: <span className="figure">{formatSats(close.observedAtoms)}</span> · confirmed
        by a human: <span className="figure">{formatSats(close.manualAtoms)}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadCsv}
          disabled={close.count === 0}
          className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-50"
        >
          download CSV
        </button>
        <button
          type="button"
          onClick={printClose}
          disabled={close.count === 0}
          className={`btn btn-primary px-3 py-2 text-xs${isSkinV2() ? ' v2-close' : ''}`}
        >
          Close the day
        </button>
      </div>
      <Blocker show={close.count === 0}>Nothing sold on this day yet, so there is no sheet to close and no CSV to download.</Blocker>

      {note && (
        <p
          className={`mt-2 text-[11px] ${note.kind === 'bad' ? 'text-bad' : note.kind === 'warn' ? 'text-warn' : 'text-muted'}`}
        >
          {note.text}
        </p>
      )}

      <label className="mt-3 block" htmlFor="hs-find" data-panel="findsale">
        <span className="eyebrow">Find a sale</span>
        <input
          id="hs-find"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="amount, address ending, time, invoice…"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-[11px] text-muted">
          A customer comes back with a receipt and no invoice number: type what they remember.
        </span>
      </label>

      {close.count === 0 ? (
        <p className="mt-3 rounded-lg border border-line p-2 text-[11px] text-muted">
          Nothing sold on {date}. Every sale that completes lands here, and the day closes with a
          digest you can stamp.
        </p>
      ) : (
        <>
        <ul className="mt-3 space-y-1">
          {visibleRows.map((row) => (
            <li key={row.id} className="rounded-lg border border-line p-2" data-sale-row>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs">
                  {row.at.slice(11, 16)} · {row.walletLabel}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
                <span className="figure text-xs">{formatSats(row.netAtoms)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                <span className="chip mr-1">{row.rail}</span>
                {row.manual ? 'manual confirmation · ' : ''}
                {row.refundedAtoms > 0n ? `refunded ${formatSats(row.refundedAtoms)} · ` : ''}
                {row.id}
              </p>
              {row.refundedAtoms < row.atoms && (
                <button
                  type="button"
                  onClick={() => startRefund(row)}
                  className="mt-1 rounded border border-line px-2 text-xs text-muted hover:text-ink"
                >
                  refund
                </button>
              )}
            </li>
          ))}
        </ul>
        <Sheet open={refunding !== null} onClose={() => setRefunding(null)} title="Record a refund">
          <label className="block" htmlFor="rf-atoms">
            <span className="eyebrow">Amount to refund</span>
            <input
              id="rf-atoms"
              value={atoms}
              onChange={(e) => setAtoms(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block" htmlFor="rf-method">
              <span className="eyebrow">How it went back</span>
              <select
                id="rf-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as RefundMethod)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-xs outline-none focus:border-accent"
              >
                {(Object.keys(METHOD_LABEL) as RefundMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="rf-ref">
              <span className="eyebrow">Reference (txid, name)</span>
              <input
                id="rf-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-[11px] outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="mt-2 block" htmlFor="rf-reason">
            <span className="eyebrow">Reason</span>
            <input
              id="rf-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="wrong order"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-xs outline-none focus:border-accent"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={saveRefund} className="btn btn-primary">
              record refund
            </button>
            <button type="button" onClick={() => setRefunding(null)} className="btn btn-secondary">
              cancel
            </button>
          </div>
          <p className="mt-2 text-sm text-warn">
            slip cannot send money anywhere. This records a refund you made yourself.
          </p>
        </Sheet>
        </>
      )}

      {cancelledRows.length > 0 && (
        <div className="mt-3" data-cancelled-list>
          <p className="eyebrow">Cancelled on this day</p>
          <ul className="mt-1 space-y-1">
            {cancelledRows.map((inv) => (
              <li key={inv.id} className="rounded-lg border border-dashed border-line p-2 opacity-80" data-sale-row data-cancelled={inv.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs">
                    {inv.createdAt.slice(11, 16)} · {inv.walletLabel}
                    {inv.note ? ` · ${inv.note}` : ''}
                  </span>
                  <span className="figure text-xs line-through opacity-60">{formatSats(inv.amountAtoms)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  <span className="chip mr-1">cancelled</span>
                  {inv.id}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScanField
        label="Scan a receipt"
        onScan={(text) => {
          setNote({ kind: 'ok', text: `scanned: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}` });
          const id = text.split('|')[1];
          const row = close.rows.find((r) => r.id === id);
          if (row) startRefund(row);
          else setNote({ kind: 'warn', text: 'that receipt is not on this day — pick its date above' });
        }}
      />
    </section>
  );
}
