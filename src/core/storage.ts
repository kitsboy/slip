/**
 * One drawer for real data, a separate one for the demo.
 *
 * A demo that shares storage with a real shop is a demo that can overwrite somebody's books. So
 * the demo does not "carefully avoid" the real keys — it physically cannot reach them: every key it
 * writes is prefixed `slip.demo.`, and every key it reads comes from the same prefix.
 *
 * The switch is the URL, read once at boot: `?demo=1`. Nothing else in the app knows or cares,
 * Every panel asks `store()` instead of touching localStorage directly.
 */
import { clearWriteFailed, setWriteFailed } from './save-state';

const DEMO_PREFIX = 'slip.demo.';
const DEMO_KEYS = 'slip.demo.';

function isDemoMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}

export const isDemo = isDemoMode();

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage.setItem throws on a full disk / private mode / quota, and nothing in slip
 * wants that to look like "the sale did not go through". Guard every write: record the
 * failure so the shell can show a cannot-be-missed banner, then re-throw so the caller's
 * own error path still runs (and never shows a "recorded" state when nothing was stored).
 */
export function guardedSetItem(underlying: KeyValueStore, key: string, value: string): void {
  try {
    underlying.setItem(key, value);
    clearWriteFailed();
  } catch (err) {
    setWriteFailed();
    throw err;
  }
}

function prefixed(): KeyValueStore {
  const real = window.localStorage;
  const rawGet = (key: string) => real.getItem(DEMO_PREFIX + key);
  const rawSet = (key: string, value: string) => real.setItem(DEMO_PREFIX + key, value);
  const rawDel = (key: string) => real.removeItem(DEMO_PREFIX + key);
  return {
    getItem: rawGet,
    setItem: (key, value) => {
      // Capture the raw write in a closure so the guard never recurses into itself:
      guardedSetItem({ getItem: rawGet, setItem: rawSet, removeItem: rawDel }, key, value);
    },
    removeItem: rawDel,
  };
}

const plain: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => {
    const rawGet = (k: string) => window.localStorage.getItem(k);
    const rawSet = (k: string, v: string) => window.localStorage.setItem(k, v);
    const rawDel = (k: string) => window.localStorage.removeItem(k);
    guardedSetItem({ getItem: rawGet, setItem: rawSet, removeItem: rawDel }, key, value);
  },
  removeItem: (key) => window.localStorage.removeItem(key),
};

/** Where this page should keep its data. Demo pages never see the real drawer. */
export function store(): KeyValueStore {
  return isDemo ? prefixed() : plain;
}

/** True when demo data has been written before in this browser. */
export function demoExists(): boolean {
  try {
    return window.localStorage.getItem(DEMO_KEYS + 'seeded') === '1';
  } catch {
    return false;
  }
}

/** Wipe the demo drawer only. The real shop is never touched. */
export function clearDemo(): void {
  const real = window.localStorage;
  const doomed: string[] = [];
  for (let i = 0; i < real.length; i += 1) {
    const key = real.key(i);
    if (key && key.startsWith(DEMO_KEYS)) doomed.push(key);
  }
  for (const key of doomed) real.removeItem(key);
}
