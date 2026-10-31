import { describe, expect, it } from 'vitest';
import { formatProof, parseProof, proofMatchesInvoice } from '../src/core/proof';

const proof = {
  id: 'inv_abc123',
  address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  amountAtoms: 17_084n,
  createdAt: '2026-10-31T13:43:00.000Z',
  dayDigestHex: 'a'.repeat(64),
};

describe('receipt proofs', () => {
  it('round-trips through a single line of text', () => {
    const text = formatProof(proof);
    const parsed = parseProof(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.proof).toEqual(proof);
    expect(text.split('|')).toHaveLength(6);
  });

  it('keeps an unanchored day honest with a dash, not a fake digest', () => {
    const parsed = parseProof(formatProof({ ...proof, dayDigestHex: null }));
    expect(parsed.ok).toBe(true);
    expect(parsed.proof?.dayDigestHex).toBeNull();
  });

  it('refuses a proof with the wrong number of fields', () => {
    expect(parseProof('SLIP1|inv_abc|bc1q').ok).toBe(false);
  });

  it('refuses a foreign prefix', () => {
    const r = parseProof('BTCPAY1|inv_abc|bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu|1|2026-10-31T13:43:00Z|-');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/prefix/);
  });

  it('refuses a non-numeric amount', () => {
    expect(parseProof(`SLIP1|inv_abc123|bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu|12.5|2026-10-31T13:43:00Z|-`).ok).toBe(false);
  });

  it('refuses a malformed digest and accepts a real 32-byte one', () => {
    const bad = parseProof(`SLIP1|inv_abc123|bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu|1|2026-10-31T13:43:00Z|xyz`);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/digest/);
    const good = parseProof(`SLIP1|inv_abc123|bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu|1|2026-10-31T13:43:00Z|${'b'.repeat(64)}`);
    expect(good.ok).toBe(true);
  });

  it('matches only the invoice it names — address and amount both count', () => {
    expect(proofMatchesInvoice(proof, proof)).toBe(true);
    expect(proofMatchesInvoice(proof, { ...proof, address: 'bc1qother' })).toBe(false);
    expect(proofMatchesInvoice(proof, { ...proof, amountAtoms: 17_085n })).toBe(false);
    expect(proofMatchesInvoice(proof, { ...proof, id: 'inv_zzz' })).toBe(false);
  });
});
