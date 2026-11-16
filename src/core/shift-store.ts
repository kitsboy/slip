/** Durable shift-write witness. localStorage remains the synchronous read/backup mirror.
 * Every browser mutation (append, retry, restore, wipe) must use this protocol.
 * A prepared witness is committed BEFORE touching the mirror. Ambiguous interrupted
 * writes fail closed: never infer from a stale renderer cache that a write did not happen.
 */
export const SHIFT_KEY = 'slip.shifts.v1';
type Witness = { phase: 'prepared' | 'committed'; base: string | null; value: string | null };
const unavailable = () => new Error('Safe shift-log storage is unavailable. Keep this tab open and export a backup.');
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(unavailable()); return; }
    const request = indexedDB.open('slip-shift-coordination-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drawers');
    request.onerror = () => reject(request.error ?? unavailable());
    request.onblocked = () => reject(unavailable());
    request.onsuccess = () => resolve(request.result);
  });
}
function access(db: IDBDatabase, key: string, next?: Witness): Promise<Witness | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drawers', next ? 'readwrite' : 'readonly', next ? { durability: 'strict' } : undefined);
    const request = next ? transaction.objectStore('drawers').put(next, key) : transaction.objectStore('drawers').get(key);
    transaction.oncomplete = () => resolve(next ?? request.result as Witness | undefined);
    transaction.onabort = () => reject(transaction.error ?? unavailable());
    transaction.onerror = () => { /* onabort owns rejection */ };
  });
}
export async function coordinateShift(
  demo: boolean,
  mirror: { getItem(key: string): string | null },
  change: (base: string | null) => Promise<string | null>,
  persist: (value: string | null) => void,
  retryValue?: string,
  replace = false,
): Promise<void> {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request || !globalThis.indexedDB) throw unavailable();
  const key = `${demo ? 'slip.demo.' : ''}${SHIFT_KEY}`;
  await locks.request(key, { mode: 'exclusive' }, async () => {
    const db = await open();
    try {
      const witness = await access(db, key);
      const visible = mirror.getItem(SHIFT_KEY);
      if (witness?.phase === 'prepared' && retryValue !== witness.value && !replace) {
        throw new Error('An interrupted shift-log save needs its original tab to retry or an encrypted backup. No records were overwritten.');
      }
      // Once initialized, the durable witness is authoritative, never a cached mirror.
      const base = witness ? (witness.phase === 'committed' ? witness.value : witness.base) : visible;
      const value = await change(base);
      await access(db, key, { phase: 'prepared', base, value });
      persist(value); // Guarded localStorage failures still reject and retain recovery data.
      await access(db, key, { phase: 'committed', base, value });
    } finally {
      db.close();
    }
  });
}
