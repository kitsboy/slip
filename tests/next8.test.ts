import { describe, expect, it } from 'vitest';
import { paymentGuidance, rememberedRate } from '../src/core/selling-guidance';
import { salesCsv } from '../src/core/history';
import type { Invoice } from '../src/core/orders';
const invoice = { status: 'underpaid', amountAtoms: 1000n, receivedAtoms: 500n } as Invoice;
describe('selling guidance is read only and coin aware', () => {
  it('names a short Litecoin payment without marking it', () => {
    expect(paymentGuidance(invoice, 'ltc')).toMatch(/LTC/);
    expect(paymentGuidance(invoice, 'ltc')).toMatch(/Do not/);
    expect(invoice.status).toBe('underpaid');
  });
  it.each(['seen', 'expired', 'awaiting'] as const)('explains %s without a paid claim', status => {
    expect(paymentGuidance({ ...invoice, status }, 'btc')).toMatch(/check|Check|confirmation/);
  });
  it('names observed excess only', () => {
    expect(paymentGuidance({ ...invoice, status: 'complete', receivedAtoms: 1200n }, 'btc')).toMatch(/over/);
    expect(paymentGuidance({ ...invoice, status: 'complete', receivedAtoms: null }, 'btc')).not.toMatch(/over/);
  });
  it.each(['garbage', '{}', '{"value":"-1"}', '{"value":"Infinity"}', '{"value":60000}'])('rejects invalid remembered rate %s', raw => {
    expect(rememberedRate(raw)).toBeNull();
  });
  it('preserves valid rate timestamp', () => {
    expect(rememberedRate('{"value":"60000","at":"2026-11-20T10:00:00Z"}')?.at).toBe('2026-11-20T10:00:00Z');
  });
  it('neutralizes spreadsheet formulas including leading whitespace', () => {
    const row = { id:'x', at:'now', walletLabel:' =CMD()', coin:'btc', rail:'manual', atoms:1n, refundedAtoms:0n, netAtoms:1n, overpaidAtoms:0n, manual:true, note:'\t+SUM(1)', receivedAtoms:null } as const;
    const csv=salesCsv([row]);
    expect(csv).toContain("' =CMD()");
    expect(csv).toContain("'\t+SUM(1)");
    expect(csv.split('\n')[0]).toBe('invoice,date_time_utc,wallet,coin,rail,atoms,refunded_atoms,net_atoms,amount,overpaid_atoms,manual,note,receipt_number,status');
  });
});
