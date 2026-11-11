import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The old look is gone; the branches that used to choose it are not, in two files.
 *
 * `isSkinV2()` now returns a constant, so every `else` under it is code that cannot run. The minifier
 * drops that markup from the bundle, which means the leftovers cost nothing at runtime — but they cost
 * readers, and a branch that can never run is a small lie about the product.
 *
 * 67 have gone, in three passes: the easy guards and class strings, then the till (41 sites), then the
 * header block. Two are left, both in `App.tsx`, where the dead half is a whole screen braided into
 * live JSX. This test holds the line: the number may go down, never up, and never to a new file.
 */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.tsx') || e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

describe('the dead skin branches', () => {
  it('live in exactly these files, and no new ones', () => {
    const offenders = sources('src')
      .filter((f) => !f.endsWith('skin.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('isSkinV2()'))
      .map((f) => f.replace(/\\/g, '/'))
      .sort();
    expect(offenders).toEqual(['src/App.tsx']);
  });

  it('do not grow', () => {
    const total = sources('src')
      .filter((f) => !f.endsWith('skin.ts'))
      .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/isSkinV2\(\)/g) ?? []).length, 0);
    // 2: the hero and the footer ternaries in App.tsx, the only two where the dead half is a whole
    // screen braided into live JSX. Two screens are the whole list now — 69 a week ago.
    expect(total).toBeLessThanOrEqual(2);
  });

  it('come from a function that always says yes', () => {
    const skin = readFileSync('src/ui/skin.ts', 'utf8');
    expect(skin).toMatch(/export function isSkinV2\(\): boolean \{\s*return true;/);
  });
});
