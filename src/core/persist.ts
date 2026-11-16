/** Browser persistence is checked live each boot; a cached grant is never authority. */
const PERSIST_KEY = 'slip.persistGrant.v1';
export type PersistAnswer = 'kept' | 'not-guaranteed' | 'unknown';
export interface PersistState {
  answer: PersistAnswer;
  promisedAt: string | null;
}
interface SnapshotStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const current = new WeakMap<SnapshotStore, PersistState>();
const inFlight = new WeakMap<SnapshotStore, Promise<PersistState>>();
const asked = new WeakSet<SnapshotStore>();
export function storageApiPresent(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.persist === 'function' &&
    typeof navigator.storage.persisted === 'function'
  );
}
function readExisting(store: SnapshotStore): PersistState | null {
  try {
    const parsed = JSON.parse(store.getItem(PERSIST_KEY) ?? 'null') as PersistState | null;
    if (!parsed || !['kept', 'not-guaranteed', 'unknown'].includes(parsed.answer)) return null;
    return {
      answer: parsed.answer,
      promisedAt: typeof parsed.promisedAt === 'string' ? parsed.promisedAt : null,
    };
  } catch {
    return null;
  }
}
/** Before the live check finishes, an old cached grant only means "previously asked". */
export function persistState(store: SnapshotStore): PersistState | null {
  const live = current.get(store);
  if (live) return live;
  const old = readExisting(store);
  return old ? { ...old, answer: 'unknown' } : null;
}
async function check(store: SnapshotStore, request: boolean): Promise<PersistState> {
  let answer: PersistAnswer = 'unknown';
  let promisedAt = readExisting(store)?.promisedAt ?? null;
  if (storageApiPresent()) {
    try {
      const alreadyKept = await navigator.storage.persisted();
      if (request && !alreadyKept) {
        asked.add(store);
        promisedAt = new Date().toISOString();
        // A rejection must not hide a live persisted() answer that is still available.
        try {
          await navigator.storage.persist();
        } catch {
          /* verify below */
        }
        answer = (await navigator.storage.persisted()) ? 'kept' : 'not-guaranteed';
      } else answer = alreadyKept ? 'kept' : 'not-guaranteed';
    } catch {
      answer = 'unknown';
    }
  }
  const state = { answer, promisedAt };
  current.set(store, state);
  try {
    store.setItem(PERSIST_KEY, JSON.stringify(state));
  } catch {
    /* bookkeeping only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('slip:data-changed'));
  return state;
}
function run(store: SnapshotStore, request: boolean): Promise<PersistState> {
  const running = inFlight.get(store);
  if (running) return running;
  const task = check(store, request).finally(() => inFlight.delete(store));
  inFlight.set(store, task);
  return task;
}
/** Always refresh the browser's status; automatically ask only if never asked before. */
export function ensurePersistentStorage(store: SnapshotStore): Promise<PersistState> {
  return run(store, !asked.has(store) && !readExisting(store)?.promisedAt);
}
/** Settings' "Ask again" deliberately retries the actual permission request. */
export function recheckPersistence(store: SnapshotStore): Promise<PersistState> {
  return run(store, true);
}
