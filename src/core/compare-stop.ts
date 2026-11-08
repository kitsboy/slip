/**
 * A wallet compare that failed. The stop is a fact on this device, not a dialog
 * you can close. Only a later "They match" clears it. A sale must read this
 * before it charges.
 */
const KEY = 'slip.compare-stop';

export function isCompareStopped(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setCompareStopped(stopped: boolean): void {
  try {
    if (stopped) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the in-memory event still blocks this tab */
  }
  window.dispatchEvent(new Event('slip:compare-stop'));
}
