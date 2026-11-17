import { validLedger } from './backup-schema';
import { restoreBackup } from './backup';
import { verifyLog, type ShiftLog } from './shifts';
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** Pure inspection: no store is imported or written. */
export async function testBackup(
  text: string,
  passphrase: string,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const result = await restoreBackup(text, passphrase);
  if (!result.ok) return result;
  const s = result.state;
  if (
    !object(s) ||
    s.app !== 'slip' ||
    !Array.isArray(s.accounts) ||
    !s.accounts.every(
      (a) =>
        object(a) &&
        ['id', 'label', 'xpub', 'networkId', 'scriptType', 'source'].every(
          (k) => typeof a[k] === 'string',
        ) &&
        ['btc', 'ltc'].includes(String(a.coin)),
    )
  )
    return { ok: false, error: 'Invalid backup counter schema' };
  const ids=s.accounts.map(a=>(a as Record<string,unknown>).id);
  if (new Set(ids).size !== ids.length || s.accounts.some(a=>{const r=a as Record<string,unknown>;return !['btc-mainnet','btc-signet','btc-testnet4','ltc-mainnet','ltc-testnet'].includes(String(r.networkId)) || !['xpub','descriptor','pubkey','address'].includes(String(r.source)) || !['firstAddress','fingerprintHex','prefix','createdAt'].every(k=>typeof r[k]==='string') || !Number.isSafeInteger(r.nextIndex) || Number(r.nextIndex)<0;})) return {ok:false,error:'Invalid counter fields or duplicate IDs'};
  if (s.activeAccountId !== undefined && s.activeAccountId !== null && !ids.includes(s.activeAccountId)) return {ok:false,error:'Invalid active counter'};
  if (s.pinHash !== undefined && s.pinHash !== null && typeof s.pinHash !== 'string') return {ok:false,error:'Invalid PIN hash'};
  if (!object(s.shifts) || s.shifts.version !== 1 || !Array.isArray(s.shifts.events))
    return { ok: false, error: 'Invalid staff log schema' };
  if (!s.shifts.events.every(e=>object(e) && typeof e.at==='string' && Number.isFinite(Date.parse(e.at)) && ['open','handoff','return','acknowledge','pin-set','account-added'].includes(String(e.kind)) && ['accountId','accountLabel','staff'].every(k=>e[k]===null || typeof e[k]==='string') && (e.detail===undefined || typeof e.detail==='string'))) return {ok:false,error:'Invalid staff event schema'};
  try {
    const check = await verifyLog(s.shifts as unknown as ShiftLog);
    if (!check.ok) return { ok: false, error: 'Staff hash chain failed: ' + check.reason };
  } catch {
    return { ok: false, error: 'Invalid staff hash chain' };
  }
  let sales = 0;
  if (s.ledger !== null && s.ledger !== undefined) {
    const l = s.ledger;
    if (!validLedger(l)) return {ok:false,error:"Invalid books schema or relationships"};
    if (
      !object(l) ||
      l.version !== 1 ||
      !['items', 'invoices', 'requests'].every((k) => Array.isArray(l[k])) ||
      !object(l.books)
    )
      return { ok: false, error: 'Invalid books schema' };
    const decimal = (v: unknown) => typeof v === 'string' && /^-?\d+$/.test(v);
    if (
      !(l.invoices as unknown[]).every(
        (i) =>
          object(i) &&
          typeof i.id === 'string' &&
          typeof i.createdAt === 'string' &&
          ['walletId', 'address', 'currency'].every((k) => typeof i[k] === 'string') &&
          [
            'awaiting',
            'seen',
            'confirmed',
            'complete',
            'underpaid',
            'expired',
            'cancelled',
          ].includes(String(i.status)) &&
          (i.rateMinorPerCoin === null || decimal(i.rateMinorPerCoin)) &&
          (i.receivedAtoms === undefined || i.receivedAtoms === null || decimal(i.receivedAtoms)) &&
          decimal(i.amountAtoms) &&
          decimal(i.amountMinor) &&
          Array.isArray(i.lines) &&
          i.lines.every((x) => object(x) && decimal(x.unitAtoms) && decimal(x.unitMinor)),
      )
    )
      return { ok: false, error: 'Invalid invoice amounts or schema' };
    if (
      !(l.items as unknown[]).every((i) => object(i) && decimal(i.priceMinor)) ||
      !(l.requests as unknown[]).every((i) => object(i) && decimal(i.amountMinor))
    )
      return { ok: false, error: 'Invalid catalog or request amounts' };
    if (
      (l.refunds !== undefined &&
        (!Array.isArray(l.refunds) ||
          !l.refunds.every(
            (r) => object(r) && typeof r.invoiceId === 'string' && decimal(r.atoms),
          ))) ||
      !Object.values(l.books).every(
        (b) =>
          object(b) &&
          Number.isSafeInteger(b.next) &&
          Number(b.next) >= 0 &&
          ['reserved', 'used'].every(
            (k) =>
              Array.isArray(b[k]) &&
              (b[k] as unknown[]).every((v) => Number.isSafeInteger(v) && Number(v) >= 0),
          ),
      )
    )
      return { ok: false, error: 'Invalid refunds or derivation indexes' };
    sales = (l.invoices as unknown[]).length;
  }
  return {
    ok: true,
    summary: `Validated encryption, checksum, schema and staff hash chain. ${s.accounts.length} counters, ${sales} sales, ${s.shifts.events.length} staff events. ${s.ledger === null || s.ledger === undefined ? 'No books in this older file. ' : ''}${s.recoveryWrites || s.recoverySale ? 'Contains informational recovery notes. ' : ''}Nothing on this device was changed. This proves internal consistency, not that recorded events happened.`,
  };
}
