#!/usr/bin/env node
/**
 * Can a phone actually put slip on its home screen?
 *
 * A merchant reported that the browser only offered a *shortcut*, never "Install", and that the shortcut
 * wore the browser's own icon. The cause was the launcher contract, not the app: one icon, 300x220, all
 * wrong sizes, and no apple-touch-icon for iOS. This suite asks the browser itself rather than guessing —
 * Chromium exposes its installability verdict over DevTools, which is the same check the install prompt
 * uses.
 *
 * Usage: node tests/e2e/installable.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

// A throwaway *persistent* profile, not an incognito context: Chromium refuses to judge installability
// in incognito ("in-incognito"), so a normal profile is the only honest way to ask.
const profile = mkdtempSync(join(tmpdir(), 'slip-install-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromePath(),
  args: ['--no-sandbox'],
  viewport: { width: 430, height: 1000 },
});
const page = context.pages()[0] ?? (await context.newPage());
const cdp = await context.newCDPSession(page);
await cdp.send('Page.enable');

await page.goto(`${BASE}?cb=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// ── 1. The manifest the browser read ───────────────────────────────────────────────────────────────
const manifest = await cdp.send('Page.getAppManifest');
check('the browser found a manifest', Boolean(manifest.url), manifest.url ?? 'none');
check('the manifest parsed without complaint', (manifest.errors ?? []).length === 0, JSON.stringify(manifest.errors ?? []));

// Read the same file the browser read, so the icon list is checked as served rather than as parsed.
const served = JSON.parse(await (await page.request.get(new URL(manifest.url ?? 'manifest.webmanifest', BASE).toString())).text());
check('it arrives as manifest JSON, not as a text file', (served.icons ?? []).length >= 2, `${(served.icons ?? []).length} icons`);

// ── 2. Chromium's own verdict ──────────────────────────────────────────────────────────────────────
await page.waitForTimeout(500);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
check(
  'Chromium says slip is installable',
  installabilityErrors.length === 0,
  installabilityErrors.map((e) => `${e.errorId}: ${e.errorArguments?.map((a) => a.value ?? a).join(' ')}`).join(' | '),
);

// ── 3. Every icon a launcher would fetch answers ──────────────────────────────────────────────────
const icons = served.icons ?? [];
for (const icon of icons) {
  const url = new URL(icon.src, BASE).toString();
  const res = await page.request.get(url);
  check(`${icon.sizes} ${icon.purpose ?? 'any'} icon is served`, res.status() === 200 && /image\/png/.test(res.headers()['content-type'] ?? ''), `${res.status()} ${res.headers()['content-type']}`);
  const square = icon.sizes?.split('x') ?? [];
  check(`${icon.sizes} is square, as a launcher requires`, square.length === 2 && square[0] === square[1], icon.sizes);
}

// ── 4. iOS, which ignores all of the above ────────────────────────────────────────────────────────
const touch = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? '');
check('iOS is given an apple-touch-icon of its own', Boolean(touch), 'no <link rel="apple-touch-icon">');
if (touch) {
  const res = await page.request.get(new URL(touch, BASE).toString());
  check('the apple-touch-icon is served', res.status() === 200 && /image\/png/.test(res.headers()['content-type'] ?? ''), String(res.status()));
}

// ── 5. The worker that lets it open with no network ───────────────────────────────────────────────
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? 'registered' : 'none';
});
check('a service worker is registered, so slip opens offline', sw === 'registered', sw);

await context.close();
rmSync(profile, { recursive: true, force: true });
console.log(failures === 0 ? '\nInstallability checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
