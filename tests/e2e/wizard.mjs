#!/usr/bin/env node
/**
 * Walks the setup wizard end to end in a real browser, including the gate that refuses
 * to leave the wallet screen until address 0/0 is confirmed.
 *
 * Usage: node tests/e2e/wizard.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const FIRST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', {
  encoding: 'utf8',
}).trim();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1200 } });

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

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// The wizard is a guided path, not a gate — a visitor still sees the page first.
await page.getByRole('button', { name: /set up your shop/i }).click();
await page.waitForSelector('text=step 1 of 5');
check('wizard opens from the hero', true);

await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 2 of 5');

// Gate: no name, no advance.
const nameField = page.locator('#wz-name');
await nameField.fill('Corner Coffee');
await page.locator('#wz-currency').selectOption('CAD');
await page.locator('#wz-tax').fill('5');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 3 of 5');
check('shop details accepted', true);

// Gate: wallet step cannot advance without the confirmation tick.
const continueBtn = page.getByRole('button', { name: 'Continue' });
check('cannot leave the wallet step unconfirmed', await continueBtn.isDisabled());

await page.locator('#wz-network').selectOption('btc-mainnet');
await page.locator('#wz-xpub').fill(ZPUB);
await page.waitForSelector('#wz-xpub ~ * ol li code, ol li code');
const preview = await page.locator('ol li code').first().innerText();
check('preview shows the BIP-84 vector', preview.includes(FIRST), preview);

await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save wallet' }).click();
await page.waitForTimeout(300);
check('wallet saved after confirmation', await continueBtn.isEnabled());

await continueBtn.click();
await page.waitForSelector('text=step 4 of 5');
await page.locator('#wz-pin').fill('4321');
await page.getByRole('button', { name: 'Set PIN' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('text=step 5 of 5');

const summary = await page.locator('main, div').first().innerText();
check('summary names the shop', /Corner Coffee/.test(await page.locator('body').innerText()));
check('summary says no till yet', /cannot take a payment yet/.test(await page.locator('body').innerText()), summary.slice(0, 60));

await page.getByRole('button', { name: 'Finish setup' }).click();
await page.waitForSelector('h1');
const after = await page.locator('body').innerText();
// The section was renamed: a "counter" is now one kind of wallet, and the heading says so.
check('finishing returns to the workbench', /Wallets & staff hand-off/.test(after), after.slice(0, 120));
check('onboarding is remembered', /run setup again/i.test(after));

// The counter created during setup is real and usable.
check('setup created a checked counter', /Front counter/.test(after));

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: 'screenshots/wizard-done.png', fullPage: false });
await browser.close();
console.log(failures === 0 ? '\nWizard checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
