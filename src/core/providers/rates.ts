/**
 * Fiat rate provider — so the merchant does not have to type the price by hand.
 *
 * The failure this file exists to prevent: a cached number with no age on it. A till that
 * quietly prices today's sale at yesterday's rate overcharges or undercharges a real customer,
 * and neither side finds out until the books are counted. So every quote here carries the
 * moment it was fetched, its age, and a `stale` flag; `requireFresh()` is the only sanctioned
 * way to move from "a number" to "a price", and it refuses rather than guesses.
 *
 * Deliberate limits:
 *  - read-only GETs against an endpoint the merchant chose, nothing else;
 *  - a hard timeout, so a dead provider cannot hang a sale;
 *  - all money is BigInt minor units — floats never touch an amount that gets charged;
 *  - a stale quote is an error, not a warning, because a warning gets clicked through.
 */

/** How long a rate is allowed to be used for pricing. Ten minutes is a compromise: long
 *  enough that a shop with flaky wifi still works, short enough that a 10% intraday move is
 *  not silently absorbed into a price. */
export const MAX_AGE_SECONDS = 600;

/** Default timeout for a rate request. A till cannot wait longer than this with a customer
 *  standing at the counter — after that, typing the price by hand is the better outcome. */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Public endpoints that speak mempool.space's `/api/v1/prices` shape.
 *
 * The contract mirrors `PUBLIC_ESPLORA` in esplora.ts: a known-good third party by default,
 * replaceable from settings. See PRIVACY.md — this is the one call that tells a third party
 * roughly where the shop is and that it is open.
 */
export const DEFAULT_RATE_ENDPOINTS: Readonly<Record<'btc' | 'ltc', string>> = {
  btc: 'https://mempool.space/api/v1/prices',
  ltc: 'https://litecoinspace.org/api/v1/prices',
};

export type RateErrorKind = 'currency-not-offered' | 'bad-shape' | 'network' | 'timeout' | 'stale';

/** Every failure a rate fetch can produce, tagged so the UI can choose words and an action
 *  ("type the price" vs "check the connection") instead of showing a stack trace. */
export class RateError extends Error {
  readonly kind: RateErrorKind;

  constructor(kind: RateErrorKind, message: string) {
    super(message);
    this.name = 'RateError';
    this.kind = kind;
  }
}

export interface RateQuote {
  /** Price of one whole coin in the currency's minor unit (cents, yen, fils...). */
  readonly minorPerCoin: bigint;
  /** ISO 4217 code, uppercased. */
  readonly currency: string;
  /** Where the number came from: an endpoint host, or a '+' joined list for a median. */
  readonly source: string;
  /** ISO timestamp of the fetch this quote is based on. */
  readonly fetchedAt: string;
  /** Whole seconds since `fetchedAt`; negative when the local clock is behind the fetch. */
  readonly ageSeconds: number;
  /** True when the quote must not be used for pricing. Authoritative — see ageQuote(). */
  readonly stale: boolean;
}

/**
 * The shape this module needs from `fetch`. Declared locally (not imported from esplora.ts) so
 * this provider can be tested, moved, or swapped without dragging chain-code with it.
 */
export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

/**
 * Currencies with no minor unit. Mirrors ISO 4217's exponent column.
 *
 * The project already has a generated table at src/core/currencies.ts, and this list is
 * deliberately NOT imported from it: a rate provider that cannot be built without the currency
 * table is a coupling that turns a one-line endpoint fix into a rebuild. The duplication is
 * covered by tests/rates.test.ts, which checks this set against that table.
 *
 * Two corrections to the obvious shorthand list are intentional: HUF and COP are 2-decimal in
 * ISO 4217 (not 0), and BIF, UYI and VUV are 0-decimal. Treating HUF as 0-decimal would quote a
 * Hungarian price 100x too high — the exact class of bug this file is meant to prevent.
 */
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

