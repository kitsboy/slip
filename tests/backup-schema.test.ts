import { expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createBackup } from '../src/core/backup';
import { validLedger } from '../src/core/backup-schema';
import { testBackup } from '../src/core/test-backup';
const base = {app:'slip',accounts:[],shifts:{version:1,events:[]}};
const ledger = {version:1,items:[],invoices:[],requests:[],books:{}};
it('accepts older additive-field-free books and rejects broken invoice relationships',()=>{
 const sale={id:'a',walletId:'w',walletLabel:'W',address:'public',index:0,amountAtoms:'100',amountMinor:'1',currency:'USD',rateMinorPerCoin:null,rateAt:null,lines:[],createdAt:'2026-11-17',expiresAt:'2026-11-17',status:'complete',manual:false,seenAt:null,confirmedAt:null,note:''};
 const old={...ledger,books:{w:{next:1,reserved:[],used:[0]}},invoices:[sale]};
 expect(validLedger(old)).toBe(true);
 expect(validLedger({...old,invoices:[{...sale,index:1}]})).toBe(false);
 expect(validLedger({...old,invoices:[sale,{...sale,id:'b'}]})).toBe(false);
 expect(validLedger({...old,invoices:[{...sale,index:null,receiptNumber:'2026-11-17-001'},{...sale,id:'b',index:null,receiptNumber:'2026-11-17-001'}]})).toBe(false);
 expect(validLedger({...old,refunds:[{id:'r',invoiceId:'a',atoms:'101',at:'2026-11-17',reason:'refund',reference:'ref',method:'cash'}]})).toBe(false);
});
for(const bad of [{items:[{priceMinor:'1'}]},{requests:[{amountMinor:'1'}]},{books:{w:{next:0,reserved:[],used:[0]}}},{closures:{invalid:true}},{watches:{}},{refunds:[{atoms:'-1',invoiceId:'missing'}]}]) it('rejects malformed consumed collection '+JSON.stringify(bad),async()=>{
 vi.stubGlobal('crypto',webcrypto);
 const text=await createBackup({...base,ledger:{...ledger,...bad}},'long enough passphrase 123');
 expect((await testBackup(text,'long enough passphrase 123')).ok).toBe(false);
 vi.unstubAllGlobals();
});
