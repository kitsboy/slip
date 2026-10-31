/**
 * Lightning LNURL-pay provider — buyer-paid invoices with no node credentials.
 *
 * What this is for: a merchant who wants to accept Lightning but will not hand a wallet a
 * node URL, a macaroon, or a TLS cert. A Lightning address (`user@domain.tld`) resolves over
 * plain HTTPS to a `payRequest` (LUD-06, published at `/.well-known/lnurlp/<user>` per
 * LUD-16); we ask that service for an invoice, show the BOLT-11 string, and — where the
 * service offers one — poll its `verify` URL (LUD-21) until it says the invoice settled.
 * The merchant's own wallet still receives the sats; slip only ever holds a string.
 *
 * What it costs: the address operator sees our IP and the amounts we quote. That is the same
 * trade the UI states for chain lookups, and it is why nothing here is cached or logged.
 *
 * Deliberate limits:
 *  - GET only, exactly the three documented calls, nothing else on the wire;
 *  - a hard timeout, because a silent Lightning service must not freeze a till mid-sale;
 *  - every amount is a bigint of millisatoshis. JSON numbers arrive as doubles, so they are
 *    converted through their decimal string — `Number.isInteger` on a JSON float is how an
 *    invoice for 0.001 sats silently becomes a free coffee;
 *  - `settled:true` requires an explicit `status:'OK'` and `settled:true` from the service.
 *    Anything ambiguous is "not settled", because the alternative is handing over goods.
 */

export interface LnurlPayParams {
  callback: string;
  minSendableMsat: bigint;
  maxSendableMsat: bigint;
  metadataHashes: string;
  tag: string;
  commentAllowed: number;
}

export type LnurlErrorKind = 'invalid' | 'network' | 'unsupported' | 'out-of-range';

export class LnurlError extends Error {
  readonly kind: LnurlErrorKind;

  constructor(kind: LnurlErrorKind, message: string) {
    super(message);
    this.name = 'LnurlError';
    this.kind = kind;
  }
}

/**
 * Local, structurally identical to the esplora provider's fetch seam on purpose: importing
 * that type would couple this module to a file it does not otherwise need, and a drift
 * between the two would only show up at a call site far from the cause.
 */
export interface FetchLike {
  (
    url: string,
    init?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/** Characters a LUD-16 user part may use. Anything else is a typo or an injection attempt. */
const USER_PART = /^[a-zA-Z0-9._%+-]+$/;
/** Hostnames only: labels of letters/digits/hyphens, at least one dot, no port, no path. */
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Reads `user@domain.tld`. Rejects schemes, paths, whitespace, and anything with a second
 * `@` rather than "cleaning" it: a pasted `https://user@domain` would otherwise become a
 * request to a host the merchant never named, and a silently repaired address is a payment
 * sent to a stranger.
 */
export function parseLightningAddress(text: string): { user: string; domain: string } | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 320) return null;
  if (/[\s/\\?#]/.test(text)) return null;
  const parts = text.split('@');
  if (parts.length !== 2) return null;
  const [user = '', domainRaw = ''] = parts;
  if (!USER_PART.test(user) || user.startsWith('.') || user.endsWith('.')) return null;
  const domain = domainRaw.toLowerCase();
  if (!HOSTNAME.test(domain)) return null;
  return { user, domain };
}

function invalid(message: string): LnurlError {
  return new LnurlError('invalid', message);
}

/**
 * Milliseconds from a JSON value. `String(1.5)` survives the round trip as `'1.5'`, which
 * fails the digit test — so a service that quotes a fractional msat is refused instead of
 * being truncated into an amount nobody agreed to.
 */
function toMsat(value: unknown, field: string): bigint {
  if (value === undefined || value === null || typeof value === 'boolean') {
    throw invalid(`the lightning service did not send ${field}`);
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw invalid(`the lightning service sent ${field} as something that is not a number`);
  }
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw invalid(`the lightning service sent ${field} as ${text}, which is not a whole number`);
  }
  return BigInt(text);
}

/** Every request carries the abort signal AND a self-racing rejection: a fetch that ignores
 *  the signal (older polyfills, some test doubles) would otherwise hang the till forever. */
async function getJson(
  url: string,
  doFetch: FetchLike,
  timeoutMs: number,
  what: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LnurlError('network', 'the lightning service did not answer in time'));
    }, timeoutMs);
  });

  const call = doFetch(url, {
    signal: controller.signal,
    headers: { accept: 'application/json' },
  });
  // The losing promise of the race must not surface as an unhandled rejection later.
  void call.catch(() => undefined);

  try {
    const res = await Promise.race([call, timedOut]);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw new LnurlError(
        'network',
        `the lightning service answered ${res.status} when asked for ${what}`,
      );
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    if (e instanceof LnurlError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new LnurlError('network', 'the lightning service did not answer in time');
    }
    throw new LnurlError(
      'network',
      e instanceof Error && e.message
        ? `could not reach the lightning service: ${e.message}`
        : 'could not reach the lightning service',
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function asRecord(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid(`the lightning service sent something that is not JSON when asked for ${what}`);
  }
  return body as Record<string, unknown>;
}

function reasonOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.reason === 'string' && body.reason.trim() ? body.reason : fallback;
}

