/**
 * Rent & standing requests, plus the blunt budget clock.
 *
 * A request is an ask, not a payment: "Mum's rent, 1st of the month". Paying it shows the
 * same QR a sale does (the payer is often standing right there), and the app never claims a
 * request is covered unless an invoice for it was actually completed.
 */

import { useEffect, useMemo, useState } from 'react';
import { createRepository, deriveForAccount, statusOf, type CounterAccount } from '../core/accounts';
import { createLedger } from '../core/ledger';
import { burnInvoiceIndex, createInvoice } from '../core/orders';
import EmptyState from './EmptyState';
import {
  budgetClock,
  daysFromDue,
  isDue,
  markRequestPaid,
  nextDueAfter,
  type Cadence,
  type StandingRequest,
} from '../core/requests';
import { fiatToAtoms, formatFiat, formatSats, parseFiat, parseRate } from '../core/money';
import { loadSettings } from '../core/settings';
import { paymentUri, renderQrSvg } from '../core/qr';
import { store as appStore } from '../core/storage';
import AddressText from './AddressText';
import AwaitingStrip from './AwaitingStrip';
import Sheet from './Sheet';

export default function Requests() {
  const settings = useMemo(() => loadSettings(appStore()).settings, []);
  const ledger = useMemo(() => createLedger(appStore()), []);
  const accounts = useMemo<CounterAccount[]>(() => createRepository(appStore()).load().accounts, []);

  const [label, setLabel] = useState('');
  const [walletId, setWalletId] = useState(accounts.find((a) => statusOf(a) === 'ready')?.id ?? '');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [rate, setRate] = useState('');
  const [showing, setShowing] = useState<{ request: StandingRequest; address: string; sats: bigint } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refundsOpen, setRefundsOpen] = useState(false);
  const [booksRev, setBooksRev] = useState(0);
  useEffect(() => {
    const on = () => setBooksRev((n) => n + 1);
    window.addEventListener('slip:books', on);
    return () => window.removeEventListener('slip:books', on);
  }, []);

  const data = useMemo(() => ledger.load(), [ledger, booksRev]);
  const clock = budgetClock(data.invoices, data.requests);

  function add() {
    const wallet = accounts.find((a) => a.id === walletId);
    if (!wallet) {
      setNote('choose a wallet first');
      return;
    }
    try {
      const minor = parseFiat(amount, settings.currency).minor;
      const today = new Date();
      const due = cadence === 'once' ? today : nextDueAfter(cadence, today);
      ledger.addRequest({
        id: `req_${Math.random().toString(36).slice(2, 8)}`,
        label: label.trim() || 'Untitled request',
        walletId: wallet.id,
        walletLabel: wallet.label,
        amountMinor: minor,
        currency: settings.currency,
        cadence,
        nextDue: due.toISOString().slice(0, 10),
        createdAt: today.toISOString(),
        lastPaidAt: null,
      });
      setLabel('');
      setAmount('');
      setNote('saved');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'could not save that request');
    }
  }

  function showQr(request: StandingRequest) {
    const wallet = accounts.find((a) => a.id === request.walletId);
    if (!wallet) {
      setNote('that wallet no longer exists');
      return;
    }
    if (!rate.trim()) {
      setNote('set a rate first — a request needs a sats amount to draw a QR');
      return;
    }
    try {
      const rateMinor = parseRate(rate, settings.currency);
      const sats = fiatToAtoms({ minor: request.amountMinor, currency: request.currency }, rateMinor);
      const book = ledger.book(wallet.id);
      const created = createInvoice({
        wallet,
        book,
        amountAtoms: sats,
        amountMinor: request.amountMinor,
        currency: request.currency,
        rateMinorPerCoin: rateMinor,
        buildAddress: (index) => deriveForAccount(wallet, index),
        note: `request:${request.id}`,
      });
      ledger.setBook(wallet.id, burnInvoiceIndex(created.invoice, created.book));
      ledger.putInvoice(created.invoice);
      setShowing({ request, address: created.invoice.address, sats });
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'could not build the request');
    }
  }

  function markPaid(request: StandingRequest) {
    ledger.touchRequest(request.id, markRequestPaid(request));
    setShowing(null);
    setNote(`${request.label} marked paid — next due ${markRequestPaid(request).nextDue}`);
  }

  return (
    <section className={`mt-6 panel v2-money-in`} data-panel="requests">
      <p className="eyebrow">Rent &amp; standing requests</p>
      <h2 className="panel-title mt-1">Money that arrives on a schedule</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        A request is an ask, not a payment: it has a wallet, an amount and a due date, and slip
        never calls it covered unless a completed invoice says so.
      </p>

      <div className={`mt-3 grid gap-2 sm:grid-cols-2 v2-form`}>
        <label className="block" htmlFor="rq-label">
          <span className="eyebrow">What is it</span>
          <input
            id="rq-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Mum's rent"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="rq-wallet">
          <span className="eyebrow">Into wallet</span>
          <select
            id="rq-wallet"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor="rq-amount">
          <span className="eyebrow">Amount ({settings.currency})</span>
          <input
            id="rq-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="900.00"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="rq-cadence">
          <span className="eyebrow">How often</span>
          <select
            id="rq-cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            <option value="once">Once</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="block" htmlFor="rq-rate">
          <span className="eyebrow">Rate per 1 BTC ({settings.currency})</span>
          <input
            id="rq-rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="60000.00"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2 rounded-lg border border-accent px-3 py-2 text-xs text-accent"
      >
        add request
      </button>

      {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}

      <AwaitingStrip
        invoices={data.invoices}
        onOpen={() => {
          location.hash = 'books';
        }}
      />

      <dl className={`mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 v2-leaders`}>
        {[
          ['In (30d)', formatSats(clock.in30dAtoms)],
          ['Committed (30d)', formatFiat({ minor: clock.out30dAtoms, currency: settings.currency })],
          ['Runway', clock.runwayDays === null ? '—' : `${clock.runwayDays} days`],
          ['Due now', String(clock.dueNow)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line px-2 py-1">
            <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">{k}</dt>
            <dd className="figure mt-0.5 text-xs">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-muted">
        A blunt clock: completed takings over 30 days against requests due in the next 30. It is a
        sanity check, not accounting.
      </p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="panel-title">Standing requests</h3>
        <button type="button" className="btn btn-secondary px-3 py-2 text-xs" onClick={() => setRefundsOpen(true)}>
          Refunds
        </button>
      </div>

      {data.requests.length === 0 && (
        <EmptyState>
          No standing money yet. Add rent, a subscription or a wage above — each one gets a due date
          and a counter to pay into, and is only marked covered when a sale for it completes.
        </EmptyState>
      )}

      {data.requests.length > 0 && (
        <ul className="mt-3 space-y-1">
          {data.requests.map((r) => {
            const days = daysFromDue(r);
            const late = days > 0;
            return (
              <li key={r.id} className="v2-request">
                {/* Label, leader, amount — the same shape as every other figure in the app. The due
                    state rides underneath as a word, not a coloured box competing with the number. */}
                <div className="v2-row">
                  <dl>
                    <div className="v2-row-line">
                      <dt>{r.label}</dt>
                      <span className="v2-leader" aria-hidden />
                      <dd>
                        <span className="figure">{formatFiat({ minor: r.amountMinor, currency: r.currency })}</span>
                      </dd>
                    </div>
                    <p className="v2-row-sub">
                      {r.cadence} · into {r.walletLabel}
                      {r.lastPaidAt ? ` · last paid ${r.lastPaidAt.slice(0, 10)}` : ''} ·{' '}
                      {isDue(r) && <span className="v2-beat" aria-hidden />}{' '}
                      <span className={isDue(r) ? 'text-warn' : undefined} data-request-due>
                        {isDue(r) ? (late ? `${days} days late` : 'due now') : `due ${r.nextDue}`}
                      </span>
                    </p>
                  </dl>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => showQr(r)}
                    className="rounded border border-line px-2 text-xs text-muted hover:text-ink"
                  >
                    show request QR
                  </button>
                  <button
                    type="button"
                    onClick={() => markPaid(r)}
                    className="rounded border border-line px-2 text-xs text-muted hover:text-ink"
                  >
                    mark paid
                  </button>
                </div>

                {showing?.request.id === r.id && (
                  <div className="mt-2 flex flex-wrap items-start gap-3">
                    <div
                      className="v2-qr-box"
                      dangerouslySetInnerHTML={{
                        __html: renderQrSvg(
                          paymentUri('bitcoin', {
                            address: showing.address,
                            amountSats: showing.sats,
                            label: r.label,
                          }),
                          { scale: 5, margin: 2 },
                        ),
                      }}
                    />
                    <div className="min-w-0 flex-1 text-[11px] text-muted">
                      <p className="break-all font-mono">
                        <AddressText address={showing.address} />
                      </p>
                      <p className="mt-1">
                        <span className="figure text-ink">{formatSats(showing.sats)}</span> · {r.label}
                      </p>
                      <p className="mt-1 text-warn">
                        Pay the exact amount, on the {r.walletLabel} wallet&apos;s network. A fresh
                        address was reserved for this request.
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={refundsOpen} onClose={() => setRefundsOpen(false)} title="Refunds">
        <p className="text-sm leading-relaxed">
          A refund is a record of money you sent back yourself. slip cannot send it. Open Books, find
          the sale, and record it there.
        </p>
        <a className="btn btn-primary mt-3 inline-block" href="#books" onClick={() => setRefundsOpen(false)}>
          Open Books
        </a>
      </Sheet>
    </section>
  );
}
