/**
 * The QR module only earns trust from a real decode.
 *
 * Every encoded payload below is rasterised to RGBA pixels and handed to jsQR —
 * an independent decoder — and the decoded string must match the input exactly.
 * A test that only asserts "the SVG contains <svg" would pass just as happily
 * for a code encoding the wrong address, which is the failure that actually
 * costs a merchant money.
 */

import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';

import {
  paymentUri,
  qrMatrix,
  qrSize,
  renderQrSvg,
  satsToBtcString,
  validateQrPayload,
} from '../src/core/qr';

const SCALE = 4;
const QUIET = 4;

/**
 * Draws the module matrix into an RGBA buffer the way a screen would: dark
 * modules black and opaque, light modules white and opaque, on a white quiet
 * zone wide enough for the locator patterns to be found.
 */
function rasterise(text: string): { pixels: Uint8ClampedArray; width: number; height: number } {
  const matrix = qrMatrix(text);
  const size = matrix.length;
  const width = (size + QUIET * 2) * SCALE;

  const pixels = new Uint8ClampedArray(width * width * 4);
  // Start fully white so the quiet zone needs no special-casing.
  pixels.fill(255);

  for (let y = 0; y < size; y += 1) {
    const row = matrix[y];
    if (row === undefined) continue;
    for (let x = 0; x < size; x += 1) {
      if (row[x] !== true) continue;
      const px0 = (x + QUIET) * SCALE;
      const py0 = (y + QUIET) * SCALE;
      for (let dy = 0; dy < SCALE; dy += 1) {
        for (let dx = 0; dx < SCALE; dx += 1) {
          const i = ((py0 + dy) * width + (px0 + dx)) * 4;
          pixels[i] = 0;
          pixels[i + 1] = 0;
          pixels[i + 2] = 0;
          pixels[i + 3] = 255;
        }
      }
    }
  }

  return { pixels, width, height: width };
}

/** Encodes, rasterises and decodes. Throws (rather than returning null) so a
 *  failure names the payload instead of surfacing as a bare matcher error. */
function roundTrip(text: string): string {
  const { pixels, width, height } = rasterise(text);
  const result = jsQR(pixels, width, height);
  if (result === null) throw new Error(`jsQR could not decode: ${text}`);
  return result.data;
}

const TAPROOT = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';

describe('QR encode -> decode round-trip (jsQR as reference decoder)', () => {
  it('decodes a BIP-21 URI carrying an amount back to the identical string', () => {
    const uri = paymentUri('bitcoin', {
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      amountSats: 7500n,
      label: 'Coffee & Cake',
      message: 'Table 4',
    });

    expect(uri).toContain('amount=0.000075');
    // The decoded value is byte-identical, which is the only proof that the
    // amount reached the pixels as BTC rather than as 7500.
    expect(roundTrip(uri)).toBe(uri);
    expect(roundTrip(uri)).toContain('label=Coffee%20%26%20Cake');
  });

  it('decodes a lightning invoice URI to the identical string', () => {
    const invoice =
      'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4js' +
      'xqzrzs9cyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus' +
      '8g6cmveex2um5v4ehx';
    const uri = paymentUri('lightning', { invoice });

    expect(uri.startsWith('lightning:lnbc')).toBe(true);
    expect(roundTrip(uri)).toBe(uri);
  });

  it('decodes a long taproot address URI without truncation', () => {
    const uri = paymentUri('bitcoin', { address: TAPROOT, amountSats: 123456789n });

    expect(uri).toContain('amount=1.23456789');
    const decoded = roundTrip(uri);
    expect(decoded).toBe(uri);
    // Guards against the address being clipped by a small symbol version.
    expect(decoded).toContain(TAPROOT);
  });

  it('decodes a lightning payment onto a taproot address with an lno fallback', () => {
    const invoice = 'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmww';
    const uri = paymentUri('bitcoin', {
      address: TAPROOT,
      amountSats: 1n,
      message: 'fallback: lightning preferred',
      invoice,
    });

    expect(uri).toContain('amount=0.00000001');
    expect(uri).toContain('lno=lnbc1');
    expect(roundTrip(uri)).toBe(uri);
  });

  it('exposes the matrix and its size', () => {
    const matrix = qrMatrix('bitcoin:' + TAPROOT);
    expect(matrix.length).toBe(qrSize('bitcoin:' + TAPROOT));
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    // A version-1..40 code is always 21 + 4k modules per side.
    expect((matrix.length - 21) % 4).toBe(0);
  });
});

