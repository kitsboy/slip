#!/usr/bin/env node
/**
 * The offline claim, tested with the network actually off.
 *
 * Everything slip promises is local: the address comes from a public key, the code is drawn in the
 * page, the books live in this browser. But until now that was tested with demo data and a live
 * connection. Here a real shop is set up online, the network is cut, and the till has to open, name a
 * real address, refuse to invent a price, take a rate from the shopkeeper, and let a human say the
 * money arrived — with the receipt saying exactly that a human said it.
 *
 * Usage: node tests/e2e/offline.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const FIRST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1200 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/.test(m.text())) {
    errs.push(m.text());
  }
});

// ── 1. A real shop, built online, with a real public key ────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /set up my shop/i }).click();
await page.waitForSelector('text=step 1 of 5');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 2 of 5');
await page.locator('#wz-name').fill('Offline Coffee');
await page.locator('#wz-currency').selectOption('USD');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 3 of 5');
await page.locator('#wz-network').selectOption('btc-mainnet');
await page.locator('#wz-xpub').fill(ZPUB);
await page.waitForSelector('ol li code');
const preview = await page.locator('ol li code').first().innerText();
check('the shop is set up from a real public key', preview.includes(FIRST), preview);
await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save wallet' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 4 of 5');
await page.locator('#wz-pin').fill('4321');
await page.getByRole('button', { name: 'Set PIN' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 5 of 5');
// The last gate: a human says the address on slip matches the address in their own wallet.
const matchTick = page.getByLabel(/I checked address 0\/0/);
if (await matchTick.count()) await matchTick.check();
await page.getByRole('button', { name: 'Finish setup' }).click();
await page.waitForSelector('h1');

// The worker must be installed and holding the shell before the network goes away, otherwise this
// test proves the browser's cache, not slip.
const ready = await page
  .evaluate(() => navigator.serviceWorker.ready.then(() => true))
  .catch(() => false);
check('the offline shell is installed', ready === true);

// ── 2. Cut the network ─────────────────────────────────────────────────────────────────────────────
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 20000 });
const offline = await page.locator('body').innerText();
check('the till opens with the network off', /Offline Coffee/.test(offline) || /slip/.test(offline), offline.slice(0, 80));
check('it says which version it is, offline', /v\d+\.\d+\.\d+/.test(offline), offline.slice(0, 80));

// ── 3. Take a sale with no network ─────────────────────────────────────────────────────────────────
await page.getByRole('button', { name: 'Café' }).click();
await page.waitForTimeout(400);
await page.locator('.v2-catalog button').first().click();
await page.waitForTimeout(400);

// With the network off there is no price to fetch, and the till must refuse to invent one.
const blocker = page.locator('[data-charge-blocker]');
check(
  'it refuses to invent a price with the network off',
  (await blocker.count()) > 0 && /worth first/i.test(await blocker.first().innerText()),
  (await blocker.count()) ? await blocker.first().innerText() : 'no blocker shown',
);

// A rate typed by hand is enough to charge — the shopkeeper is the price source of last resort.
await page.locator('#tl-rate').fill('60000');
await page.waitForTimeout(300);
check('a typed rate clears the block', (await blocker.count()) === 0);

await page.getByRole('button', { name: /^Charge/ }).first().click();
await page.waitForTimeout(2500);
console.log('DIAG', JSON.stringify(await page.evaluate(() => ({
  receipt: document.querySelectorAll('.v2-receipt').length,
  qr: document.querySelectorAll('.v2-receipt-qr, .v2-qr-box, svg').length,
  blocker: document.querySelector('[data-charge-blocker]')?.textContent,
  tail: document.body.innerText.slice(-600).replace(/\n+/g, ' | '),
}))));
// The awaiting panel draws the code locally: no image, no request, a real QR from the address bytes.
check('the code is drawn with no network at all', (await page.locator('.v2-qr-box svg').count()) > 0);
check('the awaiting panel says it is watching', /waiting for payment/i.test(await page.locator('body').innerText()));
check('it says slip cannot spend it', /cannot spend/i.test(await page.locator('body').innerText()));

const bodyText = await page.locator('body').innerText();
check('it names the wallet’s own first address', bodyText.includes(FIRST), FIRST);

// ── 4. A human says the money came, and the receipt says a human said it ──────────────────────────
const paid = page.getByRole('button', { name: /I have the money/i });
if (await paid.count()) {
  await paid.first().click();
  await page.waitForTimeout(700);
  const after = await page.locator('body').innerText();
  check('a manual confirmation is labelled as one', /marked paid by you/i.test(after), after.slice(0, 160));
  check('the receipt exists after the manual confirmation', (await page.locator('.v2-receipt, .v2-receipt-qr').count()) > 0);
  check('it does not pretend the engine saw it', !/Paid — seen on chain/i.test(after), after.slice(0, 120));
} else {
  check('a manual confirmation is offered with the network off', false, 'no "I have the money" button');
}

check('no runtime errors from slip', errs.length === 0, errs.slice(0, 2).join(' | '));

await page.screenshot({ path: 'screenshots/offline-sale.png' });
await browser.close();
console.log(failures === 0 ? '\nOffline checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
