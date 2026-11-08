/**
 * A digit types an amount. It never changes the tab.
 * Letter shortcuts stay letter shortcuts, and they stay silent while a field is focused.
 */
export function shortcutAllowed(key: string, typing: boolean): boolean {
  if (typing) return false;
  if (/^[0-9]$/.test(key)) return false;
  return key === '/' || key === 'n' || key === 'p';
}

/** The amount pad's only maths: a string in, a string out. No money conversion. */
export function applyPadKey(value: string, key: string): string {
  if (key === '⌫' || key === 'Backspace') return value.slice(0, -1);
  if (key === '.' && value.includes('.')) return value;
  if (!/^[0-9.]$/.test(key)) return value;
  if (value.length >= 9) return value;
  return value === '0' && key !== '.' ? key : value + key;
}