describe('satsToBtcString', () => {
  it('renders one satoshi with full precision', () => {
    expect(satsToBtcString(1n)).toBe('0.00000001');
  });

  it('renders a whole coin without a fractional part', () => {
    expect(satsToBtcString(100_000_000n)).toBe('1');
  });

  it('trims trailing zeros', () => {
    expect(satsToBtcString(7500n)).toBe('0.000075');
    expect(satsToBtcString(123_456_789n)).toBe('1.23456789');
  });

  it('rejects zero, because a sale is never free', () => {
    expect(() => satsToBtcString(0n)).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => satsToBtcString(-1n)).toThrow();
  });
});

describe('paymentUri', () => {
  it('percent-encodes a label containing a space and an ampersand', () => {
    const uri = paymentUri('bitcoin', {
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      label: 'Salt & Pepper Cafe',
    });

    expect(uri).toBe('bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?label=Salt%20%26%20Pepper%20Cafe');
    // A raw `&` would start a new BIP-21 parameter; a `+` would decode literally.
    expect(uri.slice(uri.indexOf('?'))).not.toContain('&');
    expect(uri).not.toContain('+');
  });

  it('refuses a zero amount', () => {
    expect(() =>
      paymentUri('bitcoin', { address: 'bc1qxyz', amountSats: 0n }),
    ).toThrow();
  });

  it('refuses a negative amount', () => {
    expect(() =>
      paymentUri('bitcoin', { address: 'bc1qxyz', amountSats: -500n }),
    ).toThrow();
  });

  it('refuses a lightning payload that is not an invoice', () => {
    expect(() => paymentUri('lightning', { invoice: 'hello' })).toThrow();
  });

  it('refuses a lightning payload with no invoice at all', () => {
    expect(() => paymentUri('lightning', {})).toThrow();
  });

  it('refuses a bitcoin payload with no address', () => {
    expect(() => paymentUri('bitcoin', { amountSats: 1000n })).toThrow();
  });
});

describe('renderQrSvg', () => {
  const svg = renderQrSvg(paymentUri('bitcoin', { address: TAPROOT, amountSats: 7500n }));

  it('emits an inline SVG with a viewBox', () => {
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 ');
  });

  it('renders with crisp edges so module borders are not antialiased', () => {
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it('carries no external reference', () => {
    // The xmlns is the one permitted `http` occurrence: it is an identifier, not
    // a fetchable URL, and a standalone data: URL SVG needs it. Everything else
    // in the document must be self-contained.
    const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
    expect(withoutNamespace).not.toContain('http');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('image');
  });

  it('rejects a colour that is not a hex triplet or currentColor', () => {
    expect(() => renderQrSvg('bitcoin:bc1qxyz', { dark: 'red' })).toThrow();
    expect(() => renderQrSvg('bitcoin:bc1qxyz', { dark: '"><script>' })).toThrow();
  });

  it('accepts explicit colours', () => {
    const custom = renderQrSvg('bitcoin:bc1qxyz', { dark: '#102030', light: 'currentColor', scale: 2, margin: 1 });
    expect(custom).toContain('fill="#102030"');
    expect(custom).toContain('fill="currentColor"');
  });
});

describe('validateQrPayload', () => {
  it('rejects an empty payload', () => {
    expect(validateQrPayload('')).toEqual({ ok: false, scheme: null });
  });

  it('rejects whitespace-only text', () => {
    expect(validateQrPayload('   ')).toEqual({ ok: false, scheme: null });
  });

  it('rejects text that is neither bitcoin nor lightning', () => {
    expect(validateQrPayload('hello')).toEqual({ ok: false, scheme: null });
  });

  it('accepts a bitcoin URI and reports the scheme', () => {
    const check = validateQrPayload(paymentUri('bitcoin', { address: TAPROOT, amountSats: 7500n }));
    expect(check).toEqual({ ok: true, scheme: 'bitcoin' });
  });

  it('accepts a lightning invoice URI and reports the scheme', () => {
    const check = validateQrPayload('lightning:lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqf');
    expect(check).toEqual({ ok: true, scheme: 'lightning' });
  });

  it('rejects a lightning URI that is not an invoice', () => {
    expect(validateQrPayload('lightning:hello').ok).toBe(false);
  });
});
