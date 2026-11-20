import { useEffect, useState } from 'react';
import { createRepository, statusOf } from '../core/accounts';
import { lastBackupAt } from '../core/backup';
import { persistState } from '../core/persist';
import { isWriteFailed, subscribeWriteState } from '../core/save-state';
import { rememberedRate } from '../core/selling-guidance';
import { store as appStore } from '../core/storage';
interface Row { label: string; state: 'Set' | 'Blocker' | 'Warning' | 'Unknown'; detail: string; href: string; action: string }
function read(): Row[] {
  const store = appStore();
  const env = createRepository(store).load();
  const active = env.accounts.find(a => a.id === env.activeAccountId);
  const wallet = active ?? env.accounts.find(a => statusOf(a) === 'ready');
  const rate = rememberedRate(store.getItem('rate:last'));
  const backup = lastBackupAt(store);
  const persistence = persistState(store)?.answer ?? 'unknown';
  return [
    { label:'Receiving wallet', state:wallet && statusOf(wallet) === 'ready' ? 'Set' : 'Blocker', detail:wallet ? `${wallet.label} (${wallet.coin.toUpperCase()}) — ${statusOf(wallet) === 'ready' ? 'address acknowledged by you, not funding verified' : 'compare its address with your wallet'}` : 'No acknowledged receiving wallet', href:'#wallets', action:'Check wallets' },
    { label:'Saved rate', state:rate ? 'Warning' : 'Unknown', detail:rate ? `${rate.value} — last used ${rate.at ?? 'at an unknown time'}. Not a live quote; check the till’s coin and currency.` : 'No valid saved rate. Enter or fetch the current coin’s rate on the till.', href:'#till', action:'Review rate' },
    { label:'Connectivity', state:'Unknown', detail:navigator.onLine ? 'Browser reports online; explorer, rate and Lightning providers are not verified.' : 'Browser reports offline. Provider checks may be unavailable.', href:'#settings', action:'Review providers' },
    { label:'Device storage', state:isWriteFailed() ? 'Blocker' : persistence === 'kept' ? 'Set' : 'Warning', detail:isWriteFailed() ? 'Unresolved save failure. Retry saving or export recovery before another sale.' : `Persistence: ${persistence}. This is not a backup or a guarantee against clearing device data.`, href:isWriteFailed() ? '#backup' : '#settings', action:isWriteFailed() ? 'Recover records' : 'Review storage' },
    { label:'Backup', state:backup ? 'Warning' : 'Unknown', detail:backup ? `Download last requested ${backup}. File delivery and off-device storage are unverified; test the file.` : 'No backup download recorded. Save and test an encrypted file somewhere else.', href:'#backup', action:'Save or test backup' },
  ];
}
export default function Readiness() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const refresh = () => setRows(read()); refresh();
    const events = ['slip:data-changed','storage','online','offline','focus'];
    events.forEach(e => window.addEventListener(e, refresh));
    const unsubscribe = subscribeWriteState(refresh);
    return () => { events.forEach(e => window.removeEventListener(e, refresh)); unsubscribe(); };
  }, []);
  const blockers = rows.filter(r => r.state === 'Blocker').length;
  return <section className="panel" data-readiness data-ready={`${rows.filter(r => r.state === 'Set').length}/${rows.length}`}>
    <h2 className="panel-title">Ready to sell — device checks</h2>
    <p role="status">{blockers ? `${blockers} setup blocker(s)` : 'No setup blocker detected'} · warnings and unknowns still need review.</p>
    <p>This does not certify funding, provider availability or payment readiness. Verify each sale in your own wallet; no cross-device sync.</p>
    <ul className="mt-3 grid gap-3">{rows.map(row => <li key={row.label}>
      <strong>{row.label} — {row.state}</strong><p>{row.detail}</p><a className="underline" href={row.href}>{row.action}</a>
    </li>)}</ul>
  </section>;
}
