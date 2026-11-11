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
 * 18 call sites went in this pass (EmptyState, Verify, Readiness, DemoBanner, AddressText, TabIcon,
 * FreshnessRing, Requests, History, OpenTill). The 51 left are concentrated in `Till.tsx` (41) and
 * `App.tsx` (4), where the dead halves are whole screen layouts mixed into live JSX — the exact shape
 * that broke a scripted rewrite before. This test holds the line: the number may go down, never up,
 * and it may never spread to a new file.
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
    // 51 when this test was written; 18 were deleted in the same pass. Lowering this number is the
    // work; raising it means someone added a branch that can never be chosen.
    expect(total).toBeLessThanOrEqual(51);
  });

  it('come from a function that always says yes', () => {
    const skin = readFileSync('src/ui/skin.ts', 'utf8');
    expect(skin).toMatch(/export function isSkinV2\(\): boolean \{\s*return true;/);
  });
});
