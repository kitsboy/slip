/**
 * The customer-facing surface of the till: one QR code.
 *
 * Why this file is strict about everything:
 *  - A QR that renders but encodes the wrong thing sends a customer's money to a
 *    destination the merchant does not control. "It looks like a QR" is not
 *    evidence; only a decode round-trip is.
 *  - BIP-21 `amount` is denominated in **BTC**, not sats. Emitting sats there is
 *    the classic bug: 7500 sats becomes "amount=7500" — a request for 7500 BTC.
 *    So sats only ever reach the URI through `satsToBtcString`, which is pure
 *    BigInt/string and cannot introduce a float rounding error.
 *  - The SVG is built by string concatenation, so every dynamic value is either
 *    validated against a fixed pattern (colours) or absent. Nothing free-form is
 *    ever interpolated, which is what makes it safe to inline and to load from a
 *    `data:` URL.
 */

import { encode } from 'uqr';

/** BIP-21 `lno` / lightning: URIs must carry a real invoice, not free text. */
const INVOICE_PREFIX = /^(lnbc|lntb|lnbcrt|lnuri|lnurl)/i;

/** 1 BTC = 100,000,000 sats. Exact, as a BigInt — never 1e8 as a number. */
const SATS_PER_BTC = 100_000_000n;

export type PaymentKind = 'bitcoin' | 'lightning';

export interface PaymentPayload {
  /** On-chain destination (or, for BIP-21, the address part). Required for 'bitcoin'. */
  readonly address?: string;
  /** Amount in satoshis. Always converted to BTC before it reaches the URI. */
  readonly amountSats?: bigint;
  readonly label?: string;
  readonly message?: string;
  /** BOLT-11 / LNURL invoice. Required for 'lightning', optional `lno` for 'bitcoin'. */
  readonly invoice?: string;
}

export interface QrPayloadCheck {
  readonly ok: boolean;
  readonly scheme: 'bitcoin' | 'lightning' | null;
}

export interface RenderQrOptions {
  /** Pixels per module in the emitted width/height attributes. */
  readonly scale?: number;
  /** Quiet zone in modules. BIP-21/QR spec wants at least 4 for reliable scanning. */
  readonly margin?: number;
  readonly dark?: string;
  readonly light?: string;
}

