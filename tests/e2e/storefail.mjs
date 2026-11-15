/**
 * A device that refuses to save — a full disk, or private mode.
 *
 * This is the money-record bug the whole save-failure work exists for: a sale that "looks
 * recorded" but was never written to disk. localStorage throws a QuotaExceededError and gives
 * no return value, so before there was a guard the till silently went on and a merchant could
 * hand over goods against a sale that was about to vanish. These checks pin the contract:
 *   - the sale is NOT shown as recorded (no "Pay exactly" awaiting screen),
 *   - a banner that cannot be missed appears,
 *   - the sale is not lost — it stays in the cart,
 *   - the message names the cause (full device) rather than something vague.
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = (process.argv[2] ?? 'http://[::1]:4181/').replace(/\/$/, '');
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'; // fixing a checked test wallet

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1700 } });
let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(`${BASE}/?cb=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// A checked wallet is the precondition for charging.
await showPanel(page, 'wallets');
await page.locator('#ct-label').fill('Front counter');
await page.locator('#ct-xpub').fill(ZPUB);
await page.waitForSelector('ol li code');
await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save counter' }).click();
await page.waitForTimeout(400);
await showPanel(page, 'till');
await page.getByRole('button', { name: 'Café', exact: true }).click();
await page.waitForTimeout(300);
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('#tl-rate').fill('60000.00');
await page.waitForTimeout(400);

// Sanity: it can charge before we break storage.
const chargeBtn = page.getByRole('button', { name: /^charge/i });
const chargeText = (await chargeBtn.innerText()).toLowerCase();
check('charge button armed before the disk breaks', /sats/.test(chargeText), chargeText);

// --- break the disk: every subsequent localStorage write throws ---
await page.evaluate(() => {
  Storage.prototype.setItem = function setItemFull() {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  };
});

// Secondary write for an out-of-quota throw.
await chargeBtn.click();
await page.waitForTimeout(500);

const body = await page.locator('body').innerText();

// 1. Not shown as recorded: no awaiting-payment screen was shown.
check('no "Pay exactly" awaiting screen after a failed write', !/Pay the exact amount/.test(body));
check('no waiting-for-payment state', !/waiting for payment/i.test(body));

// 2. A cannot-be-missed banner is on the page.
check('the save-warning banner is visible', (await page.locator('[data-save-warning]').count()) > 0);

// 3. The message names a full device, not a vague failure.
check('the till names a full device', /device is full|refused/i.test(await page.locator('[data-save-warning]').first().innerText()));

// 4. The sale is not lost — it is still in the cart for a retry.
check('the sale stays in the cart', (await page.locator('li:has-text("Espresso")').count()) > 0);

// 5. No uncaught runtime errors.
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nStore-failure checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
