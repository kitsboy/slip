/**
 * Money arithmetic for a till. Integer only, always.
 *
 * Rules this file exists to enforce:
 *  1. **No floats, ever.** Fiat is an integer count of minor units (cents, yen,
 *     fils); crypto is an integer count of atoms (sats, litoshis). A float in a
 *     money path is how a merchant's total drifts by a satoshi and a receipt stops
 *     reconciling.
 *  2. **Fiat → atoms rounds UP.** The merchant must never receive less than the fiat
 *     price at the locked rate. Rounding down would let a 1-sat gap per sale become a
 *     silent discount.
 *  3. **A rate is fiat minor units per whole coin**, an integer, so no division by a
 *     decimal string is needed anywhere.
 *  4. **Every conversion takes an explicit rate.** There is no default, no ambient
 *     price and no "latest" — a missing rate is an error, not a zero.
 */

import { CURRENCIES, type CurrencyInfo } from './currencies';

export const SATS_PER_COIN = 100_000_000n;
const BPS = 10_000n;

export type CurrencyCode = string;

export interface FiatAmount {
  /** Integer count of minor units (e.g. cents). Always ≥ 0 for a sale total. */
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

export interface FiatInputError extends Error {
  readonly reason: string;
}

function fail(reason: string): never {
  const e = new Error(reason) as Error & { reason: string };
  e.reason = reason;
  throw e;
}

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  const info = CURRENCIES[code.toUpperCase()];
  if (!info) fail(`unknown currency: ${code}`);
  return info;
}

export function minorUnitsOf(code: CurrencyCode): number {
  return currencyInfo(code).minorUnits;
}

/** 10^decimals as a BigInt — the scale factor between a major and minor unit. */
export function scaleOf(code: CurrencyCode): bigint {
  return 10n ** BigInt(minorUnitsOf(code));
}

// ---------------------------------------------------------------------------
// Parsing and formatting
// ---------------------------------------------------------------------------

/**
 * Parses a merchant-typed price ("12.34", "1500", "0.005") into minor units.
 * Deliberately strict: no thousands separators, no currency symbols, no exponent,
 * no more fractional digits than the currency actually has. Refusing is safer than
 * guessing what "1,50" meant in a locale where the comma is the decimal point.
 */
export function parseFiat(input: string, currency: CurrencyCode): FiatAmount {
  const code = currency.toUpperCase();
  const decimals = minorUnitsOf(code);
  const text = input.trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    fail(`not a plain positive amount: "${input}" (no symbols, spaces or thousands separators)`);
  }

  const [whole = '0', frac = ''] = text.split('.');
  if (frac.length > decimals) {
    fail(`${code} has ${decimals} decimal place(s); "${input}" has ${frac.length}`);
  }
  const padded = frac.padEnd(decimals, '0');
  return { minor: BigInt(whole + padded), currency: code };
}

export function formatFiat(amount: FiatAmount, locale = 'en'): string {
  const decimals = minorUnitsOf(amount.currency);
  const negative = amount.minor < 0n;
  const abs = negative ? -amount.minor : amount.minor;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, '0');
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true }).format(Number(whole));
  const body = decimals === 0 ? grouped : `${grouped}.${frac}`;
  return `${negative ? '-' : ''}${body} ${amount.currency}`;
}

export function formatSats(sats: bigint): string {
  return `${new Intl.NumberFormat('en').format(sats)} sats`;
}

/**
 * An amount in the coin the shop is actually selling.
 *
 * A satoshi is a Bitcoin word. Litecoin's smallest unit is the litoshi, and no Litecoin merchant or
 * customer says "sats" — a Litecoin till that printed `12,000 sats` would be describing the right
 * number in a currency the person reading it does not have. Litecoin amounts are therefore printed as
 * LTC with up to eight decimals and no trailing zeros, which is exactly what a Litecoin wallet shows.
 *
 * Both chains share the 1e8 unit, so the arithmetic is the same; only the words differ.
 */
export function formatCoinAmount(atoms: bigint, coin: 'btc' | 'ltc' = 'btc'): string {
  if (coin === 'btc') return formatSats(atoms);
  const negative = atoms < 0n;
  const abs = negative ? -atoms : atoms;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return `${negative ? '-' : ''}${body} LTC`;
}

// ---------------------------------------------------------------------------
// Rate conversion
// ---------------------------------------------------------------------------

