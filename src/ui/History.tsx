import { c0, c1, c3, c4, c6, c7, c15, c19, c24, c26, c36, c38 } from './classes';
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveInvoice, sameInvoice, type Invoice } from '../core/orders';
import ConfirmButton from './ConfirmButton';
import { readReceipt } from '../core/digital-receipt';
import { closeDay, dayFingerprint, unresolved, unclosedDays } from '../core/day-close';
import { createLedger, fromWire } from '../core/ledger';
import { createRepository } from '../core/accounts';
import { closeReport, dayClose, daysWithSales, salesCsv, type SaleRow } from '../core/history';
import { findSales } from '../core/findsale';
import {
  METHOD_LABEL,
  checkRefund,
  makeRefund,
  refundedSoFar,
  type RefundMethod,
} from '../core/refunds';
import { loadSettings } from '../core/settings';
import { lastBackupAt } from '../core/backup';
import { formatCoinAmount } from '../core/money';
import { ScanField } from './Scan';
import { escapeHtml, openPrintable } from './print';
import Sheet from './Sheet';
import InfoVideo from './InfoVideo';
import Blocker from './Blocker';
import { store as appStore } from '../core/storage';

const COIN_WORD = { btc: 'Bitcoin', ltc: 'Litecoin' } as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Plain number for "how long since the last `.slip` file". Hours < 1 read as "today". */
function backupNudgeText(at: string | null): string {
  if (!at) return 'never — take one now';
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return 'today';
  const hours = (Date.now() - then) / 3_600_000;
  if (hours < 1) return 'today';
  const days = Math.floor(hours / 24);
  if (days < 1) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export default function History() {
  const ledger = useMemo(() => createLedger(appStore()), []);
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const [version, setVersion] = useState(0);
  const todayIso = today();
  const [date, setDate] = useState(todayIso);
  const [find, setFind] = useState('');
  const [exported, setExported] = useState('');
  const [reviewed, setReviewed] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState('');

  // The reconciliation sweep can complete a sale while this panel is open; without this the
  // day close would quietly show the numbers from before the sweep.
  useEffect(() => {
    const onChanged = () => setVersion((v) => v + 1);
    window.addEventListener('slip:data-changed', onChanged);
    return () => window.removeEventListener('slip:data-changed', onChanged);
  }, []);

  const data = ledger.load();
  const fingerprint = dayFingerprint(data, date);
  const unfinished = unresolved(data, date);
  const previous = unclosedDays(data, todayIso)[0];
  const isClosed = data.closures?.some((c) => c.date === date && c.fingerprint === fingerprint);
  let backupCurrent = false;
  try {
    const raw = appStore().getItem('slip.backup-books.v1');
    if (raw) backupCurrent = dayFingerprint(fromWire(JSON.parse(raw)), date) === fingerprint;
  } catch {
    /* invalid or unavailable backup evidence is not success */
  }
  const canClose =
    unfinished.length === 0 &&
    exported === fingerprint &&
    reviewed === fingerprint &&
    backupCurrent &&
    backupConfirmed === fingerprint;
  async function confirmClose() {
    try {
      await ledger.transaction((draft) => {
        const latest = draft.load();
        closeDay(latest, date, {
          fingerprint,
          report: exported === fingerprint,
          reviewed: reviewed === fingerprint,
          backup: backupCurrent && backupConfirmed === fingerprint,
        });
        draft.save(latest);
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'Day could not be closed' });
    }
  }
  async function resolveSale(captured: Invoice, action: 'cancel' | 'manual') {
    try {
      await ledger.transaction(draft => {
        const live = draft.load().invoices.find(i => i.id === captured.id);
        if (!live || !sameInvoice(live, captured)) throw new Error('Sale changed. Review the latest Books before resolving.');
        const next = resolveInvoice(live, action);
        draft.touchInvoice(live.id, { status: next.status, manual: next.manual, confirmedAt: next.confirmedAt });
      });
      setVersion(v => v + 1);
      window.dispatchEvent(new Event('slip:data-changed'));
    } catch(e) { setNote({kind:'bad',text:e instanceof Error ? e.message : 'Could not resolve sale'}); }
  }
  const days = useMemo(() => {
    const list = daysWithSales(data.invoices);
    return list.includes(date) ? list : [date, ...list];
  }, [data.invoices, date]);

  // Which chain each wallet takes, so the books never add Litecoin atoms to Bitcoin atoms.
  const coinOf = useCallback(
    (walletId: string) =>
      createRepository(appStore())
        .load()
        .accounts.find((a) => a.id === walletId)?.coin ?? 'btc',
    [],
  );
  const close = useMemo(
    () => dayClose(data.invoices, data.refunds, date, coinOf),
    [data, date, coinOf],
  );
  const mixed = close.coins.length > 1;
  /** The counter's coin, used wherever one number has to stand for the day. */
  const dayCoin = close.coins[0] ?? 'btc';
  /** A day with two coins gets two numbers, never one blended sentence. */
  const perCoin = (pick: (t: (typeof close.byCoin)['btc']) => bigint) =>
    close.coins.map((c) => formatCoinAmount(pick(close.byCoin[c]), c)).join(' + ');

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

  // The backup nudge. The `.slip` file is the only recovery for a lost phone or a forgotten
  // PIN, so the day close says how old it is (or that it has never been taken) out loud.
  const [backupAt, setBackupAt] = useState<string | null>(() => lastBackupAt(appStore()));
  useEffect(() => {
    const onChanged = () => setBackupAt(lastBackupAt(appStore()));
    window.addEventListener('slip:data-changed', onChanged);
    return () => window.removeEventListener('slip:data-changed', onChanged);
  }, []);

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

  async function saveRefund() {
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
    try {
      await ledger.transaction((draft) => {
        const live = draft.load();
        const sale = live.invoices.find((i) => i.id === invoice.id);
        if (!sale) throw new Error('Sale no longer exists.');
        const latest = checkRefund(sale, live.refunds, value);
        if (!latest.ok) throw new Error(latest.reason ?? 'Refund changed in another tab.');
        draft.addRefund(refund);
      });
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'Refund was not recorded' });
      return;
    }
    setVersion((v) => v + 1);
    setRefunding(null);
    setNote({
      kind: 'ok',
      text: `refund recorded: ${value} sats (${METHOD_LABEL[method]}). slip did not move any money — this is a record.`,
    });
  }

  const csv = salesCsv([
      ...close.rows,
      ...cancelledRows.map((i) => ({
        id: i.id,
        receiptNumber: i.receiptNumber,
        status: 'cancelled',
        coin: coinOf(i.walletId),
        at: i.createdAt,
        walletLabel: i.walletLabel,
        rail: 'other' as const,
        atoms: 0n,
        refundedAtoms: 0n,
        netAtoms: 0n,
        manual: false,
        note: 'Cancelled — not taken',
        receivedAtoms: null,
        overpaidAtoms: 0n,
      })),
    ]);
  function downloadCsv() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slip-sales-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(fingerprint);
    const readProse = (node: HTMLElement) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('button, select, label').forEach((el) => el.remove());
      copy.querySelectorAll('.chip').forEach((el) => el.insertAdjacentText('afterend', ' '));
      const lines: string[] = [];
      const walk = (el: HTMLElement) => {
        const hasText = [...el.childNodes].some(
          (child) =>
            child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0,
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
    const words = bits
      .join('\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
    const html =
      `<!doctype html><title>Books</title>` +
      '<style>body{background:#fff;color:#000;font:16px/1.45 ui-monospace,monospace;margin:16px}pre{white-space:pre-wrap;margin:0}</style>' +
      `<pre>${escapeHtml(words)}</pre>`;
    openPrintable(html, 'slip-books');
  }

  function printClose(page: 'roll' | 'a4' = 'roll') {
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
    if (page === 'a4') {
      // A till roll is 80mm wide: on a sheet of A4 that is a thin strip down the left edge, which is
      // what a shopkeeper got when they printed a busy day to keep or to hand to an accountant. This is
      // the same report set for the paper it is going on, with the same numbers and the same words —
      // nothing is rounded or dropped, and the mixed-coin sentence stays exactly as the roll prints it.
      // Two sources, each good at one thing: the totals come from the same line list the roll prints,
      // so the two sheets can never disagree; the sale rows come from the structured day close, so the
      // columns are real columns instead of padded text that shifts when a rail name is longer.
      const isSaleLine = (line: string) => /^\d{2}:\d{2}\s/.test(line);
      const totals = report.lines
        .filter((line) => line.trim().length > 0 && !isSaleLine(line))
        .map((line) => {
          const cut = line.indexOf(': ');
          if (cut > 0 && cut < 28) {
            return `<tr><th>${escapeHtml(line.slice(0, cut))}</th><td>${escapeHtml(line.slice(cut + 2))}</td></tr>`;
          }
          return `<tr class="word"><td colspan="2">${escapeHtml(line)}</td></tr>`;
        })
        .join('');
      const sales = close.rows
        .map(
          (r) =>
            `<tr class="sale"><td class="c0">${escapeHtml(r.at.slice(11, 16))}</td>` +
            `<td class="c1">${escapeHtml(r.receiptNumber ?? r.id)}</td>` +
            `<td class="c2">${escapeHtml(formatCoinAmount(r.netAtoms, r.coin))}</td>` +
            `<td class="c3">${escapeHtml(r.rail)}</td></tr>`,
        )
        .join('');
      const html =
        `<!doctype html><title>${escapeHtml(report.title)}</title>` +
        `<style>
  @page { size: A4; margin: 14mm }
  html, body { margin: 0; background: #fff; color: #000 }
  body { font: 16px/1.45 Palatino, Georgia, serif }
  .page { width: 182mm; margin: 0 auto; padding-top: 2mm }
  .rule { border-top: 3px solid #000; border-bottom: 1px solid #000; height: 4px; margin: 0 0 16px }
  h1 { font-size: 34px; font-weight: 500; line-height: 1.1; margin: 0 }
  .sub { margin-top: 6px; font: 14px/1.4 ui-monospace, Menlo, monospace }
  table { width: 100%; margin-top: 14px; border-collapse: collapse; font: 14px/1.4 ui-monospace, Menlo, monospace }
  /* A busy day runs to a second page. A row must not be cut in half at the break, and the footer must
     not sit alone on a page of its own. */
  tr, .foot { break-inside: avoid }
  th { width: 46mm; text-align: left; font-weight: 400; padding: 5px 0; border-bottom: 1px solid #000; vertical-align: top }
  td { padding: 5px 0; border-bottom: 1px solid #000; text-align: right; font-weight: 700; vertical-align: top }
  tr.word th, tr.word td { border-bottom: 0 }
  tr.word td { text-align: left; font-weight: 400; padding: 2px 0; font-family: Palatino, Georgia, serif; font-size: 14px }
  tr.sale td { padding: 2px 0; border-bottom: 1px dotted #999; font-weight: 400; text-align: left; white-space: nowrap }
  tr.sale td.c0 { width: 16mm; color: #333 }
  tr.sale td.c1 { width: 40mm }
  tr.sale td.c2 { text-align: right; font-weight: 700 }
  tr.sale td.c3 { width: 30mm; text-align: right }
  table.sales { margin-top: 14px; table-layout: fixed }
  tr.sale td.c0 { width: 16mm }
  tr.sale td.c1 { width: auto }
  tr.sale td.c2 { width: 36mm }
  tr.sale td.c3 { width: 28mm }
  tr.head td { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #000; padding-bottom: 4px; text-align: left; font-weight: 700 }
  tr.head td.c2, tr.head td.c3 { text-align: right }
  .foot { margin-top: 22px; padding-top: 10px; border-top: 1px solid #000; font: 13px/1.5 ui-monospace, Menlo, monospace }
  .foot p { margin: 0 }
</style>
<div class="page"><div class="rule"></div><h1>${escapeHtml(settings.businessName || 'slip')}</h1>
<div class="sub">${escapeHtml(report.title)}</div>
<table>${totals}</table>${close.rows.length ? `<table class="sales"><tr class="head"><td class="c0">Time</td><td class="c1">Invoice</td><td class="c2">Net</td><td class="c3">Rail</td></tr>${sales}</table>` : ''}
<div class="foot"><p>Nothing here was rounded. A manual confirmation counts only because you said so.</p>
<p>slip · watch-only · no keys, no server</p></div></div>`;
      if (!openPrintable(html, 'slip-close-a4', 'width=900,height=1200')) {
        setNote({ kind: 'warn', text: 'allow pop-ups to print the day close' });
      }
      return;
    }
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
      className={`mt-6 panel v2-books`}
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
      <nav aria-label="Books day" className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block" htmlFor="hs-date">
          <span className="eyebrow">Day</span>
          <select
            id="hs-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={c4}
          >
            {days.slice(0, 60).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => setDate(todayIso)}>Today</button>
      </nav>
      <div className="flex items-center gap-2">
        <h2 className="panel-title mt-1">What you rang up</h2>
        <InfoVideo
          src="videos/04-books.mp4"
          poster="videos/04-books.jpg"
          title="The books and the day close"
          seconds={13}
        />
      </div>
      <p className={c0}>
        Completed sales only. Refunds are subtracted, and the sheet always states how much a human
        confirmed rather than slip observed.
      </p>

      {/* The day's line before its detail: the number a shopkeeper came for, and what it is made of. */}
      <div
        className={`mt-3 rounded-xl border border-line bg-surface p-3 v2-slip v2-slip-tear`}
        data-today-line
        data-books-sheet
        data-cancelled-count={close.cancelledCount}
        data-cancelled-atoms={close.cancelledAtoms.toString()}
      >
        <div className={c19}>
          <p className="eyebrow">{date === todayIso ? 'Today' : 'That day'}</p>
          <p className="text-[11px] text-muted">
            {close.count === 0
              ? 'Nothing taken'
              : `${close.count} ${close.count === 1 ? 'sale' : 'sales'}${close.manualAtoms > 0n ? ` · ${perCoin((t) => t.manualAtoms)} confirmed by you` : ' · all seen by slip'}`}
          </p>
        </div>
        {mixed ? (
          // Two chains in one day: two numbers, each named, and the sentence that says why there is
          // no single one. Atoms of Litecoin and atoms of Bitcoin are different money.
          <div data-books-mixed className="mt-1">
            {close.coins.map((coin) => (
              <p key={coin} className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="eyebrow w-16 shrink-0">{COIN_WORD[coin]}</span>
                <span className="figure text-[1.6rem] font-bold leading-none tabular-nums">
                  {formatCoinAmount(close.byCoin[coin].netAtoms, coin)}
                </span>
              </p>
            ))}
            <p className={c24}>
              This day has two coins, so it has two totals. They are never added together — a
              Litecoin litoshi is not a Bitcoin satoshi, and one number for both would be true of
              neither.
            </p>
          </div>
        ) : (
          <p className="figure v2-engrave mt-1 text-[2rem] font-bold leading-none tabular-nums">
            {formatCoinAmount(close.netAtoms, close.coins[0] ?? 'btc')}
          </p>
        )}
        {<span className="v2-rule v2-rule-tight" aria-hidden />}
        {close.cancelledCount > 0 && (
          <p className="mt-1 text-xs text-muted" data-cancelled>
            {close.cancelledCount} {close.cancelledCount === 1 ? 'sale was' : 'sales were'} started
            and cancelled — {perCoin((t) => t.cancelledAtoms)} was never taken
          </p>
        )}
        {close.count > 0 &&
          close.coins.map((coin) => {
            const t = close.byCoin[coin];
            return (
              <p key={coin} className="mt-1 text-xs text-muted" data-books-coin={coin}>
                {mixed ? `${COIN_WORD[coin]}: ` : ''}
                {formatCoinAmount(t.byRail.onchain, coin)} on-chain ·{' '}
                {formatCoinAmount(t.byRail.lightning, coin)} Lightning ·{' '}
                {formatCoinAmount(t.byRail.manual, coin)} marked by hand
                {t.refundedAtoms > 0n
                  ? ` · ${formatCoinAmount(t.refundedAtoms, coin)} refunded`
                  : ''}
              </p>
            );
          })}
        {close.count === 0 && close.cancelledCount > 0 && (
          <p className="mt-3 text-sm text-ink" data-empty-drawer>
            Nothing was taken. The drawer is empty. Cancelled lines are listed below, and they are
            not in this total.
          </p>
        )}
        {close.count === 0 && close.cancelledCount === 0 && (
          <p className="mt-3 text-sm text-ink">
            No sales on this day yet. Ring one up on Sell, and it lands here.
          </p>
        )}
        {date !== todayIso && (
          <button
            type="button"
            className={c15}
            onClick={() => setDate(todayIso)}
          >
            Show today
          </button>
        )}
      </div>

      <label className="mt-3 block" htmlFor="hs-find" data-panel="findsale">
        <span className="eyebrow">Find a sale</span>
        <input
          id="hs-find"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="amount, address ending, time, invoice…"
          className={c4}
        />
        <span className="mt-1 block text-[11px] text-muted">
          A customer comes back with a receipt and no invoice number: type what they remember.
        </span>
      </label>
      {previous && (
        <p className="mt-3 text-warn" data-unclosed-day>
          Not closed:{' '}
          <button type="button" className="underline" onClick={() => setDate(previous)}>
            Open Books for {previous}
          </button>
          . Late changes reopen a previously closed day.
        </p>
      )}
      <div className="mt-3 border border-line rounded-lg p-3" data-day-checklist>
        <h3>Day close checklist — {date}</h3>
        <p role="status">
          {isClosed
            ? 'Day explicitly closed. New records or changes reopen it.'
            : `${unfinished.length} unresolved payments. Resolve or explicitly cancel them before closing.`}
        </p>
        {unfinished.map((i) => (
          <div key={i.id} className="mt-2" data-unresolved-sale>
            <p>{i.receiptNumber ?? i.id}: {i.status}. Received: {(i.receivedAtoms === null || i.receivedAtoms === undefined) ? 'not checked' : i.receivedAtoms.toString() + ' atoms'}.</p>
            <p>Check the wallet first. Partial money is real money; marking paid records the full sale as manually accepted, not observed.</p>
            <ConfirmButton label="Accept as manually paid" confirmLabel="I checked and accept this sale as paid" onConfirm={() => void resolveSale(i, 'manual')} className="btn btn-secondary" />
            {!['seen', 'confirmed'].includes(i.status) && (i.receivedAtoms ?? 0n) === 0n && <ConfirmButton label="Cancel unpaid sale" confirmLabel="I checked the wallet: nothing received" onConfirm={() => void resolveSale(i, 'cancel')} className="btn btn-secondary" />}
          </div>
        ))}
        <label className="block mt-2">
          <input
            type="checkbox"
            checked={reviewed === fingerprint}
            onChange={(e) => setReviewed(e.target.checked ? fingerprint : '')}
          />{' '}
          I reviewed the per-coin totals above
        </label>
        <p className="mt-2">
          {exported === fingerprint
            ? 'Current report download requested. Confirm it finished.'
            : 'Download the current CSV report below.'}
        </p>
        <label className="block mt-2">
          <input
            type="checkbox"
            checked={backupConfirmed === fingerprint}
            onChange={(e) =>
              setBackupConfirmed(e.target.checked && backupCurrent ? fingerprint : '')
            }
          />{' '}
          I checked that a current encrypted backup finished downloading
        </label>
        {!backupCurrent && <p>Make a fresh backup of these records before confirming it.</p>}
        <p>
          Export and backup completion are confirmed by you, not verified by the browser.{' '}
          <a className="underline" href="#backup">
            Back up now
          </a>
        </p>
        <button
          type="button"
          className="btn btn-secondary mt-2"
          aria-disabled={!canClose}
          onClick={() => {
            if (canClose) void confirmClose();
          }}
        >
          Confirm day closed
        </button>
        {!canClose && (
          <p>
            Resolve every payment, review totals, request the current report and confirm a
            downloaded backup first.
          </p>
        )}
      </div>
      <div className={`mt-3 grid gap-2 sm:grid-cols-4 v2-leaders`} data-books-totals>

        {[
          ['Sales', String(close.count)],
          ['Net', perCoin((t) => t.netAtoms)],
          ['Refunded', perCoin((t) => t.refundedAtoms)],
        ].map(([k, v]) => (
          <div key={k} className={c7}>
            <span className="eyebrow">{k}</span>
            <p className="figure mt-0.5 text-xs">{v}</p>
          </div>
        ))}
      </div>

      <div className={`mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 v2-leaders`} data-books-rails>
        {(
          [
            ['on-chain', close.byRail.onchain],
            ['lightning', close.byRail.lightning],
            ['manual', close.byRail.manual],
            ['other', close.byRail.other],
          ] as ReadonlyArray<readonly [string, bigint]>
        ).map(([k, v]) => (
          <div key={k} className={c7}>
            <span className="eyebrow">{k}</span>
            <p className="figure mt-0.5 text-[11px]">{formatCoinAmount(v, dayCoin)}</p>
          </div>
        ))}
      </div>

      <p className={c6} data-books-observed>
        Observed by slip: <span className="figure">{perCoin((t) => t.observedAtoms)}</span> ·
        confirmed by a human: <span className="figure">{perCoin((t) => t.manualAtoms)}</span>
      </p>

      <details className="mt-3" data-export-preview><summary>Preview accounting export &amp; column guide</summary>
        <p>Exact CSV for the selected UTC day, identical to the download. Filters on the screen do not filter this export. Completed and manual sales are included; cancelled rows have zero amounts and status cancelled. Waiting, short and expired requests are excluded, not takings.</p>
        <p>Reconcile each coin separately with your own wallet, refunds and manual records. Never add BTC and LTC atoms together. Manual yes is a human assertion, not an observed payment. Recorded refunds do not prove money was sent. Overpayments are notes; totals use the asked amount. This is not a tax calculation or an accountant integration.</p>
        <dl>{[
          ['invoice','Local sale identifier'],['date_time_utc','Sale creation time in UTC, not settlement time'],['wallet','Local wallet label'],['coin','btc or ltc; keep separate'],['rail','onchain, lightning, manual or other; cancelled uses other'],['atoms','Asked amount in smallest coin units; cancelled zero'],['refunded_atoms','Recorded refunds, capped at ask'],['net_atoms','Ask minus recorded refunds; cancelled zero'],['amount','Formatted net coin amount, not fiat'],['overpaid_atoms','Observed excess above tolerance, not added to takings'],['manual','yes means human-confirmed; no is not itself payment proof'],['note','Local sale note; cancelled says not taken'],['receipt_number','Daily receipt number or sale identifier fallback'],['status','complete or cancelled']
        ].map(([name,meaning]) => <div key={name}><dt><strong>{name}</strong></dt><dd>{meaning}</dd></div>)}</dl>
        <p>Spreadsheet formula-like cells are prefixed with an apostrophe; commas, quotes and newlines use CSV escaping. Import text as text; do not enable formulas from untrusted data.</p>
        <label>Exact CSV preview<textarea readOnly value={csv} rows={8} className="w-full font-mono" data-csv-preview /></label>
      </details>
      <fieldset className="mt-3 flex flex-wrap gap-2">
        <legend>Reports &amp; exports — {date}</legend>
        <button
          type="button"
          onClick={() => {
            if (data.invoices.every((i) => i.createdAt.slice(0, 10) !== date)) return;
            downloadCsv();
          }}
          aria-disabled={data.invoices.every((i) => i.createdAt.slice(0, 10) !== date) || undefined}
          className="btn btn-secondary"
        >
          download CSV
        </button>
        <button
          type="button"
          onClick={() => {
            if (close.count === 0) return;
            printClose();
          }}
          aria-disabled={close.count === 0 || undefined}
          className={`btn btn-primary px-3 py-2 text-xs v2-close${close.count === 0 ? ' v2-blocked' : ''}`}
        >
          Close the day
        </button>
        <button
          type="button"
          onClick={() => {
            if (close.count === 0) return;
            printClose('a4');
          }}
          aria-disabled={close.count === 0 || undefined}
          className={`rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink${close.count === 0 ? ' v2-blocked' : ''}`}
        >
          Print on A4
        </button>
      </fieldset>
      <Blocker show={close.count === 0}>
        Nothing sold on this day yet, so there is no sheet to close and no CSV to download.
      </Blocker>

      <p className={c6} data-backup-nudge>
        Last backup: {backupNudgeText(backupAt)} —{' '}
        <a className="underline" href="#backup">
          back up now
        </a>
      </p>

      {note && (
        <p
          className={`mt-2 text-[11px] ${note.kind === 'bad' ? 'text-bad' : note.kind === 'warn' ? 'text-warn' : 'text-muted'}`}
        >
          {note.text}
        </p>
      )}



      {close.count === 0 ? (
        <p className={c38}>
          Nothing sold on {date}. Every sale that completes lands here, and the day closes with a
          digest you can stamp.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {visibleRows.map((row) => (
              <li key={row.id} className="rounded-lg border border-line p-2" data-sale-row>
                <div className={c19}>
                  <span className="text-xs">
                    {row.at.slice(11, 16)} · {row.walletLabel}
                    {row.note ? ` · ${row.note}` : ''}
                  </span>
                  <span className="figure text-xs">{formatCoinAmount(row.netAtoms, row.coin)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  <span className="chip mr-1">{row.rail}</span>
                  {row.manual ? 'manual confirmation · ' : ''}
                  {row.refundedAtoms > 0n
                    ? `refunded ${formatCoinAmount(row.refundedAtoms, row.coin)} · `
                    : ''}
                  {row.overpaidAtoms > 0n
                    ? ` · over by ${formatCoinAmount(row.overpaidAtoms, row.coin)}`
                    : ''}
                  {row.receiptNumber ?? row.id}
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
          <Sheet
            open={refunding !== null}
            onClose={() => setRefunding(null)}
            title="Record a refund"
          >
            <label className="block" htmlFor="rf-atoms">
              <span className="eyebrow">Amount to refund</span>
              <input
                id="rf-atoms"
                value={atoms}
                onChange={(e) => setAtoms(e.target.value)}
                inputMode="numeric"
                className={c36}
              />
            </label>
            <div className={c26}>
              <label className="block" htmlFor="rf-method">
                <span className="eyebrow">How it went back</span>
                <select
                  id="rf-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as RefundMethod)}
                  className={c3}
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
                  className={c1}
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
                className={c3}
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={saveRefund} className="btn btn-primary">
                record refund
              </button>
              <button
                type="button"
                onClick={() => setRefunding(null)}
                className="btn btn-secondary"
              >
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
              <li
                key={inv.id}
                className="rounded-lg border border-dashed border-line p-2 opacity-80"
                data-sale-row
                data-cancelled={inv.id}
              >
                <div className={c19}>
                  <span className="text-xs">
                    {inv.createdAt.slice(11, 16)} · {inv.walletLabel}
                    {inv.note ? ` · ${inv.note}` : ''}
                  </span>
                  <span className="figure text-xs line-through opacity-60">
                    {formatCoinAmount(inv.amountAtoms, coinOf(inv.walletId))}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  <span className="chip mr-1">cancelled</span>
                  {inv.receiptNumber ?? inv.id}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScanField
        label="Scan a receipt"
        onScan={(text) => {
          setNote({
            kind: 'ok',
            text: `scanned: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`,
          });
          let reference = text.split('|')[1];
          try {
            reference = readReceipt(new URL(text).hash)?.reference ?? reference;
          } catch {
            /* legacy paper proof */
          }
          const row = close.rows.find((r) => r.id === reference || r.receiptNumber === reference);
          if (row) startRefund(row);
          else
            setNote({
              kind: 'warn',
              text: 'that receipt is not on this day — pick its date above',
            });
        }}
      />
    </section>
  );
}
