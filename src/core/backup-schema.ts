const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const uint = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const dec = (v: unknown): v is string => str(v) && /^\d+$/.test(v);
const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v));
const strings = (r: Record<string, unknown>, keys: string[]) => keys.every(k => str(r[k]));
const nullable = (v: unknown) => v === null || str(v);
/** Shared pre-write validator. Absent additive collections remain valid for old backups. */
export function validLedger(l: unknown): boolean {
 if (!obj(l) || l.version !== 1 || !obj(l.books)) return false;
 for (const key of ['items','invoices','requests','watches','anchors','refunds','closures']) {
  if ((['items','invoices','requests'].includes(key) || l[key] !== undefined) && !Array.isArray(l[key])) return false;
 }
 const rows = (key: string) => (l[key] ?? []) as Record<string,unknown>[];
 for (const key of ['items','invoices','requests','watches','refunds']) {
  const a=rows(key); if (!a.every(r => obj(r) && str(r.id) && r.id.length > 0) || new Set(a.map(r=>r.id)).size!==a.length) return false;
 }
 if (!rows('items').every(r=> strings(r,['name','category']) && dec(r.priceMinor) && ['FIAT','SATS'].includes(String(r.priceCurrency)) && typeof r.active==='boolean' && uint(r.sort) && (r.taxBps===undefined || uint(r.taxBps) && r.taxBps<=10000) && (r.emoji===undefined || str(r.emoji)))) return false;
 if (!rows('requests').every(r=>strings(r,['label','walletId','walletLabel','currency']) && dec(r.amountMinor) && ['once','weekly','monthly'].includes(String(r.cadence)) && date(r.nextDue) && date(r.createdAt) && (r.lastPaidAt===null || date(r.lastPaidAt)))) return false;
 const refs=new Set();
 const derived = new Set<string>();
 for (const r of rows('invoices')) {
  if (!strings(r,['walletId','walletLabel','address','currency','note']) || !dec(r.amountAtoms) || !dec(r.amountMinor) || !(r.rateMinorPerCoin===null || dec(r.rateMinorPerCoin)) || !((r.receivedAtoms===null || r.receivedAtoms===undefined) || dec(r.receivedAtoms)) || !['awaiting','seen','confirmed','complete','underpaid','expired','cancelled'].includes(String(r.status)) || typeof r.manual!=='boolean' || !date(r.createdAt) || !date(r.expiresAt) || ![r.seenAt,r.confirmedAt,r.rateAt].every(v=>v===null || date(v)) || !(r.index===null || uint(r.index)) || !Array.isArray(r.lines) || !r.lines.every(x=>obj(x) && str(x.name) && uint(x.quantity) && x.quantity>0 && dec(x.unitAtoms) && dec(x.unitMinor))) return false;
  if(r.receiptNumber!==undefined) { if(!str(r.receiptNumber) || !/^\d{4}-\d{2}-\d{2}-\d+$/.test(r.receiptNumber) || refs.has(r.receiptNumber)) return false; refs.add(r.receiptNumber); }
 }
 for (const b of Object.values(l.books)) {
  if (!obj(b) || !uint(b.next) || !Array.isArray(b.reserved) || !Array.isArray(b.used)) return false;
  const indexes=[...b.reserved,...b.used]; if(!indexes.every(v=>uint(v) && v<Number(b.next)) || new Set(indexes).size!==indexes.length) return false;
 }
 for (const i of rows('invoices')) if(i.index!==null) {
  const b=l.books[String(i.walletId)]; if(!obj(b) || !uint(i.index) || !uint(b.next) || i.index>=b.next) return false;
  const pair=String(i.walletId)+':'+i.index; if(derived.has(pair)) return false; derived.add(pair);
  if(![...(b.used as unknown[]),...(b.reserved as unknown[])].includes(i.index) && i.status!=='cancelled') return false;
 }
 if(!rows('watches').every(r=>strings(r,['label','address','networkId','note']) && date(r.addedAt))) return false;
 if(!rows('anchors').every(r=>obj(r) && strings(r,['date','digestHex']) && date(r.date) && /^[a-f0-9]{64}$/.test(String(r.digestHex)) && ['local-only','submitted','failed'].includes(String(r.status)) && [r.submittedAt,r.calendar,r.proofBase64,r.error].every(nullable))) return false;
 if(!rows('closures').every(r=>obj(r) && date(r.date) && date(r.at) && str(r.fingerprint))) return false;
 const refunded=new Map<string,bigint>();
 for(const r of rows('refunds')) {
  if(!strings(r,['invoiceId','reason','reference']) || !dec(r.atoms) || BigInt(r.atoms)<=0n || !date(r.at) || !['onchain-sent','lightning-sent','cash','goodwill'].includes(String(r.method))) return false;
  const i=rows('invoices').find(i=>i.id===r.invoiceId); if(!i || i.status!=='complete') return false;
  const total=(refunded.get(String(r.invoiceId))??0n)+BigInt(r.atoms); if(total>BigInt(String(i.amountAtoms))) return false; refunded.set(String(r.invoiceId),total);
 }
 return true;
}