/** Currencies with three minor digits. Same reasoning as above, opposite direction: pricing a
 *  Kuwaiti dinar as if it had cents undercharges by 10x. */
const THREE_DECIMAL: ReadonlySet<string> = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
]);

/** The two four-digit units ISO 4217 defines (Chilean UF, Uruguayan UYW). Rare, but a merchant
 *  invoicing in CLF would be off by 100x if they were assumed to have cents. */
const FOUR_DECIMAL: ReadonlySet<string> = new Set(['CLF', 'UYW']);

/** Minor units per major unit's digit count for a currency. */
function minorUnitsFor(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (FOUR_DECIMAL.has(currency)) return 4;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

/**
 * The plain decimal digits of a JS number, with no exponent notation.
 *
 * `toString()` is the shortest string that round-trips to the same double, i.e. the decimal the
 * provider meant to send ("1.005"), not the double's real value ("1.00499999999999989").
 * Rounding that string is the only way to get half-up in the decimal the merchant sees.
 */
function plainDecimal(value: number): string {
  const text = value.toString();
  const exponentForm = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!exponentForm) return text;

  const whole = exponentForm[1] ?? '0';
  const frac = exponentForm[2] ?? '';
  const digits = whole + frac;
  const point = whole.length + Number(exponentForm[3]);

  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Converts a major-unit price to minor units by rounding the decimal string half-up.
 *
 * Doing this with `value * 100` and `Math.round` is the tempting version and it quietly loses a
 * cent on inputs like 1.005 (which is 100.49999999999999 in binary). A cent is not a rounding
 * detail in a point-of-sale terminal, so the digits are cut as text instead.
 */
function toMinorUnits(value: number, decimals: number): bigint {
  const [whole = '0', frac = ''] = plainDecimal(value).split('.');
  const digits = frac.padEnd(decimals + 1, '0');
  const kept = digits.slice(0, decimals);
  const base = BigInt(whole + kept);
  // '5'..'9' sort above '4' in ASCII, so this is half-up without a float comparison.
  return (digits.charAt(decimals) || '0') >= '5' ? base + 1n : base;
}

/** `/api/v1/prices` answers `{ time, USD, CAD, ... }`. Anything else is a different endpoint
 *  behind the same URL, and guessing at it would put a wrong number in a price field. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function badShape(message: string): RateError {
  return new RateError('bad-shape', message);
}

/**
 * Turns a raw `/api/v1/prices` body into a quote stamped `now`.
 *
 * The conversion is the risky part: this number is multiplied by a coin amount and becomes
 * money. The scaled value must first be proven inside the safe integer range (otherwise its low
 * digits are already invented), then the rounding is done on the decimal text, half-up.
 */
export function parsePriceResponse(json: unknown, currency: string, now: Date, sourceHint?: string): RateQuote {
  if (!isRecord(json)) {
    throw badShape(
      'that rate endpoint did not send a price table — is the URL a mempool.space API?',
    );
  }

  const code = currency.trim().toUpperCase();
  if (code === '') throw badShape('no currency was chosen, so there is no rate to read');

  const raw = json[code];
  if (raw === undefined) {
    throw new RateError(
      'currency-not-offered',
      `that rate endpoint does not quote ${code} — choose another currency or type the price by hand`,
    );
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw badShape(
      `the ${code} rate from that endpoint is not a usable number — try another provider`,
    );
  }

  const decimals = minorUnitsFor(code);
  const scale = 10 ** decimals;
  const scaled = raw * scale;

  // Guard about precision rather than taste: a value beyond 2^53/scale cannot be represented
  // exactly, so its "cents" would be invented digits. Refusing is the only honest answer — a
  // 9-figure rate in a hyperinflated currency is not a price anyone should charge.
  if (!Number.isFinite(scaled) || scaled >= Number.MAX_SAFE_INTEGER) {
    throw badShape(`the ${code} rate from that endpoint is too large to price safely`);
  }

  const minorPerCoin = toMinorUnits(raw, decimals);
  // A rate that rounds to zero would price every sale at nothing. Refusing beats free coffee.
  if (minorPerCoin <= 0n) {
    throw badShape(`the ${code} rate from that endpoint is too small to price anything`);
  }

  return {
    minorPerCoin,
    currency: code,
    // parsePriceResponse cannot know the host, so it leaves the source blank and fetchRate fills
    // it in. Naming 'mempool.space' here would tell a merchant their own node was a stranger.
    // Default hint preserves the documented public default; fetchRate always passes the real host.
    source: sourceHint ?? 'mempool.space',
    fetchedAt: now.toISOString(),
    ageSeconds: 0,
    stale: false,
  };
}

/**
 * Endpoint policy: https only, except plain http to a loopback host, because a merchant running
 * their own price feed on the till machine (or over an SSH tunnel) has no certificate to present
 * and no network to protect. Any other http URL would let a coffee-shop hotspot rewrite the
 * price of every sale, so it is refused before a request is made.
 */
function assertEndpointAllowed(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw badShape('that rate endpoint is not a valid URL');
  }

  if (url.protocol === 'https:') return;

  if (url.protocol === 'http:') {
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (loopback) return;
    throw badShape('a rate endpoint must use https — plain http is only allowed for localhost');
  }

  throw badShape('a rate endpoint must be an https URL');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Races the request against the abort signal. `fetch` receives the signal as well (when the
 * implementation honours it the socket is actually torn down), but the race is what guarantees
 * the caller gets an answer: a fetch implementation that ignores signals still cannot hang the
 * till, because the abort wins here.
 */
function raceWithAbort<T>(work: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  const timeoutError = new RateError(
    'timeout',
    `the rate provider did not answer within ${Math.round(timeoutMs / 1000)}s — ` +
      'type the price by hand or check your connection',
  );

  if (signal.aborted) return Promise.reject(timeoutError);

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(timeoutError);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** The internal view of fetch: the exported `FetchLike` stays single-argument so fakes in tests
 *  are trivial, while real implementations still get the abort signal. */
type FetchWithInit = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Fetches one rate quote. Resolves with a fresh-looking quote; the caller still has to pass it
 * through `ageQuote()` on read and `requireFresh()` before pricing, because the freshness of a
 * number is a property of when it is used, not of when it arrived.
 */
export async function fetchRate(opts: {
  coin: 'btc' | 'ltc';
  currency: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  now?: Date;
  timeoutMs?: number;
}): Promise<RateQuote> {
  const endpoint = (opts.endpoint ?? '').trim() || DEFAULT_RATE_ENDPOINTS[opts.coin];
  assertEndpointAllowed(endpoint);

  const doFetch = (opts.fetchImpl ?? (fetch as unknown as FetchWithInit)) as FetchWithInit;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? new Date();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await raceWithAbort(
      doFetch(endpoint, { signal: controller.signal, headers: { accept: 'application/json' } }),
      controller.signal,
      timeoutMs,
    );

    if (!res.ok) {
      throw new RateError(
        'network',
        res.status === 429
          ? 'the rate provider is rate-limiting us — wait a moment and try again'
          : `the rate provider answered ${res.status} — try again or type the price by hand`,
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw badShape(
        'the rate provider sent something that is not JSON — is that URL a price API?',
      );
    }

    let host = 'unknown';
    try {
      host = new URL(endpoint).host;
    } catch {
      host = 'unknown';
    }
    return parsePriceResponse(body, opts.currency, now, host);
  } catch (error) {
    if (error instanceof RateError) throw error;
    if (isAbortError(error)) {
      throw new RateError(
        'timeout',
        `the rate provider did not answer within ${Math.round(timeoutMs / 1000)}s — ` +
          'type the price by hand or check your connection',
      );
    }
    throw new RateError(
      'network',
      'could not reach the rate provider — check your connection or type the price by hand',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-judges a quote against a fresh clock. This is the point of persisting `fetchedAt` rather
 * than a boolean: a quote cached in localStorage overnight comes back `stale`, instead of
 * coming back as a number that looks exactly like a fresh one.
 *
 * Staleness is decided on milliseconds (so the boundary is exact); `ageSeconds` is rounded for
 * display. A clock that has gone backwards makes the age negative, which is treated as stale —
 * we cannot tell how old that number really is, so it cannot price anything.
 */
export function ageQuote(quote: RateQuote, now: Date): RateQuote {
  const fetchedMs = Date.parse(quote.fetchedAt);
  if (!Number.isFinite(fetchedMs)) {
    // An unparseable timestamp is not "age zero" — it is an unknown age, which is stale.
    return { ...quote, ageSeconds: Number.POSITIVE_INFINITY, stale: true };
  }

  const diffMs = now.getTime() - fetchedMs;
  const stale = diffMs > MAX_AGE_SECONDS * 1000 || diffMs < 0;

  return { ...quote, ageSeconds: Math.round(diffMs / 1000), stale };
}

/**
 * The gate. Call this immediately before a quote is used to price anything; it throws rather
 * than returning a flag so there is no code path where a stale rate reaches a total.
 */
export function requireFresh(quote: RateQuote): RateQuote {
  if (!quote.stale) return quote;
  const age = Number.isFinite(quote.ageSeconds)
    ? `${Math.max(quote.ageSeconds, 0)}s old`
    : 'of unknown age';
  throw new RateError(
    'stale',
    `that ${quote.currency} rate is ${age} — refresh it before pricing this sale`,
  );
}

/**
 * Median of one or more quotes of the same currency: one bad provider cannot move the price.
 *
 * Consequences worth stating: an even count takes the lower-middle value (deterministic, and
 * biased toward the cheaper coin price, i.e. toward charging the customer less rather than
 * more); the result keeps the newest `fetchedAt`, because age belongs to a timestamp; and a
 * stale input makes the result stale — a median of stale prices is still a stale price, even
 * if its timestamp looks recent. `ageQuote()` on the result re-judges against the clock.
 *
 * This does not fetch, and does not check freshness on its own. Fetch each source, then
 * `requireFresh()` the medians the till actually uses.
 */
export function medianRate(quotes: readonly RateQuote[]): RateQuote {
  if (quotes.length === 0) {
    throw badShape('a median needs at least one rate quote');
  }

  const first = quotes[0] as RateQuote;
  for (const quote of quotes) {
    if (quote.currency !== first.currency) {
      throw badShape(`cannot take a median of ${first.currency} and ${quote.currency} rates`);
    }
  }

  // BigInt comparison by hand: Array#sort needs a number, and Number(bigint) is exactly the
  // precision loss this module refuses everywhere else.
  const sorted = [...quotes].sort((a, b) =>
    a.minorPerCoin < b.minorPerCoin ? -1 : a.minorPerCoin > b.minorPerCoin ? 1 : 0,
  );
  const middle = sorted[Math.floor((sorted.length - 1) / 2)] as RateQuote;

  let newest = first;
  let newestMs = Date.parse(first.fetchedAt);
  for (const quote of quotes) {
    const ms = Date.parse(quote.fetchedAt);
    if (Number.isFinite(ms) && (!Number.isFinite(newestMs) || ms > newestMs)) {
      newest = quote;
      newestMs = ms;
    }
  }

  const sources = [...new Set(quotes.map((quote) => quote.source))];

  return {
    minorPerCoin: middle.minorPerCoin,
    currency: first.currency,
    source: sources.join('+'),
    fetchedAt: newest.fetchedAt,
    ageSeconds: newest.ageSeconds,
    stale: newest.stale || quotes.some((quote) => quote.stale),
  };
}