/**
 * Resolves a Lightning address to its payRequest. The tag and https checks are load-bearing:
 * a `withdrawRequest` served in its place would sign the merchant's funds away, and a plain
 * http callback would let the network rewrite the invoice we are about to show.
 */
export async function fetchPayParams(
  address: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<LnurlPayParams> {
  const parsed = parseLightningAddress(address);
  if (!parsed) throw invalid('that does not look like a lightning address (user@domain.tld)');

  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const url = `https://${parsed.domain}/.well-known/lnurlp/${encodeURIComponent(parsed.user)}`;
  const { body } = await getJson(
    url,
    doFetch,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    'that address',
  );
  const data = asRecord(body, 'that address');

  if (data.status === 'ERROR') {
    throw invalid(reasonOf(data, 'that address does not accept lightning payments'));
  }

  const tag = data.tag;
  if (tag !== 'payRequest') {
    throw new LnurlError(
      'unsupported',
      'that address did not answer with a payRequest — it may be a withdraw link',
    );
  }

  const callback = data.callback;
  if (typeof callback !== 'string' || !/^https:\/\//i.test(callback)) {
    throw invalid('the lightning service offered a callback that is not https');
  }

  const minSendableMsat = toMsat(data.minSendable, 'minSendable');
  const maxSendableMsat = toMsat(data.maxSendable, 'maxSendable');
  if (minSendableMsat > maxSendableMsat) {
    throw invalid('the lightning service quoted an empty invoice range');
  }

  const metadataHashes = typeof data.metadata === 'string' ? data.metadata : '';
  if (!metadataHashes) throw invalid('the lightning service sent no metadata to pay against');

  const rawComment = toMsat(data.commentAllowed ?? 0, 'commentAllowed');
  const commentAllowed = rawComment > 1_000n ? 1_000 : Number(rawComment);

  return {
    callback,
    minSendableMsat,
    maxSendableMsat,
    metadataHashes,
    tag: 'payRequest',
    commentAllowed,
  };
}

export interface LnurlInvoice {
  pr: string;
  verifyUrl: string | null;
  successAction: unknown;
}

/** Sats to msat, never through a float: 21 sats is 21000n, not 20999.999999999996. */
const MSAT_PER_SAT = 1_000n;

function withQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${value}`;
}

/**
 * Asks the callback for a BOLT-11 invoice. The range check happens here rather than at the
 * UI so that a stale form cannot quote outside the service's limits and eat an error page
 * in front of a customer; the message names the range because the cashier has to retype it.
 */
export async function requestInvoice(
  params: LnurlPayParams,
  amountSats: bigint,
  opts: { comment?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<LnurlInvoice> {
  if (typeof amountSats !== 'bigint') {
    throw invalid('lightning amounts must be whole sats');
  }
  if (amountSats <= 0n) throw invalid('an invoice must be for more than zero sats');

  const amountMsat = amountSats * MSAT_PER_SAT;
  if (amountMsat < params.minSendableMsat || amountMsat > params.maxSendableMsat) {
    const min = params.minSendableMsat / MSAT_PER_SAT;
    const max = params.maxSendableMsat / MSAT_PER_SAT;
    throw new LnurlError(
      'out-of-range',
      `this address accepts ${min}–${max} sats; ${amountSats} sats is outside that range`,
    );
  }

  let url = withQuery(params.callback, 'amount', amountMsat.toString());
  const comment = opts.comment?.trim() ?? '';
  if (comment) {
    // A comment that would be truncated by the service is refused, not cut: half a delivery
    // note on an invoice is worse than asking the customer to shorten it.
    if (params.commentAllowed <= 0) {
      throw new LnurlError('unsupported', 'this address does not accept a payment comment');
    }
    if (comment.length > params.commentAllowed) {
      throw invalid(`this address allows at most ${params.commentAllowed} comment characters`);
    }
    url = withQuery(url, 'comment', encodeURIComponent(comment));
  }

  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const { body } = await getJson(url, doFetch, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'an invoice');
  const data = asRecord(body, 'an invoice');

  if (data.status === 'ERROR') {
    throw invalid(reasonOf(data, 'the lightning service refused to make an invoice'));
  }

  const pr = data.pr;
  if (typeof pr !== 'string' || pr.length === 0) {
    throw invalid('the lightning service did not return an invoice');
  }

  const verify = data.verify;
  if (verify !== undefined && verify !== null) {
    if (typeof verify !== 'string' || !/^https:\/\//i.test(verify)) {
      throw invalid('the lightning service offered a verify link that is not https');
    }
  }

  return {
    pr,
    verifyUrl: typeof verify === 'string' ? verify : null,
    successAction: data.successAction ?? null,
  };
}

export interface LnurlVerifyResult {
  settled: boolean;
  preimage: string | null;
  raw: unknown;
}

/**
 * Polls the LUD-21 verify URL. Only an explicit `status:'OK'` with `settled:true` counts as
 * paid — an error body, a malformed body, or a 404 all mean "not settled", never an
 * exception. A till that treats "could not tell" as "paid" gives away stock for free.
 */
export async function verifyPayment(
  verifyUrl: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<LnurlVerifyResult> {
  if (typeof verifyUrl !== 'string' || !/^https:\/\//i.test(verifyUrl)) {
    throw invalid('verify links must be https');
  }

  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LnurlError('network', 'the lightning service did not answer in time'));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  const call = doFetch(verifyUrl, {
    signal: controller.signal,
    headers: { accept: 'application/json' },
  });
  void call.catch(() => undefined);

  try {
    const res = await Promise.race([call, timedOut]);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return { settled: false, preimage: null, raw: null };
    }
    if (!res.ok) return { settled: false, preimage: null, raw: body };
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { settled: false, preimage: null, raw: body };
    }
    const data = body as Record<string, unknown>;
    const preimage = typeof data.preimage === 'string' && data.preimage ? data.preimage : null;
    const settled = data.status === 'OK' && data.settled === true;
    return { settled, preimage, raw: body };
  } catch (e) {
    if (e instanceof LnurlError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new LnurlError('network', 'the lightning service did not answer in time');
    }
    throw new LnurlError(
      'network',
      e instanceof Error && e.message
        ? `could not reach the lightning service: ${e.message}`
        : 'could not reach the lightning service',
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const BOLT11_PREFIXES = ['lnbcrt', 'lnbc', 'lntb', 'lnurl'] as const;

/**
 * Builds the URI a QR reader or wallet app sees. QR alphanumeric mode cannot carry lowercase,
 * and BOLT-11 is case-insensitive by spec, so upper-casing keeps the symbol small enough to
 * scan from a phone at arm's length. A value that is not one of these prefixes is rejected
 * instead of being encoded — a QR that opens nothing at the counter is worse than no QR.
 */
export function lightningUri(pr: string): string {
  if (typeof pr !== 'string') throw invalid('an invoice must be a string');
  const trimmed = pr.trim();
  const lower = trimmed.toLowerCase();
  if (!BOLT11_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    throw invalid('that is not a lightning invoice or LNURL');
  }
  return `lightning:${trimmed.toUpperCase()}`;
}
