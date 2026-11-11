import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A class name is not a design, and this is the check that says so.
 *
 * `Countdown` shipped `className="v2-count"` with no rule behind it, so a receipt read
 * "01:15until this QR expires" — it type-checked, rendered, and passed every suite. This test walks
 * every `v2-*` class that a component writes in a `className` and requires a rule for it in
 * `src/index.css`. Classes that are deliberately hooks (read by tests or by JS, never styled) go in
 * the list below with a reason, so "no rule" is always a decision someone made on purpose.
 */
const HOOKS: Record<string, string> = {
  // Written by the till and read by the browser suites to find a part; the look comes from its parent.
  'v2-jump': 'a transient class the till adds for 280ms to scroll a tile into view',
};

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? componentFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  );
}

function classesUsed(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of componentFiles('src')) {
    const src = readFileSync(file, 'utf8');
    // Static strings and template literals only: a computed name cannot be checked, and guessing at one
    // would make this test lie.
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const token of (m[1] ?? m[2] ?? '').matchAll(/\bv2-[a-z0-9-]+/g)) {
        const list = found.get(token[0]) ?? [];
        if (!list.includes(file)) list.push(file);
        found.set(token[0], list);
      }
    }
  }
  return found;
}

describe('every v2- class a component writes has a rule', () => {
  it('has no unstyled class outside the named hooks', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const missing = [...classesUsed().entries()]
      .filter(([name]) => !HOOKS[name] && !css.includes(`.${name}`))
      .map(([name, files]) => `${name} (${files.join(', ')})`)
      .sort();
    expect(missing).toEqual([]);
  });

  it('names every hook with a reason', () => {
    for (const [name, reason] of Object.entries(HOOKS)) {
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });
});
