import { describe, expect, it } from 'vitest';
import {
  THEMES,
  THEME_KEY,
  applyTheme,
  loadTheme,
  nextTheme,
  saveTheme,
  systemTheme,
  themeLabel,
  type Theme,
} from '../src/core/theme';

function store() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
  };
}

describe('theme', () => {
  it('offers exactly three themes with labels', () => {
    expect(THEMES).toEqual(['dark', 'light', 'contrast']);
    for (const t of THEMES) expect(themeLabel(t).length).toBeGreaterThan(2);
  });

  it('follows the OS preference on a first visit, defaulting to dark', () => {
    expect(systemTheme(true)).toBe('light');
    expect(systemTheme(false)).toBe('dark');
    expect(systemTheme(null)).toBe('dark');
  });

  it('cycles dark → light → contrast → dark', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('contrast');
    expect(nextTheme('contrast')).toBe('dark');
  });

  it('remembers an explicit choice and ignores rubbish', () => {
    const s = store();
    expect(loadTheme(s)).toBeNull();
    saveTheme(s, 'contrast');
    expect(loadTheme(s)).toBe('contrast');
    s.setItem(THEME_KEY, 'neon');
    expect(loadTheme(s)).toBeNull();
  });

  it('applies the theme as a data attribute, which is what the CSS reads', () => {
    const root = fakeRoot();
    for (const t of ['light', 'contrast', 'dark'] as Theme[]) {
      applyTheme(t, root);
      expect(root.attrs['data-theme']).toBe(t);
    }
  });

  it('writes a preference that survives a reload', () => {
    const s = store();
    saveTheme(s, 'light');
    const reloaded = loadTheme(s);
    expect(reloaded).toBe('light');
    const root = fakeRoot();
    applyTheme(reloaded!, root);
    expect(root.attrs['data-theme']).toBe('light');
  });
});
