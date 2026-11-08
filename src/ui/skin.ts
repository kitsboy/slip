/** True when the new look is on. That is the normal page. `?skin=v1` turns it off. Never stored. */
export function isSkinV2(): boolean {
  return document.documentElement.dataset.skin === 'v2';
}
