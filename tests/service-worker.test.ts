/**
 * The offline shell must never pin a till to an old build.
 *
 * This is the bug that shipped once already: a constant cache name meant `sw.js` never
 * changed between releases, a worker only reinstalls when its own bytes change, and a device
 * that installed slip early served its first-cached `index.html` forever. The header read
 * v0.8 while v0.25 was live, and nothing on the device would ever fix it.
 *
 * These are source-policy assertions, because the real behaviour needs a browser: the file is
 * plain JS served from `public/`, so nothing else in the suite would ever look at it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker', () => {
  it('names its cache for the build, so every release installs a new worker', () => {
    const cacheLine = /const CACHE = '([^']+)';/.exec(source)?.[1];
    expect(cacheLine).toBe('slip-__BUILD__');

    // The value only becomes real if the build actually substitutes it — and substitutes
    // every occurrence, not just the first.
    const vite = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(vite).toMatch(/replaceAll\(\s*'__BUILD__'/);
  });

  it('asks the network first when navigating to the app', () => {
    const navigate = source.indexOf("req.mode === 'navigate'");
    expect(navigate).toBeGreaterThan(-1);

    const branch = source.slice(navigate, navigate + 500);
    // fetch must be tried before any cached copy is considered
    expect(branch.indexOf('fetch(req)')).toBeLessThan(branch.indexOf('caches.match'));
    expect(branch).toContain('caches.match(\'./index.html\')');
  });

  it('takes over on install without reloading a live page', () => {
    expect(source).toContain('self.skipWaiting()');
    expect(source).toContain('self.clients.claim()');
    // The worker must never reload the page underneath a merchant mid-sale.
    expect(source).not.toContain('location.reload');
  });

  it('drops caches that are not this build', () => {
    expect(source).toMatch(/keys\.filter\(\(k\) => k !== CACHE\)/);
  });

  it('never caches a response that failed', () => {
    expect(source).toContain('if (!response || !response.ok) return response;');
  });
});
