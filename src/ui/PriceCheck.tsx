/**
 * "Price check" — the money maths, on screen.
 *
 * This is the till's arithmetic before the till exists: type a price and a rate and
 * see exactly what slip would charge, including the rounding. It writes nothing, keeps
 * nothing and cannot take a payment. It exists so the rules are inspectable rather than
 * described: every figure below comes from `core/money.ts`, integer-only.
 */

import { useMemo, useState } from 'react';
import {
  computeTotals,
  fiatToAtoms,
  formatFiat,
  formatSats,
  parseFiat,
  parseRate,
} from '../core/money';
import { CURRENCIES } from '../core/currencies';

const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'MXN', 'KWD', 'VND'];

export default function PriceCheck() {
  const [price, setPrice] = useState('4.50');
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState('60000.00');
  const [taxBps, setTaxBps] = useState('0');
  const [tipBps, setTipBps] = useState('0');

  const result = useMemo(() => {
    try {
      const amount = parseFiat(price, currency);
      const rateMinor = parseRate(rate, currency);
      const totals = computeTotals({
        currency,
        lines: [{ unitMinor: amount.minor, priceCurrency: 'FIAT', quantity: 1n }],
        ...(Number(taxBps) > 0
          ? { tax: { rateBps: BigInt(Math.round(Number(taxBps))), inclusive: false } }
          : {}),
        ...(Number(tipBps) > 0 ? { tipBps: BigInt(Math.round(Number(tipBps))) } : {}),
      });
      return {
        ok: true as const,
        sats: fiatToAtoms({ minor: totals.totalMinor, currency }, rateMinor),
        totals,
        minorUnits: CURRENCIES[currency]?.minorUnits ?? 2,
      };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : 'invalid input' };
    }
  }, [price, currency, rate, taxBps, tipBps]);

  return (
    <section className="mt-6 panel lg:mt-0">
      <h2 className="panel-title">Price check</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        The till&apos;s arithmetic, before the till exists. Integer-only: fiat is counted in
        minor units, sats are counted in whole sats, and the fiat→sats step always rounds{' '}
        <span className="text-ink">up</span> so you are never short.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block" htmlFor="pc-price">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Price</span>
          <input
            id="pc-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="pc-currency">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Currency</span>
          <select
            id="pc-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          >
            {COMMON.map((c) => (
              <option key={c} value={c}>
                {c} — {CURRENCIES[c]?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor="pc-rate">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Rate (per 1 BTC)
          </span>
          <input
            id="pc-rate"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="pc-tax">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tax (bps)</span>
          <input
            id="pc-tax"
            value={taxBps}
            onChange={(e) => setTaxBps(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="pc-tip">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Tip (bps)</span>
          <input
            id="pc-tip"
            value={tipBps}
            onChange={(e) => setTipBps(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      {!result.ok ? (
        <p className="mt-4 rounded-lg border border-warn p-3 text-sm text-warn" role="alert">
          {result.message}
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {[
            ['Subtotal', formatFiat({ minor: result.totals.subtotalMinor, currency }, 'en')],
            ['Tax', formatFiat({ minor: result.totals.taxMinor, currency }, 'en')],
            ['Tip', formatFiat({ minor: result.totals.tipMinor, currency }, 'en')],
            ['Total', formatFiat({ minor: result.totals.totalMinor, currency }, 'en')],
            ['Charge', formatSats(result.sats)],
            ['Minor units', String(result.minorUnits)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">{k}</dt>
              <dd className="mt-0.5 font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        100 bps = 1%. A rate is only ever used from a snapshot you can see; slip never
        invents a price.
      </p>
    </section>
  );
}
