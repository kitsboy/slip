import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyDiscount,
  atomsFromWire,
  atomsToFiat,
  atomsToWire,
  changeDue,
  computeTotals,
  divRoundHalfUp,
  fiatFromWire,
  fiatToAtoms,
  fiatToWire,
  formatFiat,
  formatSats,
  isPaidEnough,
  minorUnitsOf,
  parseFiat,
  parseRate,
  percent,
  roundToIncrement,
  scaleOf,
  shortfall,
  splitInclusiveTotal,
  taxOnNet,
} from '../src/core/money';

interface Golden {
  conversions: Array<{
    fiat: string;
    currency: string;
    rate: string;
    fiatMinor: number;
    expectedSats: number;
  }>;
  percents: Array<{ amount: number; bps: number; expected: number }>;
  inclusiveTax: Array<{ total: number; bps: number; net: number; tax: number }>;
}

const golden = JSON.parse(
  readFileSync(resolve(__dirname, 'vectors/money-golden.json'), 'utf8'),
) as Golden;

// ---------------------------------------------------------------------------
// Cross-check against an independent Python implementation
// ---------------------------------------------------------------------------

describe('golden table (independent Python reference)', () => {
  it('has at least 50 cases, so a single lucky match cannot pass the suite', () => {
    const n = golden.conversions.length + golden.percents.length + golden.inclusiveTax.length;
    expect(n).toBeGreaterThanOrEqual(50);
  });

  for (const c of golden.conversions) {
    it(`${c.fiat} ${c.currency} at ${c.rate} → ${c.expectedSats} sats`, () => {
      const amount = parseFiat(c.fiat, c.currency);
      expect(amount.minor).toBe(BigInt(c.fiatMinor));
      const rate = parseRate(c.rate, c.currency);
      expect(fiatToAtoms(amount, rate)).toBe(BigInt(c.expectedSats));
    });
  }

  for (const p of golden.percents) {
    it(`percent(${p.amount}, ${p.bps}bps) = ${p.expected}`, () => {
      expect(percent(BigInt(p.amount), BigInt(p.bps))).toBe(BigInt(p.expected));
    });
  }

  for (const t of golden.inclusiveTax) {
    it(`tax-inclusive ${t.total} at ${t.bps}bps splits ${t.net} + ${t.tax}`, () => {
      const split = splitInclusiveTotal(BigInt(t.total), {
        rateBps: BigInt(t.bps),
        inclusive: true,
      });
      expect(split.net).toBe(BigInt(t.net));
      expect(split.tax).toBe(BigInt(t.tax));
      expect(split.net + split.tax).toBe(BigInt(t.total));
    });
  }
});

// ---------------------------------------------------------------------------
// Currency exponents
// ---------------------------------------------------------------------------

describe('currency exponents', () => {
  it('knows the zero- and three-decimal currencies', () => {
    expect(minorUnitsOf('USD')).toBe(2);
    expect(minorUnitsOf('JPY')).toBe(0);
    expect(minorUnitsOf('ISK')).toBe(0);
    expect(minorUnitsOf('KWD')).toBe(3);
    expect(minorUnitsOf('CLF')).toBe(4);
    expect(scaleOf('JPY')).toBe(1n);
    expect(scaleOf('KWD')).toBe(1000n);
  });

  it('refuses an unknown currency instead of assuming 2 decimals', () => {
    expect(() => parseFiat('10.00', 'ZZZ')).toThrow(/unknown currency/);
  });
});

// ---------------------------------------------------------------------------
// Parsing is strict on purpose
// ---------------------------------------------------------------------------

describe('parseFiat', () => {
  it('accepts plain amounts and pads to the currency scale', () => {
    expect(parseFiat('12.3', 'USD').minor).toBe(1230n);
    expect(parseFiat('1500', 'JPY').minor).toBe(1500n);
    expect(parseFiat('0.750', 'KWD').minor).toBe(750n);
  });

  it('refuses more decimals than the currency has', () => {
    expect(() => parseFiat('1.005', 'USD')).toThrow(/2 decimal place/);
    expect(() => parseFiat('1.5', 'JPY')).toThrow(/0 decimal place/);
  });

  it('refuses symbols, separators, signs and exponents', () => {
    for (const bad of ['$12.00', '1,234.00', '-5.00', '1e3', ' 1.2.3', '', '12.']) {
      expect(() => parseFiat(bad, 'USD'), bad).toThrow();
    }
  });

  it('formats with the right number of decimals per currency', () => {
    expect(formatFiat({ minor: 1234n, currency: 'USD' })).toBe('12.34 USD');
    expect(formatFiat({ minor: 1500n, currency: 'JPY' })).toBe('1,500 JPY');
    expect(formatFiat({ minor: 750n, currency: 'KWD' })).toBe('0.750 KWD');
    expect(formatFiat({ minor: 123456n, currency: 'USD' })).toBe('1,234.56 USD');
    expect(formatSats(7500n)).toBe('7,500 sats');
  });
});

