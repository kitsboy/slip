#!/usr/bin/env node
/**
 * The regression this exists for: a backup used to omit the till PIN, so restoring on a
 * new phone left the device unprotected while looking completely normal.
 *
 * Flow: add a counter → set a PIN → export → wipe → restore → prove the PIN came back
 * (a hand-off without a PIN must be refused).
 *
 * Usage: node tests/e2e/pin-backup.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const CHROME = chromePath();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 1200 }, acceptDownloads: true });
const page = await ctx.newPage();

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// 1. a counter and a PIN
await page.locator('#ct-label').fill('Front counter');
await page.locator('#ct-xpub').fill(ZPUB);
await page.waitForSelector('ol li code');
await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save counter' }).click();
await page.waitForTimeout(300);

await page.getByLabel('Set a till PIN').fill('4321');
await page.getByRole('button', { name: 'Set PIN' }).click();
await page.waitForTimeout(300);
check('PIN set', /PIN set/.test(await page.locator('[data-testid="counter-message"]').innerText()));

// 2. export
await page.fill('#bk-pass', 'correct horse battery staple');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 10000 }),
  page.getByRole('button', { name: /Export encrypted backup/ }).click(),
]);
const stream = await download.createReadStream();
let backupText = '';
for await (const chunk of stream) backupText += chunk.toString();
check('backup exported', backupText.length > 100);
check('backup does not contain the xpub', !backupText.includes(ZPUB.slice(0, 24)));

// 3. wipe
await page.getByLabel(/Type WIPE/).fill('WIPE');
await page.getByRole('button', { name: /Wipe this device/ }).click();
await page.waitForTimeout(1200);
const afterWipe = await page.locator('body').innerText();
check('wipe leaves no counters behind', !/Front counter/.test(afterWipe) || /needs your check/.test(afterWipe), 'counter still listed');
check('wipe clears the settings name', (await page.locator('#st-name').inputValue()) === '');

// 4. restore
await page.setInputFiles('input[type="file"]', {
  name: 'slip-backup.slip',
  mimeType: 'application/json',
  buffer: Buffer.from(backupText),
});
await page.waitForTimeout(400);
check('restore asks for confirmation first', (await page.getByRole('button', { name: /Confirm restore/ }).count()) === 1);

await page.fill('#bk-pass', 'correct horse battery staple');
// Two taps: the first press arms it, the second actually replaces the device.
await page.getByRole('button', { name: /Confirm restore/ }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Restore again/i }).click();
await page.waitForTimeout(800);
const afterRestore = await page.locator('body').innerText();
check('counter restored', /Front counter/.test(afterRestore));
// A backup made on a device with no ledger says so honestly ("no books in that file"), so the
// assertion is about the PIN travelling, not about a phrase that depends on the fixture.
check('restore reports the PIN travelled', /restored .*the PIN/.test(afterRestore), afterRestore.slice(-300));

// 5. the actual regression: a hand-off must still demand the PIN
await page.selectOption('#ho-account', { index: 1 }).catch(() => undefined);
await page.fill('#ho-staff', 'Ana');
await page.getByRole('button', { name: 'Hand over' }).click();
await page.waitForTimeout(300);
const msg = await page.locator('[data-testid="counter-message"]').innerText();
check('restored device still requires the PIN for a hand-off', /PIN/.test(msg), msg);

await browser.close();
console.log(failures === 0 ? '\nPIN-in-backup checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
