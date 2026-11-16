/** Unresolved writes, not merely the result of the latest unrelated write. */
type Listener = (failed: boolean) => void;
const failures = new Set<string>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(isWriteFailed());
}

export function isWriteFailed(): boolean {
  return failures.size > 0;
}

export function subscribeWriteState(listener: Listener): () => void {
  listeners.add(listener);
  listener(isWriteFailed());
  return () => {
    listeners.delete(listener);
  };
}

/** Storage supplies a drawer-specific identity for each key. */
export function setWriteFailed(key = 'legacy'): void {
  failures.add(key);
  emit();
}

/** Only a successful write of THIS key resolves its failure. */
export function clearWriteFailed(key = 'legacy'): void {
  if (failures.delete(key)) emit();
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014;
}
