import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEDI_CARD_ENABLED, FEDI_RAILS } from '../src/core/fedi';

/**
 * Fedimint stays off.
 *
 * The card is built to the edge on purpose — the words are written, the rails are described — and it
 * is switched off with one constant. This test is the thing that keeps "off" true: if a later pass
 * flips the constant by accident, a counting test fails before a merchant ever sees an ecash screen on
 * a page that cannot hold ecash honestly.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe('Fedimint is built, and switched off', () => {
  it('the switch is false', () => {
    expect(FEDI_CARD_ENABLED).toBe(false);
  });

  it('the rails are still written down, so the work is not lost', () => {
    expect(FEDI_RAILS.length).toBeGreaterThan(0);
  });

  it('every place that renders the card is behind the switch', () => {
    const hits = walk('src')
      .filter((file) => !file.endsWith('FediCard.tsx') && !file.endsWith('core/fedi.ts'))
      .filter((file) => readFileSync(file, 'utf-8').includes('<FediCard'));
    expect(hits.length).toBeGreaterThan(0);
    for (const file of hits) {
      const source = readFileSync(file, 'utf-8');
      expect(source).toMatch(/FEDI_CARD_ENABLED\s*\?\s*<FediCard/);
    }
  });

  it('the manual says it is switched off, in words', () => {
    const cannot = readFileSync('src/ui/Cannot.tsx', 'utf-8');
    expect(cannot).toMatch(/Fedimint card is built but switched off/i);
  });
});
