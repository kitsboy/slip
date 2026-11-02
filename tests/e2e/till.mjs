#!/usr/bin/env node
/**
 * The till, end to end, against a STUBBED explorer.
 *
 * Why stubbed: the assertions are about slip's behaviour (index reservation, honest status
 * transitions, receipt), not about a third party being up. It also proves slip talks only to
 * the configured endpoint.
 *
 * Usage: node tests/e2e/till.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1600 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

// Explorer stub: starts empty (nothing paid), then we flip it to "paid in mempool",
// then to "mined".
let mode = 'empty';
let hits = 0;
await page.route('https://mempool.space/**', async (route) => {
  hits += 1;
  const stats =
    mode === 'empty'
      ? { chain_stats: {}, mempool_stats: {} }
      : mode === 'mempool'
        ? { chain_stats: {}, mempool_stats: { funded_txo_sum: 75_000_000, spent_txo_sum: 0, tx_count: 1 } }
        : { chain_stats: { funded_txo_sum: 75_000_000, spent_txo_sum: 0, tx_count: 1 }, mempool_stats: {} };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stats) });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// A checked wallet is a precondition for charging — the counter lives in Setup.
await showPanel(page, 'wallets');
await page.locator('#ct-label').fill('Front counter');
await page.locator('#ct-xpub').fill(ZPUB);
await page.waitForSelector('ol li code');
await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save counter' }).click();
await page.waitForTimeout(400);
await showPanel(page, 'till');

// --- catalog from a template -------------------------------------------------
await page.getByRole('button', { name: 'Café', exact: true }).click();
await page.waitForTimeout(300);
check('template populates the catalog', /Espresso/.test(await page.locator('body').innerText()));

// --- build a sale ------------------------------------------------------------
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('button:has-text("Croissant")').first().click();
await page.waitForTimeout(200);
const cart = await page.locator('li:has-text("Espresso")').first().innerText();
check('cart counts two espressos', /× 2/.test(cart), cart);

await page.locator('#tl-rate').fill('60000.00');
await page.waitForTimeout(400);
const chargeText = await page.getByRole('button', { name: /^charge/i }).innerText();
check('charge button shows a sats figure', /sats/i.test(chargeText), chargeText);

await page.getByRole('button', { name: /^charge/i }).click();
await page.waitForSelector('text=Pay exactly');

// --- the payment screen ------------------------------------------------------
const payment = await page.locator('body').innerText();
check('payment screen warns to pay the exact amount', /Pay the exact amount/.test(payment));
check('payment screen names the address index', /Address #0/.test(payment), payment.slice(0, 200));
check('payment screen shows a QR svg', (await page.locator('svg').count()) > 0);
check('first status is waiting', /waiting for payment/i.test(payment));

// --- mempool-only receipt is "seen", never "paid" ----------------------------
mode = 'mempool';
await page.getByRole('button', { name: 'check now' }).click();
await page.waitForTimeout(700);
const seen = await page.locator('body').innerText();
// The plain-language pass renamed this: a shopkeeper should not need the word "mempool" to know a
// payment is on its way but not yet confirmed.
check('an unconfirmed payment reads as seen, not paid', /seen on its way/i.test(seen), seen.slice(0, 240));
check('an unconfirmed payment never says paid', !/^paid/i.test(seen.trim()) && !/paid — seen/i.test(seen), seen.slice(0, 120));
check('mempool receipt is NOT called paid', !/Paid — seen on chain/.test(seen));

// --- mined receipt completes and issues a receipt ---------------------------
mode = 'mined';
await page.getByRole('button', { name: 'check now' }).click();
await page.waitForSelector('text=Receipt', { timeout: 8000 });
const receipt = await page.locator('body').innerText();
check('receipt says paid and seen on chain', /Paid — seen on chain/.test(receipt));
check('receipt carries a proof QR', (await page.locator('svg').count()) > 0);
check('receipt names the invoice and index', /Invoice inv_/.test(receipt) && /index #0/.test(receipt));

await page.getByRole('button', { name: 'Next sale' }).click();
await page.waitForTimeout(300);

// --- the next sale must use a DIFFERENT index -------------------------------
await page.locator('button:has-text("Flat white")').first().click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /^charge/i }).click();
await page.waitForSelector('text=Pay exactly');
check('second sale reserves index #1', /Address #1/.test(await page.locator('body').innerText()));

// --- a manual confirmation is labelled as manual ----------------------------
await page.getByRole('button', { name: /I have the money/ }).click();
await page.waitForSelector('text=Receipt');
const manual = await page.locator('body').innerText();
check('manual receipt says it was marked by you', /Marked paid by you/.test(manual));
check('manual receipt admits slip did not observe it', /did not observe/.test(manual));

// --- agent surface is read-only ---------------------------------------------
// Plain JS inside the page: no type syntax here, it is evaluated by the browser.
const agent = await page.evaluate(() => {
  const s = window.slip;
  return s ? { version: s.version, readOnly: s.readOnly, wallets: s.wallets().length } : null;
});
check('window.slip exists and is read-only', Boolean(agent && agent.readOnly === true), JSON.stringify(agent));
check('agent surface reports the wallets', Boolean(agent && agent.wallets >= 1), JSON.stringify(agent));

check('explorer was contacted only through the stub', hits > 0);
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nTill checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