/**
 * `rateMinorPerCoin` is the price of ONE whole coin in fiat minor units, e.g.
 * 60000.00 USD → 6_000_000. Integer, from the rate snapshot — never a live float.
 */
export function fiatToAtoms(amount: FiatAmount, rateMinorPerCoin: bigint): bigint {
  if (rateMinorPerCoin <= 0n) fail('rate must be a positive integer in fiat minor units');
  if (amount.minor < 0n) fail('cannot convert a negative amount');
  // ceil(a / b) for non-negative integers
  return (amount.minor * SATS_PER_COIN + rateMinorPerCoin - 1n) / rateMinorPerCoin;
}

/** Inverse, rounded DOWN — what a merchant actually receives in fiat terms. */
export function atomsToFiat(atoms: bigint, rateMinorPerCoin: bigint, currency: CurrencyCode): FiatAmount {
  if (rateMinorPerCoin <= 0n) fail('rate must be a positive integer in fiat minor units');
  if (atoms < 0n) fail('cannot convert a negative amount of atoms');
  return { minor: (atoms * rateMinorPerCoin) / SATS_PER_COIN, currency: currency.toUpperCase() };
}

/** Parses a rate string ("60000.00") into fiat minor units per whole coin. */
export function parseRate(input: string, currency: CurrencyCode): bigint {
  return parseFiat(input, currency).minor;
}

// ---------------------------------------------------------------------------
// Rounding and comparison
// ---------------------------------------------------------------------------

/** Half-up integer division that works for negative numerators too. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) fail('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

export function percent(amount: bigint, bps: bigint): bigint {
  if (bps < 0n) fail('percent cannot be negative');
  return divRoundHalfUp(amount * bps, BPS);
}

/** Cash rounding: nearest increment, half up (e.g. 5 minor units = 0.05). */
export function roundToIncrement(minor: bigint, increment: bigint): bigint {
  if (increment <= 0n) fail('increment must be positive');
  const half = increment / 2n;
  return ((minor + half) / increment) * increment;
}

/** Received ≥ expected less a tolerance, in basis points (100 bps = 1%). */
export function isPaidEnough(expected: bigint, received: bigint, toleranceBps = 0n): boolean {
  if (expected < 0n || received < 0n) fail('amounts cannot be negative');
  return received * BPS >= expected * (BPS - toleranceBps);
}

export function shortfall(expected: bigint, received: bigint): bigint {
  return expected > received ? expected - received : 0n;
}

export function changeDue(expected: bigint, received: bigint): bigint {
  return received > expected ? received - expected : 0n;
}

// ---------------------------------------------------------------------------
// Tax and tips
// ---------------------------------------------------------------------------

export interface TaxRule {
  /** Rate in basis points: 875 = 8.75%. */
  readonly rateBps: bigint;
  readonly inclusive: boolean;
}

/**
 * Tax contained in / added to an amount.
 *  - exclusive: the amount is NET, tax is added on top.
 *  - inclusive: the amount is the GROSS total and the tax is already inside it —
 *    so the net is derived and the tax is the remainder. Getting these two the same
 *    way is how a till charges tax twice.
 */
export function taxOnNet(amountMinor: bigint, rule: TaxRule): bigint {
  if (amountMinor < 0n) fail('tax base cannot be negative');
  if (!rule.inclusive) return percent(amountMinor, rule.rateBps);
  const net = divRoundHalfUp(amountMinor * BPS, BPS + rule.rateBps);
  return amountMinor - net;
}

/** Splits a tax-inclusive total into net and tax, exactly (net + tax === total). */
export function splitInclusiveTotal(totalMinor: bigint, rule: TaxRule): { net: bigint; tax: bigint } {
  if (!rule.inclusive) fail('splitInclusiveTotal needs an inclusive rule');
  const net = divRoundHalfUp(totalMinor * BPS, BPS + rule.rateBps);
  return { net, tax: totalMinor - net };
}

export function tipAmount(baseMinor: bigint, tipBps: bigint): bigint {
  return percent(baseMinor, tipBps);
}

export function applyDiscount(
  subtotalMinor: bigint,
  discount: { kind: 'percent'; bps: bigint } | { kind: 'fixed'; minor: bigint },
): bigint {
  if (subtotalMinor < 0n) fail('subtotal cannot be negative');
  const amount = discount.kind === 'percent' ? percent(subtotalMinor, discount.bps) : discount.minor;
  if (amount > subtotalMinor) fail('discount larger than the subtotal');
  return subtotalMinor - amount;
}

