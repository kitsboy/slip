import { it, expect } from 'vitest';
import { sameInvoice, resolveInvoice } from '../src/core/orders';
import type { Invoice } from '../src/core/orders';
const invoice = {id:'a',status:'seen',manual:false,receivedAtoms:40n} as Invoice;
it('compares all invoice fields, not just status/manual', () => {
 expect(sameInvoice(invoice,{...invoice,receivedAtoms:70n})).toBe(false);
});
it('never cancels completed or partially received money as unpaid', () => {
 expect(() => resolveInvoice({...invoice,status:'complete'},'cancel')).toThrow();
 expect(() => resolveInvoice(invoice,'cancel')).toThrow();
 expect(resolveInvoice({...invoice,status:'expired',receivedAtoms:0n},'cancel').status).toBe('cancelled');
 expect(resolveInvoice(invoice,'manual').manual).toBe(true);
});
