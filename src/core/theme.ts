/**
 * Theme choice: dark, light or high-contrast.
 *
 * The tokens already existed in CSS; what was missing was a way to choose and remember
 * one. The rule that matters: a first-time visitor gets their operating system's
 * preference, and an explicit choice always beats it afterwards.
 */

export type Theme = 'dark' | 'light' | 'contrast';

export const THEMES: readonly Theme[] = ['dark', 'light', 'contrast'];
export const THEME_KEY = 'slip.theme.v1';

const LABELS: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  contrast: 'High contrast',
};

export function themeLabel(theme: Theme): string {
  return LABELS[theme];
}

/** The operating system's preference, defaulting to dark (a till at night). */
export function systemTheme(prefersLight: boolean | null): Theme {
  return prefersLight ? 'light' : 'dark';
}

export interface ThemeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadTheme(store: ThemeStore): Theme | null {
  const raw = store.getItem(THEME_KEY);
  return raw && (THEMES as readonly string[]).includes(raw) ? (raw as Theme) : null;
}

export function saveTheme(store: ThemeStore, theme: Theme): void {
  store.setItem(THEME_KEY, theme);
}

/** Applies the theme to an element (documentElement in the browser, a stub in tests). */
export function applyTheme(theme: Theme, root: { setAttribute(name: string, value: string): void }): void {
  root.setAttribute('data-theme', theme);
}

/** Next theme in the cycle — one control instead of a menu. */
export function nextTheme(theme: Theme): Theme {
  const i = THEMES.indexOf(theme);
  return THEMES[(i + 1) % THEMES.length] ?? 'dark';
}
