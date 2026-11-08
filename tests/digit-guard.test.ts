import { describe, expect, it } from 'vitest';
import { applyPadKey, shortcutAllowed } from '../src/core/digit-guard';

describe('digit keys', () => {
  it('never treats a digit as a tab shortcut, even with no field focused', () => {
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(shortcutAllowed(key, false)).toBe(false);
      expect(shortcutAllowed(key, true)).toBe(false);
    }
  });

  it('keeps the letter shortcuts, and only when nobody is typing', () => {
    expect(shortcutAllowed('/', false)).toBe(true);
    expect(shortcutAllowed('n', false)).toBe(true);
    expect(shortcutAllowed('/', true)).toBe(false);
  });

  it('types an amount instead of switching anywhere', () => {
    expect(applyPadKey('', '4')).toBe('4');
    expect(applyPadKey('4', '0')).toBe('40');
    expect(applyPadKey('4.0', '.')).toBe('4.0');
    expect(applyPadKey('40', 'Backspace')).toBe('4');
    expect(applyPadKey('1', 'n')).toBe('1');
  });
});
