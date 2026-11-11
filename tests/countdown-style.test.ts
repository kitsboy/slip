import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A class name is not a design.
 *
 * `Countdown` shipped with `className="v2-count"` and no rule for `.v2-count` anywhere in the
 * stylesheet, so the receipt read "01:15until this QR expires" — two inline spans butted together. It
 * was found by looking at the gallery, not by a test, which is the point of this file: a component's
 * own class must exist in the stylesheet, and the one that carries two pieces of text must space them.
 */
const css = readFileSync('src/index.css', 'utf8');

describe('the countdown is styled', () => {
  it('has a rule of its own', () => {
    expect(css).toMatch(/\.v2-count\s*\{/);
  });

  it('separates the clock from the words', () => {
    const rule = css.slice(css.indexOf('.v2-count {'));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).toMatch(/display:\s*flex/);
    expect(block).toMatch(/gap:\s*\d+px/);
  });

  it('keeps the expired line readable and separate', () => {
    expect(css).toMatch(/\.v2-count-dead\s*\{[^}]*display:\s*block/);
  });
});
