#!/usr/bin/env node
/**
 * The demo shop: a pretend café in its own drawer, with a simulated explorer, that a stranger can
 * take a sale in.
 *
 * Usage: node tests/e2e/demo.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 } });
const page = await context.newPage();

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const external = [];
page.on('request', (r) => {
  const url = r.url();
  if (/^https?:/.test(url) && !url.startsWith(BASE)) external.push(url);
});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(900);

const body = () => page.locator('body').innerText();

check('the demo announces itself', /DEMO — a pretend shop/i.test(await body()));

// A sale, from the demo's own menu, with no rate typed.
await page.locator('button:has-text("Espresso")').first().click();
await page.waitForTimeout(200);
const rate = await page.locator('#tl-rate').inputValue();
check('the demo fills a rate so nobody has to type one', rate.startsWith('60000'), rate);

await page.getByRole('button', { name: /^charge/i }).click();
await page.waitForSelector('text=Pay exactly');
check('a demo sale shows a QR', (await page.locator('svg').count()) > 0);

// The simulated explorer confirms after a few seconds; the till polls every two.
// Wait for the receipt's own control, not the word "receipt" (the Verify panel has one too).
await page.waitForSelector('button:has-text("new sale")', { timeout: 25_000 });
const receipt = await body();
check('the simulated payment completes on its own', /Paid — seen on chain/.test(receipt), receipt.slice(0, 200));
check('the receipt is a real receipt, in the demo drawer', /Invoice inv_/.test(receipt));
check('the demo shop has its own name', /Demo Café/.test(receipt), receipt.slice(0, 200));

// Storage isolation: the demo writes only to its own prefix.
const keys = await page.evaluate(() => Object.keys(window.localStorage));
check('demo data lives in its own drawer', keys.some((k) => k.startsWith('slip.demo.')), keys.join(','));
check('no real shop data was created by the demo', !keys.includes('slip.accounts.v1') && !keys.includes('slip.ledger.v1'), keys.join(','));

check('the demo never reached the internet', external.length === 0, external.slice(0, 3).join(' | '));
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

// Leaving wipes the demo drawer and returns to the real app.
await page.getByRole('button', { name: 'exit demo' }).click();
await page.waitForTimeout(700);
const after = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('slip.demo.')));
check('exiting the demo clears its drawer', after.length === 0, after.join(','));
check('the real app comes back', !/DEMO — a pretend shop/i.test(await body()));

await browser.close();
console.log(failures === 0 ? '\nDemo checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