// ---------------------------------------------------------------------------
// The rounding direction is the safety property
// ---------------------------------------------------------------------------

describe('fiat → sats always rounds up', () => {
  it('is never short by a satoshi', () => {
    // 1 CAD cent at 83,000.00 CAD/BTC = 12.048 sats → must be 13, never 12
    const sats = fiatToAtoms(parseFiat('0.01', 'CAD'), parseRate('83000.00', 'CAD'));
    expect(sats).toBe(13n);
    // What 13 sats is worth must cover the 1 cent we asked for.
    const back = atomsToFiat(13n, parseRate('83000.00', 'CAD'), 'CAD');
    expect(back.minor).toBeGreaterThanOrEqual(1n);
  });

  it('rounds a non-integer result up, never down', () => {
    const rate = parseRate('33333.33', 'USD');
    const sats = fiatToAtoms(parseFiat('13.37', 'USD'), rate);
    // 13.37 / 33333.33 * 1e8 = 40110.4 sats
    expect(sats).toBe(40111n);
  });

  it('refuses a zero or negative rate rather than inventing a price', () => {
    expect(() => fiatToAtoms(parseFiat('1.00', 'USD'), 0n)).toThrow(/positive/);
    expect(() => fiatToAtoms(parseFiat('1.00', 'USD'), -1n)).toThrow(/positive/);
  });
});

describe('integer helpers', () => {
  it('divRoundHalfUp rounds halves up in both directions', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(-4n, 2n)).toBe(-2n);
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(/zero/);
  });

  it('rounds cash totals to the nearest increment', () => {
    expect(roundToIncrement(1237n, 5n)).toBe(1235n);
    expect(roundToIncrement(1238n, 5n)).toBe(1240n);
    expect(roundToIncrement(1235n, 5n)).toBe(1235n);
  });
});

// ---------------------------------------------------------------------------
// Payment comparison
// ---------------------------------------------------------------------------

