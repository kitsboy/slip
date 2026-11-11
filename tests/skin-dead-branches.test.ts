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
 * 20 call sites have gone: 18 in the first pass (EmptyState, Verify, Readiness, DemoBanner, AddressText,
 * TabIcon, FreshnessRing, Requests, History, OpenTill) and 2 more from the old header block in App.tsx.
 * The 49 left are concentrated in `Till.tsx` (41) and two fragile ternaries in `App.tsx`, where the
 * dead halves are whole screen layouts interleaved with live JSX — the exact shape that broke a
 * scripted rewrite. This test holds the line: the number may go down, never up, and never to a new
 * file.
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
    expect(offenders).toEqual([
      'src/App.tsx',
      'src/main.tsx',
      'src/ui/AnchorPanel.tsx',
      'src/ui/AwaitingStrip.tsx',
      'src/ui/Cannot.tsx',
      'src/ui/Till.tsx',
    ]);
  });

  it('do not grow', () => {
    const total = sources('src')
      .filter((f) => !f.endsWith('skin.ts'))
      .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/isSkinV2\(\)/g) ?? []).length, 0);
    // 49 after the header went: 18 in the first pass, 2 more when the old header block was deleted by
    // hand. Lowering this number is the work; raising it means someone added a branch that can never
    // be chosen.
    expect(total).toBeLessThanOrEqual(49);
  });

  it('come from a function that always says yes', () => {
    const skin = readFileSync('src/ui/skin.ts', 'utf8');
    expect(skin).toMatch(/export function isSkinV2\(\): boolean \{\s*return true;/);
  });
});
