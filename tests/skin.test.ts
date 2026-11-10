import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * One skin, and no way back through a URL.
 *
 * `?skin=v1` was the escape hatch for a bad publish. It is gone: a query string must never change
 * what a shopkeeper sees, and the old interface comes back only by deploying the tagged build. This
 * test reads `src/main.tsx` because that is where the skin is decided, and asserts the decision does
 * not depend on the address bar any more.
 */
const MAIN = readFileSync('src/main.tsx', 'utf-8');

describe('the skin is not a query string', () => {
  it('sets the skin to v2 without reading a parameter', () => {
    expect(MAIN).toContain("document.documentElement.dataset.skin = 'v2'");
    expect(MAIN).not.toMatch(/params\.get\('skin'\)/);
    expect(MAIN).not.toMatch(/searchParams\.get\('skin'\)/);
  });

  it('has no v1 branch left in the entry point', () => {
    expect(MAIN).not.toContain("=== 'v1'");
  });
});