describe('payment comparison', () => {
  it('treats an exact payment as paid', () => {
    expect(isPaidEnough(7500n, 7500n)).toBe(true);
  });

  it('honours the underpayment tolerance in basis points', () => {
    // 1% tolerance on 10,000 sats = 100 sats
    expect(isPaidEnough(10000n, 9900n, 100n)).toBe(true);
    expect(isPaidEnough(10000n, 9899n, 100n)).toBe(false);
    expect(isPaidEnough(10000n, 9999n, 0n)).toBe(false);
  });

  it('reports shortfall and change separately and never a negative', () => {
    expect(shortfall(7500n, 7000n)).toBe(500n);
    expect(shortfall(7500n, 8000n)).toBe(0n);
    expect(changeDue(7500n, 8000n)).toBe(500n);
    expect(changeDue(7500n, 7000n)).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

describe('tax', () => {
  it('adds exclusive tax on top of the net', () => {
    expect(taxOnNet(1000n, { rateBps: 875n, inclusive: false })).toBe(88n);
  });

  it('extracts inclusive tax without changing the total', () => {
    const rule = { rateBps: 875n, inclusive: true };
    const total = 1088n;
    expect(taxOnNet(total, rule)).toBe(88n);
    expect(total - taxOnNet(total, rule)).toBe(1000n);
  });

  it('refuses an inclusive split when the rule is exclusive', () => {
    expect(() => splitInclusiveTotal(100n, { rateBps: 500n, inclusive: false })).toThrow(/inclusive/);
  });
});

// ---------------------------------------------------------------------------
// Whole orders
// ---------------------------------------------------------------------------

describe('computeTotals', () => {
  it('prices a simple two-line order in fiat', () => {
    const t = computeTotals({
      currency: 'USD',
      lines: [
        { unitMinor: 450n, priceCurrency: 'FIAT', quantity: 2n },
        { unitMinor: 325n, priceCurrency: 'FIAT', quantity: 1n, modifiersMinor: 50n },
      ],
    });
    expect(t.subtotalMinor).toBe(1275n); // 900 + 375
    expect(t.taxMinor).toBe(0n);
    expect(t.totalMinor).toBe(1275n);
    expect(t.roundedTotalMinor).toBe(1275n);
  });

  it('applies exclusive tax, a percent discount and a tip on the pre-tax amount', () => {
    const t = computeTotals({
      currency: 'USD',
      lines: [{ unitMinor: 2000n, priceCurrency: 'FIAT', quantity: 1n }],
      discount: { kind: 'percent', bps: 1000n }, // 10% → 1800
      tax: { rateBps: 500n, inclusive: false }, // 90
      tipBps: 1500n, // 15% of 1800 (pre-tax) = 270
      tipOnPreTax: true,
    });
    expect(t.discountMinor).toBe(200n);
    expect(t.taxMinor).toBe(90n);
    expect(t.tipMinor).toBe(270n);
    expect(t.totalMinor).toBe(2160n); // 1800 + 90 + 270
  });

  it('treats a tax-inclusive rule as already inside the price', () => {
    const t = computeTotals({
      currency: 'USD',
      lines: [{ unitMinor: 1087n, priceCurrency: 'FIAT', quantity: 1n }],
      tax: { rateBps: 875n, inclusive: true },
    });
    expect(t.taxMinor).toBe(87n);
    expect(t.totalMinor).toBe(1087n); // not 1175
  });

  it('prices a sats-denominated item through the rate, rounding down for the fiat figure', () => {
    const t = computeTotals({
      currency: 'USD',
      rateMinorPerCoin: parseRate('60000.00', 'USD'),
      lines: [{ unitMinor: 7500n, priceCurrency: 'SATS', quantity: 2n }],
    });
    // 7500 sats = $4.50 exactly, so two are $9.00
    expect(t.subtotalMinor).toBe(900n);
  });

  it('refuses a sats line with no rate', () => {
    expect(() =>
      computeTotals({
        currency: 'USD',
        lines: [{ unitMinor: 1n, priceCurrency: 'SATS', quantity: 1n }],
      }),
    ).toThrow(/needs a rate/);
  });

  it('refuses an empty order and a non-positive quantity', () => {
    expect(() => computeTotals({ currency: 'USD', lines: [] })).toThrow(/at least one line/);
    expect(() =>
      computeTotals({
        currency: 'USD',
        lines: [{ unitMinor: 100n, priceCurrency: 'FIAT', quantity: 0n }],
      }),
    ).toThrow(/positive/);
  });

  it('refuses a discount bigger than the order', () => {
    expect(() => applyDiscount(500n, { kind: 'fixed', minor: 600n })).toThrow(/larger/);
  });

  it('rounds a cash total to 0.05 and reports the rounding separately', () => {
    const t = computeTotals({
      currency: 'CAD',
      lines: [{ unitMinor: 1237n, priceCurrency: 'FIAT', quantity: 1n }],
      cashIncrementMinor: 5n,
    });
    expect(t.totalMinor).toBe(1237n);
    expect(t.roundedTotalMinor).toBe(1235n);
    expect(t.roundingMinor).toBe(-2n);
  });
});

// ---------------------------------------------------------------------------
// Serialisation: BigInt must never reach JSON.stringify raw
// ---------------------------------------------------------------------------

describe('wire format', () => {
  it('round-trips amounts as decimal strings', () => {
    const wire = fiatToWire({ minor: 123456789n, currency: 'USD' });
    expect(wire.minor).toBe('123456789');
    expect(() => JSON.stringify(wire)).not.toThrow();
    expect(fiatFromWire(JSON.parse(JSON.stringify(wire))).minor).toBe(123456789n);
  });

  it('would throw if a BigInt reached JSON directly — the reason this exists', () => {
    expect(() => JSON.stringify({ minor: 1n })).toThrow(TypeError);
  });

  it('round-trips atoms and rejects non-integers', () => {
    expect(atomsFromWire(atomsToWire(2100000000000000n))).toBe(2100000000000000n);
    expect(() => atomsFromWire('1.5')).toThrow(/integer/);
    expect(() => fiatFromWire({ minor: '1.5', currency: 'USD' })).toThrow(/integer/);
  });
});
