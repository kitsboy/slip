/**
 * A receipt the customer can keep, and slip can check later.
 *
 * There is no signature here and the code says so: slip holds no key that could sign, so a
 * "signed receipt" from slip would be a lie dressed in cryptography. What this RECORD proves
 * is that a specific invoice named a specific address and amount, and — when the day was
 * anchored — which day digest it belongs to, which is verifiable against the merchant's own
 * books and against the Bitcoin timestamp.
 *
 * Field separator is `|` and every field is validated on parse, because a proof string is
 * pasted by a human and a lenient parser is how "looks like a receipt" becomes "is one".
 */

export const PROOF_PREFIX = 'SLIP1';

export interface ReceiptProof {
  readonly id: string;
  readonly address: string;
  readonly amountAtoms: bigint;
  readonly createdAt: string;
  /** Day digest from the anchor, or null when that day was never anchored. */
  readonly dayDigestHex: string | null;
}

export interface ParsedProof {
  readonly ok: boolean;
  readonly proof: ReceiptProof | null;
  readonly reason: string | null;
}

export function formatProof(proof: ReceiptProof): string {
  const digest = proof.dayDigestHex ?? '-';
  return [PROOF_PREFIX, proof.id, proof.address, proof.amountAtoms.toString(), proof.createdAt, digest].join('|');
}

export function parseProof(text: string): ParsedProof {
  const parts = (text ?? '').trim().split('|');
  if (parts.length !== 6) return { ok: false, proof: null, reason: 'not a slip receipt (expected 6 fields)' };
  const [prefix, id, address, atoms, createdAt, digest] = parts as [string, string, string, string, string, string];

  if (prefix !== PROOF_PREFIX) return { ok: false, proof: null, reason: `not a slip receipt (prefix "${prefix.slice(0, 12)}")` };
  if (!/^inv_[a-z0-9_]+$/i.test(id)) return { ok: false, proof: null, reason: 'receipt id is malformed' };
  // On-chain addresses are alphanumeric; a Lightning address carries '@' and '.', and both
  // are legitimate destinations, so the check allows the union rather than pretending one rail
  // does not exist.
  if (!/^[a-z0-9.@_-]{6,120}$/i.test(address)) return { ok: false, proof: null, reason: 'address is malformed' };
  if (!/^\d+$/.test(atoms)) return { ok: false, proof: null, reason: 'amount is not a whole number of atoms' };
  if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) return { ok: false, proof: null, reason: 'timestamp is malformed' };
  if (digest !== '-' && !/^[0-9a-f]{64}$/i.test(digest)) {
    return { ok: false, proof: null, reason: 'day digest is not a 32-byte hex string' };
  }

  return {
    ok: true,
    proof: {
      id,
      address,
      amountAtoms: BigInt(atoms),
      createdAt,
      dayDigestHex: digest === '-' ? null : digest.toLowerCase(),
    },
    reason: null,
  };
}

/** True when a proof belongs to this invoice — address and amount must both match. */
export function proofMatchesInvoice(
  proof: ReceiptProof,
  invoice: { id: string; address: string; amountAtoms: bigint },
): boolean {
  return proof.id === invoice.id && proof.address === invoice.address && proof.amountAtoms === invoice.amountAtoms;
}
