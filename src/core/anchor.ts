/**
 * Daily anchor — a merchant's proof that the day's books existed, at a moment.
 *
 * The problem this solves: a serverless till keeps its invoices on the device. A
 * merchant who wants to show a lender, an auditor or a tax office "this is what I
 * took on the 14th, and I could not have rewritten it afterwards" has no server to
 * point at. So the day's completed invoices are reduced to one SHA-256 digest,
 * locally, and — only when the merchant explicitly asks — that digest is handed to
 * a public OpenTimestamps calendar. The calendar returns a *pending* timestamp: a
 * promise that the digest will be committed into a Bitcoin block within its own
 * timeframe. It is not a confirmation, and this file never says it is.
 *
 * The order of operations matters and is deliberate:
 *   1. hash locally (works with the network off, always);
 *   2. submit only on an explicit press, and only if the merchant wants it;
 *   3. store whatever came back, base64, on the device.
 * Nothing about the local digest depends on the calendar, so the books stay
 * verifiable offline for as long as the invoices exist.
 *
 * Failure is a normal outcome here. This is a button pressed at closing time, on a
 * phone, possibly on bad shop wifi. `submitAnchor` therefore never throws: it
 * returns an Anchor with `status: 'failed'` and a sentence a shopkeeper can read.
 * A thrown exception in that moment is a crash in front of a customer.
 *
 * CALENDARS below are third-party services run by other people. They see the digest
 * and the merchant's IP. They can be down, rate-limited, or gone next year. The
 * digest is opaque (a hash of that day's invoices), but the request itself is
 * visible to them, and that is a fact the UI must state rather than hide.
 */

export interface FetchLike {
  (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array },
  ): Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
}

/** One day's books, reduced to a fixed-size commitment. */
export interface DayBook {
  /** Local calendar day, YYYY-MM-DD. Not a timestamp — no timezone is implied. */
  readonly date: string;
  readonly count: number;
  readonly totalAtoms: bigint;
  /** Lower-case hex SHA-256 of the canonical invoice lines. */
  readonly digestHex: string;
}

export interface Anchor {
  readonly date: string;
  readonly digestHex: string;
  readonly status: 'local-only' | 'submitted' | 'failed';
  readonly submittedAt: string | null;
  readonly calendar: string | null;
  /** Base64 of the serialized pending timestamp returned by the calendar. */
  readonly proofBase64: string | null;
  readonly error: string | null;
}

/**
 * Public OpenTimestamps calendars. Third-party infrastructure we do not run and
 * cannot promise: they may be slow, refuse, or disappear. Kept as plain strings so
 * a merchant can point at their own calendar without a rebuild.
 */
export const CALENDARS: readonly string[] = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://ots.btc.catallaxy.com',
];

const DEFAULT_TIMEOUT_MS = 8000;

const textEncoder = new TextEncoder();

