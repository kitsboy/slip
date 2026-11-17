import {expect,it,vi} from 'vitest';
import {createLedger} from '../src/core/ledger';
import {sweepNow} from '../src/core/reconcile-run';
import {DEFAULT_SETTINGS} from '../src/core/settings';
import type {Invoice} from '../src/core/orders';
const {look}=vi.hoisted(()=>({look:vi.fn()}));
vi.mock('../src/core/providers/esplora',()=>({targetFor:()=>({}),fetchAddressActivity:look}));
it('delayed 40 cannot overwrite newer 70 with unchanged status and skipped changes are not returned',async()=>{
 const values=new Map<string,string>();const store={removeItem:(k:string)=>{values.delete(k);},getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const ledger=createLedger(store);const now=new Date();const invoice={id:'race',walletId:'w',walletLabel:'W',address:'public',index:null,amountAtoms:100n,amountMinor:1n,currency:'USD',rateMinorPerCoin:null,rateAt:null,lines:[],createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+60000).toISOString(),status:'seen',seenAt:now.toISOString(),confirmedAt:null,manual:false,receivedAtoms:20n,note:''} as Invoice;
 ledger.putInvoice(invoice);values.set('slip.accounts.v1',JSON.stringify({version:1,accounts:[{id:'w',networkId:'btc-signet'}]}));
 let finish!:(v:unknown)=>void;look.mockImplementation(()=>new Promise(r=>{finish=r;}));
 const pending=sweepNow(store,DEFAULT_SETTINGS);
 ledger.touchInvoice('race',{receivedAtoms:70n});finish({chainReceivedAtoms:0n,mempoolReceivedAtoms:40n,txCount:1});
 const result=await pending;expect(ledger.load().invoices[0]!.receivedAtoms).toBe(70n);expect(result?.changed).toBe(false);expect(result?.result.updated).toEqual([]);expect(result?.result.changes).toEqual([]);
});
