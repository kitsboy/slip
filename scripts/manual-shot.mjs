#!/usr/bin/env node
/**
 * Capture the manual's screenshots from the real app.
 *
 * Boots the built single file against a seeded shop, then photographs each documented panel at 2x
 * into screenshots/manual/<id>.png. A panel listed in the manual that is not on the page is
 * reported rather than silently skipped — that is exactly the drift this pipeline exists to catch.
 *
 * Usage: npm run manual   (expects `npm run build` to have run, or builds first via npm run manual)
 */

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* global localStorage */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4199;
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run npm run build first');
  process.exit(1);
}

const ids = [...readFileSync(join(ROOT, 'src/manual/entries.ts'), 'utf8').matchAll(/^\s*id: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
mkdirSync(join(ROOT, 'screenshots/manual'), { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file = join(DIST, url === '/' ? 'index.html' : url);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = chromePath();
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 }, deviceScaleFactor: 2 });

const today = new Date().toISOString().slice(0, 10);
// Runs inside the page, where localStorage exists; the lint config has no browser globals here.
await context.addInitScript(
  ([zpub, day]) => {
    const stamp = new Date().toISOString();
    const wallet = (id, label, colour) => ({
      id, label, xpub: zpub, coin: 'btc', networkId: 'btc-mainnet', scriptType: 'p2wpkh', source: 'xpub',
      colour, purpose: 'till', note: '', fingerprintHex: '7ef32bdb', prefix: 'zpub',
      firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', acknowledgedAt: stamp,
      createdAt: stamp, staffName: null, nextIndex: 1,
    });
    const inv = (id, over) => ({
      id, walletId: 'w1', walletLabel: 'Front counter',
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', index: 0, amountAtoms: '10000',
      amountMinor: '600', currency: 'USD', rateMinorPerCoin: '6000000', rateAt: day + 'T09:00:00.000Z',
      lines: [], createdAt: day + 'T09:00:00.000Z', expiresAt: day + 'T09:15:00.000Z', status: 'complete',
      seenAt: day + 'T09:01:00.000Z', confirmedAt: day + 'T09:01:00.000Z', manual: false, note: '', ...over,
    });
    localStorage.setItem('slip.accounts.v1', JSON.stringify({ version: 1, accounts: [wallet('w1', 'Front counter', 'blue'), wallet('w2', 'Back bar', 'teal')], activeAccountId: 'w1', pinHash: null, savedAt: stamp }));
    localStorage.setItem('slip.settings.v1', JSON.stringify({
      businessName: 'Café Nord', currency: 'USD', taxBps: 0, taxInclusive: false,
      tipPresetsBps: [0, 1000], receiptFooter: 'Thank you', explorerUrl: '', rateEndpoint: '',
      autoRate: false, staff: [{ name: 'Ana', walletId: 'w2' }], language: 'en', onboardedAt: stamp,
      signature: 'giveabit.io',
      // The optional panels are on for the manual, so their cards can be photographed.
      assist: { explainNumbers: true, rehearsal: false, hints: true, freshnessRings: true, bookSeal: true, handoverNote: true, counterCard: true, wallClock: true, weeklyLetter: true, liveTest: true },
    }));
    localStorage.setItem('slip.ledger.v1', JSON.stringify({ version: 1, items: [{ id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, template: 'cafe' }, { id: 'i2', name: 'Croissant', priceMinor: '400', priceCurrency: 'FIAT', category: 'Bakery', emoji: '🥐', taxBps: 0, sort: 2, template: 'cafe' }], invoices: [inv('inv_a'), inv('inv_b', { amountAtoms: '5000', manual: true, walletId: 'w2', walletLabel: 'Back bar' }), inv('inv_c', { amountAtoms: '7000', walletId: 'ln:shop@x', walletLabel: 'Lightning', note: 'lightning' })], requests: [], books: {}, watches: [{ id: 'w_a', label: 'Landlord', address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', networkId: 'btc-mainnet', note: '', addedAt: stamp }], anchors: [], refunds: [] }));
  },
  [ZPUB, today],
);

const page = await context.newPage();
await page.route('https://mempool.space/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chain_stats: { funded_txo_sum: 12_345_678, spent_txo_sum: 0, tx_count: 3 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } }) }),
);
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(900);

let captured = 0;
const missing = [];
for (const id of ids) {
  // The customer page is a route, not a panel on the till.
  if (id === 'explainer') {
    await page.goto(`http://127.0.0.1:${PORT}/?explain=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-panel="explainer"]');
    await page.locator('[data-panel="explainer"]').screenshot({ path: join(ROOT, `screenshots/manual/${id}.png`) });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    await page.waitForTimeout(500);
    captured += 1;
    console.log(`shot ${id}`);
    continue;
  }
  // A fresh load at /#id resolves the section on mount (App initialises activeSection from the
  // hash), so the panel is visible before we scroll. The old scroll-only path waited forever on
  // a panel inside a display:none section once the six-tab shell landed.
  await page.goto(`http://127.0.0.1:${PORT}/#${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1').catch(() => {});

  // Two manual cards describe a SECTION rather than a panel: the till lock lives inside Settings and
  // the overpayment note inside Books. Photograph the section, not a panel that does not exist.
  const SECTIONS = {
    lock: { path: `/#settings`, sel: '[data-till-lock]' },
    // The demo shop carries one sale that arrived over its ask; a seeded clean shop has none.
    overpaid: { path: `/?demo=1#history`, sel: '[data-sale-row]' },
  };
  const section = SECTIONS[id];
  if (section) {
    await page.goto(`http://127.0.0.1:${PORT}${section.path}`, { waitUntil: 'domcontentloaded' });
    const target = page.locator(section.sel).first();
    await target.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if ((await target.count()) > 0) {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await target.screenshot({ path: join(ROOT, `screenshots/manual/${id}.png`) });
      captured += 1;
      console.log(`shot ${id}`);
      continue;
    }
  }

  // The developer panels sit behind the technical switch (D-79). The manual documents them, so the
  // shooter presses that switch the way a person would, then photographs what appears.
  let panel = page.locator(`[data-panel="${id}"]`).first();
  if ((await panel.count()) === 0) {
    const reveal = page.getByRole('button', { name: /show the technical tools/i });
    if ((await reveal.count()) > 0) {
      await reveal.first().click();
      await page.waitForTimeout(200);
      await page.goto(`http://127.0.0.1:${PORT}/#${id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1').catch(() => {});
      panel = page.locator(`[data-panel="${id}"]`).first();
    }
  }
  if ((await panel.count()) === 0) {
    missing.push(id);
    continue;
  }
  await panel.waitFor({ state: 'visible', timeout: 8000 });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await panel.screenshot({ path: join(ROOT, `screenshots/manual/${id}.png`) });
  captured += 1;
  console.log(`shot ${id}`);
}

await browser.close();
server.close();
console.log(`\ncaptured ${captured}/${ids.length}`);
if (missing.length) {
  console.log(`not on the page (add data-panel="${missing[0]}" to the component): ${missing.join(', ')}`);
  process.exit(1);
}
