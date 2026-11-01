#!/usr/bin/env node
/**
 * Ask every public explorer slip ships as a default whether it is actually answering.
 *
 * Deliberately NOT part of CI: it needs the open internet, and a third party being down is not
 * "the build is broken". Run it when a default changes, or when a merchant reports a dead rail.
 *
 * The defaults are read straight out of `src/core/providers/esplora.ts` so this can never drift
 * into a second, stale copy of the truth.
 *
 * Usage: node scripts/check-explorers.mjs
 */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/core/providers/esplora.ts', import.meta.url), 'utf8');
const block = source.match(/PUBLIC_ESPLORA[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error('could not find PUBLIC_ESPLORA in src/core/providers/esplora.ts');
  process.exit(2);
}

const entries = [...block[1].matchAll(/'([a-z0-9-]+)':\s*(?:'([^']+)'|(null))/g)].map((m) => [m[1], m[2] ?? null]);
if (entries.length === 0) {
  console.error('PUBLIC_ESPLORA parsed empty');
  process.exit(2);
}

const rows = [];
for (const [network, baseUrl] of entries) {
  if (!baseUrl) {
    rows.push([network, '(none)', 'no public default']);
    continue;
  }
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/blocks/tip/height`, { signal: AbortSignal.timeout(12_000) });
    const body = (await res.text()).trim();
    const ok = res.ok && /^\d+$/.test(body);
    rows.push([
      network,
      baseUrl,
      ok ? `ok · height ${body} · ${Date.now() - started}ms` : `HTTP ${res.status} ${body.slice(0, 60)}`,
    ]);
  } catch (e) {
    rows.push([network, baseUrl, `unreachable · ${e instanceof Error ? e.message : String(e)}`]);
  }
}

const width = Math.max(...rows.map((r) => r[0].length));
for (const [network, baseUrl, verdict] of rows) {
  console.log(`${network.padEnd(width)}  ${verdict}\n${' '.repeat(width)}  ${baseUrl}`);
}

const bad = rows.filter((r) => !r[2].startsWith('ok'));
console.log(bad.length === 0 ? '\nall public explorers answered' : `\n${bad.length} did not answer`);
process.exit(bad.length === 0 ? 0 : 1);