/** The invoice shape this module reads. Only these five fields feed the digest. */
export interface AnchorInvoice {
  readonly id: string;
  readonly createdAt: string;
  readonly amountAtoms: bigint;
  readonly status: string;
  readonly walletId: string;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * WebCrypto is the only hash here. It exists in every browser slip targets and in
 * Node 22, but a stripped-down or non-secure-context page can lack it. If it is
 * missing we say so out loud rather than silently producing a digest that cannot be
 * recomputed later — a digest nobody can verify is worse than no digest at all.
 */
function subtleCrypto(): SubtleCrypto {
  const c: Crypto | undefined = globalThis.crypto;
  if (!c || !c.subtle || typeof c.subtle.digest !== 'function') {
    throw new Error(
      'SHA-256 is unavailable: this page has no WebCrypto (crypto.subtle). ' +
        'Open slip over HTTPS in a current browser, or in Node 22 and later.',
    );
  }
  return c.subtle;
}

/** UTF-8 byte order, which is what "sort by id" has to mean to be reproducible. */
function compareBytes(a: string, b: string): number {
  const ab = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  const shared = Math.min(ab.length, bb.length);
  for (let i = 0; i < shared; i += 1) {
    const x = ab[i]!;
    const y = bb[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return ab.length - bb.length;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Digest is not valid hex: odd number of characters.');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    const byte = Number.parseInt(pair, 16);
    if (Number.isNaN(byte) || pair.length !== 2) {
      throw new Error(`Digest is not valid hex near character ${i * 2}.`);
    }
    out[i] = byte;
  }
  return out;
}

/**
 * Base64 by hand, from bytes. `btoa` is not present in older Node and `Buffer` is
 * not present in the browser; one small implementation means the proof bytes are
 * encoded identically everywhere, which is the only thing that matters for a value
 * that will be checked by someone else's tooling years from now.
 */
function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += alphabet[(triple >> 18) & 63]!;
    out += alphabet[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? alphabet[triple & 63]! : '=';
  }
  return out;
}

// ---------------------------------------------------------------------------
// The day digest
// ---------------------------------------------------------------------------

/**
 * Reduce one day's completed invoices to a single digest.
 *
 * Determinism is the whole value of this function: the same day must produce the
 * same bytes on the merchant's phone, on a laptop, and on an auditor's machine
 * next year. So the encoding is fixed and boring — one line per invoice, fields
 * joined with '|', terminated with '\n', sorted by id in byte order. No JSON (key
 * order drifts), no locale-aware sort (varies by machine), no floats (rounding).
 * Amounts are BigInt decimal strings, which are exact.
 *
 * Only 'complete' invoices are included: an invoice still awaiting payment is a
 * promise, and hashing a promise into "the day's takings" would overstate them.
 *
 * A day with no sales is not an error. It hashes the empty string, which is a
 * perfectly good commitment to "nothing happened".
 */
export async function dayDigest(
  invoices: ReadonlyArray<AnchorInvoice>,
  date: string,
): Promise<DayBook> {
  const included = invoices.filter(
    (invoice) => invoice.createdAt.startsWith(date) && invoice.status === 'complete',
  );

  // Sorting a copy: the caller's array is not ours to reorder.
  const ordered = [...included].sort((a, b) => {
    const byId = compareBytes(a.id, b.id);
    if (byId !== 0) return byId;
    // Ids should be unique, but a duplicate must not make the digest depend on the
    // input array's incidental order. Tie-break on the remaining committed fields.
    const byCreated = compareBytes(a.createdAt, b.createdAt);
    if (byCreated !== 0) return byCreated;
    const byWallet = compareBytes(a.walletId, b.walletId);
    if (byWallet !== 0) return byWallet;
    if (a.amountAtoms === b.amountAtoms) return 0;
    return a.amountAtoms < b.amountAtoms ? -1 : 1;
  });

  let totalAtoms = 0n;
  let canonical = '';
  for (const invoice of ordered) {
    canonical += `${invoice.id}|${invoice.walletId}|${invoice.amountAtoms.toString()}|${invoice.createdAt}\n`;
    totalAtoms += invoice.amountAtoms;
  }

  const bytes = textEncoder.encode(canonical);
  const hash = await subtleCrypto().digest('SHA-256', bytes);

  return {
    date,
    count: ordered.length,
    totalAtoms,
    digestHex: toHex(new Uint8Array(hash)),
  };
}

// ---------------------------------------------------------------------------
// Submission to a public calendar
// ---------------------------------------------------------------------------

/**
 * Hand the digest to one calendar and keep whatever it returns.
 *
 * One attempt, no retry loop. A retry storm from a shop phone against a public
 * service is rude and teaches the merchant nothing; if the calendar is down they
 * press again in the morning. Every failure path — DNS, refusal, timeout, empty
 * body — produces a `failed` Anchor and a sentence, never an exception.
 */
export async function submitAnchor(
  book: DayBook,
  opts: {
    calendar?: string;
    fetchImpl?: FetchLike;
    now?: Date;
    timeoutMs?: number;
  } = {},
): Promise<Anchor> {
  const calendar = opts.calendar ?? CALENDARS[0]!;
  const now = opts.now ?? new Date();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const failed = (error: string): Anchor => ({
    date: book.date,
    digestHex: book.digestHex,
    status: 'failed',
    submittedAt: null,
    calendar,
    proofBase64: null,
    error,
  });

  let body: Uint8Array;
  try {
    body = fromHex(book.digestHex);
  } catch (err) {
    return failed(err instanceof Error ? err.message : 'The digest is not readable.');
  }
  if (body.length !== 32) {
    return failed('The digest must be 32 bytes (SHA-256) before it can be timestamped.');
  }

  const fallbackFetch = globalThis.fetch as unknown as FetchLike | undefined;
  const doFetch: FetchLike | undefined = opts.fetchImpl ?? fallbackFetch;
  if (typeof doFetch !== 'function') {
    return failed('This browser cannot make network requests, so nothing was submitted.');
  }

  // A hard deadline, enforced locally. AbortController cancels the real request;
  // the race guarantees we stop waiting even if an implementation ignores the
  // signal, which is what a shopkeeper on dead wifi actually needs — the UI must
  // report "failed" in seconds, not hang until the socket gives up.
  const controller = new AbortController();
  /** The FetchLike init type omits the signal; real fetch accepts it, so widen here. */
  type InitWithSignal = {
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array;
    signal?: AbortSignal;
  };
  const send = doFetch as unknown as (
    url: string,
    init?: InitWithSignal,
  ) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = send(`${calendar}/digest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
      signal: controller.signal,
    });
    // The race below owns this promise's outcome; without a listener a late
    // rejection would surface as an unhandled rejection and crash some runners.
    request.catch(() => undefined);

    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AnchorTimeout(timeoutMs));
      }, timeoutMs);
    });

    const response = await Promise.race([request, deadline]);

    if (!response.ok) {
      return failed(`The calendar refused the digest (HTTP ${response.status}).`);
    }

    const proof = new Uint8Array(await response.arrayBuffer());
    if (proof.length === 0) {
      // An empty body is not a proof; storing it as one would be a lie the merchant
      // could not detect later.
      return failed('The calendar replied with an empty timestamp.');
    }

    return {
      date: book.date,
      digestHex: book.digestHex,
      status: 'submitted',
      submittedAt: now.toISOString(),
      calendar,
      proofBase64: toBase64(proof),
      error: null,
    };
  } catch (err) {
    if (err instanceof AnchorTimeout) {
      return failed(`The calendar did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return failed(`The calendar did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    return failed(plainNetworkError(err));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Marks our own deadline, so it is never confused with a network error. */
class AnchorTimeout extends Error {
  constructor(timeoutMs: number) {
    super(`No answer within ${timeoutMs}ms.`);
    this.name = 'AnchorTimeout';
  }
}

/** Turn whatever fetch threw into a line a shopkeeper can act on. */
function plainNetworkError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/fetch|network|load failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(raw)) {
    return 'Could not reach the calendar. Check the connection and try again.';
  }
  return raw.trim() === '' ? 'The calendar could not be reached.' : raw;
}

// ---------------------------------------------------------------------------
// UI copy and local verification
// ---------------------------------------------------------------------------

/**
 * One honest sentence about where the anchor stands.
 *
 * "Submitted" is not "confirmed". A calendar accepts a digest immediately and
 * commits it to Bitcoin later, on its own schedule; saying anything stronger would
 * be a claim this software cannot back. There is deliberately no word "confirmed"
 * anywhere in this function's output.
 */
export function describeAnchor(anchor: Anchor): string {
  switch (anchor.status) {
    case 'local-only':
      return 'Hashed locally. Not yet timestamped.';
    case 'submitted':
      return 'Digest submitted to a public calendar — the Bitcoin attestation arrives in the calendar’s own time.';
    case 'failed':
      return `Not timestamped: ${anchor.error ?? 'the calendar could not be reached.'}`;
  }
}

/**
 * Recompute the day from the invoices on hand and compare.
 *
 * This is the check that catches the quiet failure: someone edited yesterday's
 * takings after the digest was made. It cannot prove the invoices are genuine —
 * only that they are the same invoices the digest was made from.
 */
export async function verifyLocally(
  book: DayBook,
  invoices: ReadonlyArray<AnchorInvoice>,
): Promise<{ ok: boolean; reason: string }> {
  let recomputed: DayBook;
  try {
    recomputed = await dayDigest(invoices, book.date);
  } catch (err) {
    return {
      ok: false,
      reason: `Could not recompute the day: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (recomputed.count !== book.count) {
    return {
      ok: false,
      reason: `The invoice count changed (${book.count} recorded, ${recomputed.count} now). The books were edited after the digest was made.`,
    };
  }
  if (recomputed.totalAtoms !== book.totalAtoms) {
    return {
      ok: false,
      reason: 'The day’s total changed. The books were edited after the digest was made.',
    };
  }
  if (recomputed.digestHex !== book.digestHex) {
    return {
      ok: false,
      reason:
        'The invoices no longer produce the recorded digest. The books were edited after the digest was made.',
    };
  }

  return { ok: true, reason: 'The invoices still produce this digest.' };
}
