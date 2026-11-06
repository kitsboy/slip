#!/usr/bin/env node
/**
 * The polish pass: navigation, wording and the small affordances that make the page legible.
 *
 * Usage: node tests/e2e/polish.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1200 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const today = new Date().toISOString().slice(0, 10);
await context.addInitScript(
  ([zpub, day]) => {
    const stamp = new Date().toISOString();
    localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({
        version: 1,
        accounts: [{
          id: 'w1', label: 'Front counter', xpub: zpub, coin: 'btc', networkId: 'btc-mainnet',
          scriptType: 'p2wpkh', source: 'xpub', colour: 'blue', purpose: 'till', note: '',
          fingerprintHex: '7ef32bdb', prefix: 'zpub',
          firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
          acknowledgedAt: stamp, createdAt: stamp, staffName: null, nextIndex: 1,
        }],
        activeAccountId: 'w1', pinHash: null, savedAt: stamp,
      }),
    );
    localStorage.setItem(
      'slip.settings.v1',
      JSON.stringify({
        businessName: 'Café Nord', currency: 'USD', taxBps: 0, taxInclusive: false,
        tipPresetsBps: [0, 1000], receiptFooter: 'Thanks', explorerUrl: '', rateEndpoint: '',
        autoRate: false, staff: [], language: 'en', onboardedAt: stamp, signature: 'giveabit.io',
      }),
    );
    localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [{ id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, active: true }],
        invoices: [],
        requests: [], books: {}, watches: [], anchors: [], refunds: [],
      }),
    );
    void day;
  },
  [ZPUB, today],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.route('https://mempool.space/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chain_stats: {}, mempool_stats: {} }) }),
);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(700);
const body = () => page.locator('body').innerText();

// --- navigation ---------------------------------------------------------------------
// At 430px the phone bottom bar is the visible nav (the slim top rail is sm-and-up).
const nav = page.locator('nav[aria-label="Primary sections (phone)"]');
check('the page has a phone tab bar', (await nav.count()) === 1);
const chips = await nav.locator('a').allInnerTexts();
check('the tab bar names the journey', ['Sell', 'Money in', 'Books', 'Setup', 'More'].every((c) => chips.includes(c)), chips.join(','));
check('Learn is behind the help chip, not a tab', !chips.includes('Learn'), chips.join(','));
check('the demo is reachable from the manual', (await page.locator('[data-panel="demo-link"]').count()) === 1);

await nav.getByRole('link', { name: 'Books' }).click();
await page.waitForTimeout(400);
// The page got shorter when a set-up shop's hero collapsed, so a scroll-distance threshold is no
// longer evidence of anything. What matters is that the section is actually on screen.
const booksInView = await page.evaluate(() => {
  const panel = document.querySelector('[data-panel="history"]');
  if (!panel) return false;
  const box = panel.getBoundingClientRect();
  return box.top < window.innerHeight && box.bottom > 0;
});
check('a nav chip actually moves the page', booksInView, String(await page.evaluate(() => window.scrollY)));
check('the books section is where the chip promised', (await page.locator('#books [data-panel="history"]').count()) === 1);

// --- order --------------------------------------------------------------------------
const order = await page.locator('section[data-panel]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-panel')),
);
check('the till comes before the books', order.indexOf('till') < order.indexOf('history'), order.join(','));
check('the manual is reachable last, not buried mid-page', order.indexOf('manual') > order.indexOf('history'), order.join(','));
check('the wallets panel sits in setup, not ahead of selling', order.indexOf('wallets') > order.indexOf('till'), order.join(','));

// --- wording ------------------------------------------------------------------------
// The Books click hid the Sell section; return to it so the till panel is visible again.
await nav.getByRole('link', { name: 'Sell' }).click();
await page.waitForTimeout(400);
const till = page.locator('[data-panel="till"]');
await till.scrollIntoViewIfNeeded();
const tillText = await till.innerText();
check('the status chip says what it is doing, not "detection live"', /Watching for payments|not watching/i.test(tillText), tillText.slice(0, 120));
check('no debug-sounding reconciliation line', !/Reconciliation:/.test(tillText));
check('custom amount explains that it adds to the items', /added to the items/i.test(tillText));
check('the stale "Not a till yet" banner is gone', !/Not a till yet/.test(await body()));

// --- small affordances ---------------------------------------------------------------
await page.locator('button:has-text("Espresso")').first().click();
await page.waitForTimeout(250);
check('an item in the cart shows its quantity on the card', /×1/.test(await till.innerText()));
const pressed = await page.getByRole('button', { name: /tip jar/i }).getAttribute('aria-pressed');
check('the tip jar announces its state', pressed === 'false' || pressed === 'true', String(pressed));

const skip = await page.locator('a.skip-link').count();
check('there is a skip link for keyboard users', skip === 1);

// --- assistance grouping -------------------------------------------------------------
const groups = await page.locator('[data-assist-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-assist-group')));
// 'explain' leads now: how much technical detail to show is the first choice a shopkeeper meets.
check('assistance is grouped by intent', groups.join(',') === 'explain,teaching,quiet,records', groups.join(','));

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nPolish checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
