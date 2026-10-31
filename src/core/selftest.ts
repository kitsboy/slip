/**
 * "Prove it works" — a ten-second check the merchant can run on their own copy.
 *
 * Why it exists: slip ships as a single file a shop may keep on a laptop, a USB stick or a phone.
 * If that file is tampered with or half-downloaded, nothing else in the app would notice. These
 * checks run the parts that must be exact — address derivation, money rounding, QR encoding,
 * receipt proofs — against fixed answers, in the browser, with no network.
 *
 * It is not a security audit and the screen says so: it proves the arithmetic has not been altered,
 * not that the whole app is safe.
 */

import { parseExtendedKey } from './keys';
import { deriveAddress } from './derive';
import { fiatToAtoms, parseFiat } from './money';
import { parseProof, formatProof } from './proof';
import { paymentUri, qrSize, validateQrPayload } from './qr';

export interface SelfTestResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

const VECTOR_XPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const VECTOR_FIRST_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

function check(name: string, run: () => { ok: boolean; detail: string }): SelfTestResult {
  try {
    const r = run();
    return { name, ok: r.ok, detail: r.detail };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : 'threw an error' };
  }
}

export function runSelfTest(): SelfTestResult[] {
  return [
    check('Derive address 0/0', () => {
      const key = parseExtendedKey(VECTOR_XPUB);
      const address = deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: 0 }).address;
      return { ok: address === VECTOR_FIRST_ADDRESS, detail: address === VECTOR_FIRST_ADDRESS ? address : `got ${address}` };
    }),
    check('Parse an amount', () => {
      const minor = parseFiat('4.50', 'USD').minor;
      return { ok: minor === 450n, detail: `${minor} minor units` };
    }),
    check('Price a sale in sats', () => {
      const atoms = fiatToAtoms({ minor: 450n, currency: 'USD' }, 6_000_000n);
      return { ok: atoms === 7500n, detail: `${atoms} sats at 60,000.00 USD` };
    }),
    check('Encode a payment QR', () => {
      const uri = paymentUri('bitcoin', { address: VECTOR_FIRST_ADDRESS, amountSats: 7500n });
      const shape = validateQrPayload(uri);
      const size = qrSize(uri);
      return {
        ok: uri.includes('amount=0.000075') && shape.ok && size >= 21,
        detail: `${size}×${size} modules`,
      };
    }),
    check('Round-trip a receipt proof', () => {
      const proof = {
        id: 'inv_selftest',
        address: VECTOR_FIRST_ADDRESS,
        amountAtoms: 7500n,
        createdAt: '2026-10-31T10:00:00.000Z',
        dayDigestHex: null,
      };
      const parsed = parseProof(formatProof(proof));
      const ok =
        parsed.ok &&
        parsed.proof?.amountAtoms === 7500n &&
        parsed.proof.address === proof.address &&
        parsed.proof.dayDigestHex === null;
      return { ok, detail: ok ? 'proof reads back exactly' : 'proof did not round-trip' };
    }),
  ];
}

export function allPassed(results: readonly SelfTestResult[]): boolean {
  return results.every((r) => r.ok);
}