function fail(reason: string): never {
  throw new Error(`qr: ${reason}`);
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * Satoshis -> the BTC decimal string BIP-21 wants, with trailing zeros trimmed
 * and no more than 8 decimals (`1` not `1.00000000`, `0.000075` not `0.00007500`).
 *
 * Done with integer division and a padded remainder rather than `sats / 1e8`,
 * because a float carries only 15-17 significant digits: 21,000,000 BTC in sats
 * is 2.1e15, already at the edge, and any rounding there shifts the amount the
 * customer is asked to pay. Zero is rejected: a zero-amount request is a
 * donation box, not a sale, and silently accepting it hides a pricing bug.
 */
export function satsToBtcString(sats: bigint): string {
  if (sats <= 0n) fail(`amount must be a positive number of sats, got ${sats.toString()}`);

  const whole = sats / SATS_PER_BTC;
  const frac = sats % SATS_PER_BTC;
  if (frac === 0n) return whole.toString();

  // padStart(8) then trimEnd('0'): 7500n -> '00007500' -> '000075'.
  return `${whole.toString()}.${frac.toString().padStart(8, '0').replace(/0+$/, '')}`;
}

// ---------------------------------------------------------------------------
// BIP-21 / lightning URIs
// ---------------------------------------------------------------------------

/**
 * Percent-encodes a BIP-21 parameter value.
 *
 * `encodeURIComponent` leaves `!'()*` alone; those are legal in a URI but are
 * also shell/metacharacter hazards downstream, so they are escaped too. Space
 * becomes `%20` and never `+`: BIP-21 consumers are not form decoders and would
 * read a literal plus sign.
 */
function encodeParam(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function requireInvoice(invoice: string, context: string): string {
  const trimmed = invoice.trim();
  if (trimmed.length === 0) fail(`${context}: invoice is empty`);
  // Rejecting here is deliberate: `lightning:hello` scans fine and pays nothing,
  // which is worse than a QR the customer cannot scan at all.
  if (!INVOICE_PREFIX.test(trimmed)) {
    fail(`${context}: not a lightning invoice (expected lnbc/lntb/lnbcrt/lnuri/lnurl): "${trimmed.slice(0, 16)}"`);
  }
  if (/\s/.test(trimmed)) fail(`${context}: invoice contains whitespace`);
  return trimmed;
}

/**
 * Builds the URI a wallet will act on.
 *
 * `bitcoin:<address>?amount=<BTC>&label=…&message=…&lno=…`
 * `lightning:<invoice>`
 *
 * Parameter order is fixed (amount, label, message, lno) so the output is
 * byte-stable and can be asserted exactly in tests and diffed in receipts.
 */
export function paymentUri(kind: PaymentKind, payload: PaymentPayload): string {
  if (kind === 'lightning') {
    if (payload.invoice === undefined) fail('lightning: an invoice is required');
    if (payload.amountSats !== undefined) {
      // The invoice already commits to an amount. Accepting a second one invites
      // the two to disagree, and the wallet picks one of them.
      fail('lightning: amount is carried by the invoice, not by the URI');
    }
    return `lightning:${requireInvoice(payload.invoice, 'lightning')}`;
  }

  const address = (payload.address ?? '').trim();
  if (address.length === 0) fail('bitcoin: an address is required');
  // A space or control char in the address would silently truncate the path
  // component when a wallet parses it.
  if (/[\s\u0000-\u001f]/.test(address)) fail(`bitcoin: address contains whitespace or control characters`);

  const params: string[] = [];

  if (payload.amountSats !== undefined) {
    // The one place sats become BTC. Never `amountSats.toString()`.
    params.push(`amount=${satsToBtcString(payload.amountSats)}`);
  }
  if (payload.label !== undefined && payload.label !== '') {
    params.push(`label=${encodeParam(payload.label)}`);
  }
  if (payload.message !== undefined && payload.message !== '') {
    params.push(`message=${encodeParam(payload.message)}`);
  }
  if (payload.invoice !== undefined && payload.invoice !== '') {
    params.push(`lno=${requireInvoice(payload.invoice, 'bitcoin lno')}`);
  }

  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return `bitcoin:${address}${query}`;
}

// ---------------------------------------------------------------------------
// QR matrix
// ---------------------------------------------------------------------------

/** Raw module matrix from uqr, borderless: `true` is a dark module. */
export function qrMatrix(text: string): boolean[][] {
  if (text.length === 0) fail('refusing to encode an empty payload');
  // border: 0 keeps the quiet zone out of the matrix so callers (SVG, raster)
  // decide their own margin instead of double-padding it.
  return encode(text, { border: 0, ecc: 'M' }).data.map((row) => row.slice());
}

/** Modules per side, quiet zone excluded. */
export function qrSize(text: string): number {
  return qrMatrix(text).length;
}

const COLOUR = /^#[0-9a-fA-F]{6}$/;

function colour(value: string, what: string): string {
  if (value === 'currentColor' || COLOUR.test(value)) return value;
  // Colours are the only dynamic strings that reach the markup, so they are
  // pattern-checked rather than escaped: that closes the injection path
  // completely instead of relying on an escaper being called everywhere.
  fail(`${what} must be #rrggbb or currentColor, got "${value}"`);
}

/**
 * Inline SVG for `text`, safe to drop into the DOM or a `data:image/svg+xml`
 * URL: no scripts, no `href`, no external references — the only URL in the
 * document is the SVG namespace itself.
 *
 * Horizontal runs of dark modules are merged into one path so a 33x33 code is
 * a few hundred bytes of `d` instead of 1000+ `<rect>` elements.
 */
export function renderQrSvg(text: string, opts: RenderQrOptions = {}): string {
  const scale = opts.scale ?? 8;
  const margin = opts.margin ?? 4;
  const dark = colour(opts.dark ?? '#000000', 'dark');
  const light = colour(opts.light ?? '#ffffff', 'light');

  if (!Number.isInteger(scale) || scale <= 0) fail(`scale must be a positive integer, got ${scale}`);
  if (!Number.isInteger(margin) || margin < 0) fail(`margin must be a non-negative integer, got ${margin}`);

  const matrix = qrMatrix(text);
  const size = matrix.length;
  const total = size + margin * 2;

  const segments: string[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = matrix[y];
    if (row === undefined) continue;
    let x = 0;
    while (x < size) {
      if (row[x] !== true) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && row[x] === true) x += 1;
      const width = x - start;
      // Translate into the padded coordinate space by adding the margin.
      segments.push(`M${start + margin} ${y + margin}h${width}v1h-${width}z`);
    }
  }

  const px = total * scale;
  // shape-rendering="crispEdges" stops the browser antialiasing module edges,
  // which is what makes a small on-screen code readable by a phone camera.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"`,
    ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"`,
    ` role="img" aria-hidden="true">`,
    `<rect width="${total}" height="${total}" fill="${light}"/>`,
    `<path fill="${dark}" d="${segments.join('')}"/>`,
    `</svg>`,
  ].join('');
}

/**
 * Cheap structural gate for anything about to be encoded. This module only
 * speaks BIP-21 and lightning, so free text is a caller bug, not a payload.
 */
export function validateQrPayload(text: string): QrPayloadCheck {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, scheme: null };

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bitcoin:')) {
    const body = trimmed.slice('bitcoin:'.length);
    // `bitcoin:` with nothing behind it, or with no address before the query,
    // is an empty payment request.
    const address = body.split('?')[0] ?? '';
    return { ok: address.length > 0 && !/\s/.test(address), scheme: 'bitcoin' };
  }
  if (lower.startsWith('lightning:')) {
    const body = trimmed.slice('lightning:'.length).trim();
    const ok = body.length > 0 && INVOICE_PREFIX.test(body) && !/\s/.test(body);
    return { ok, scheme: 'lightning' };
  }
  return { ok: false, scheme: null };
}
