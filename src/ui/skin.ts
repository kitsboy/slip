/** True only while the page was opened with `?skin=v2`. Never stored. */
export function isSkinV2(): boolean {
  return document.documentElement.dataset.skin === 'v2';
}