// ---------------------------------------------------------------------------
// Wire format — BigInt does not survive JSON.stringify
// ---------------------------------------------------------------------------

/**
 * Persist and transmit amounts as decimal STRINGS. `JSON.stringify({ minor: 10n })`
 * throws a TypeError, and a `number` round-trip silently loses precision above
 * 2^53. Any amount crossing a storage or message boundary goes through these.
 */
export interface FiatAmountWire {
  readonly minor: string;
  readonly currency: CurrencyCode;
}

export function fiatToWire(amount: FiatAmount): FiatAmountWire {
  return { minor: amount.minor.toString(), currency: amount.currency };
}

export function fiatFromWire(wire: FiatAmountWire): FiatAmount {
  if (!/^-?\d+$/.test(wire.minor)) fail(`not an integer minor amount: ${wire.minor}`);
  return { minor: BigInt(wire.minor), currency: wire.currency.toUpperCase() };
}

export function atomsToWire(atoms: bigint): string {
  return atoms.toString();
}

export function atomsFromWire(text: string): bigint {
  if (!/^\d+$/.test(text)) fail(`not an integer atom amount: ${text}`);
  return BigInt(text);
}

// ---------------------------------------------------------------------------
// Order totals
// ---------------------------------------------------------------------------

export interface OrderLineInput {
  /** Unit price in fiat minor units — or atoms when `priceCurrency` is 'SATS'. */
  readonly unitMinor: bigint;
  readonly priceCurrency: 'FIAT' | 'SATS';
  readonly quantity: bigint;
  readonly modifiersMinor?: bigint;
}

export interface TotalRequest {
  readonly lines: readonly OrderLineInput[];
  readonly currency: CurrencyCode;
  /** Needed only when a line is priced in sats. */
  readonly rateMinorPerCoin?: bigint;
  readonly tax?: TaxRule;
  readonly discount?: { kind: 'percent'; bps: bigint } | { kind: 'fixed'; minor: bigint };
  readonly tipBps?: bigint;
  readonly tipOnPreTax?: boolean;
  readonly cashIncrementMinor?: bigint;
}

export interface OrderTotals {
  readonly subtotalMinor: bigint;
  readonly discountMinor: bigint;
  readonly taxMinor: bigint;
  readonly tipMinor: bigint;
  readonly totalMinor: bigint;
  readonly roundedTotalMinor: bigint;
  readonly roundingMinor: bigint;
}

export function computeTotals(req: TotalRequest): OrderTotals {
  if (req.lines.length === 0) fail('an order needs at least one line');

  let subtotal = 0n;
  for (const line of req.lines) {
    if (line.quantity <= 0n) fail('line quantity must be positive');
    const unit =
      line.priceCurrency === 'SATS'
        ? (() => {
            if (req.rateMinorPerCoin === undefined) fail('sats-priced line needs a rate');
            // sats → fiat rounds DOWN: the merchant quotes sats, so the fiat figure
            // shown is the honest lower bound of what those sats are worth.
            return (line.unitMinor * req.rateMinorPerCoin!) / SATS_PER_COIN;
          })()
        : line.unitMinor;
    subtotal += (unit + (line.modifiersMinor ?? 0n)) * line.quantity;
  }

  const afterDiscount = req.discount ? applyDiscount(subtotal, req.discount) : subtotal;
  const discountMinor = subtotal - afterDiscount;

  const tax = req.tax ? taxOnNet(afterDiscount, req.tax) : 0n;

  // A tax-INCLUSIVE total already contains the tax; an exclusive one adds it.
  const totalBeforeTip = req.tax?.inclusive ? afterDiscount : afterDiscount + tax;

  const tipBase = req.tipOnPreTax ? afterDiscount : totalBeforeTip;
  const tip = req.tipBps ? tipAmount(tipBase, req.tipBps) : 0n;

  const total = totalBeforeTip + tip;
  const rounded = req.cashIncrementMinor ? roundToIncrement(total, req.cashIncrementMinor) : total;

  return {
    subtotalMinor: subtotal,
    discountMinor,
    taxMinor: tax,
    tipMinor: tip,
    totalMinor: total,
    roundedTotalMinor: rounded,
    roundingMinor: rounded - total,
  };
}
