#!/usr/bin/env node
/**
 * Browser checks for the refinement pass: theme switching, editable settings, the
 * restore dry-run, and the wipe. Every one of these is a thing a shop owner does when
 * something changed, so each is proven in a real browser rather than in a unit test.
 *
 * Usage: node tests/e2e/refine.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const FIRST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

const CHROME = chromePath();
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

// --- theme -----------------------------------------------------------------
// The default follows the OS preference, and a headless browser can report either, so
// assert the MECHANISM (a valid theme, a change, and persistence) rather than a colour.
const themeBtn = page.getByRole('button', { name: /^Theme:/ });
await themeBtn.waitFor({ state: 'visible' });
const first = await page.locator('html').getAttribute('data-theme');
check('a valid theme is applied on first load', ['dark', 'light', 'contrast'].includes(String(first)), String(first));
const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

await themeBtn.click();
const second = await page.locator('html').getAttribute('data-theme');
check('clicking switches theme', second !== first, `${first} -> ${second}`);
const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('the computed background actually changes', bgBefore !== bgAfter, `${bgBefore} -> ${bgAfter}`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
check('theme choice survives a reload', (await page.locator('html').getAttribute('data-theme')) === second);

// return to the theme we started on, so screenshots stay consistent
await page.getByRole('button', { name: /^Theme:/ }).click();
await page.waitForTimeout(100);

// --- settings --------------------------------------------------------------
await page.locator('#st-name').fill('Corner Coffee');
await page.locator('#st-currency').selectOption('CAD');
await page.locator('#st-tax').fill('7.5');
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(200);
const saved = await page.locator('[data-testid="settings-note"], [role="status"]').first().innerText();
check('settings save', /saved/i.test(saved), saved);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#st-name');
check('settings persist', (await page.locator('#st-name').inputValue()) === 'Corner Coffee');
check('tax persists as typed', (await page.locator('#st-tax').inputValue()) === '7.5');

// --- restore dry-run -------------------------------------------------------
// Create a counter first so there is something to replace.
await page.locator('#ct-label').fill('Front counter');
await page.locator('#ct-xpub').fill(ZPUB);
await page.waitForSelector('ol li code');
check('preview still works after the refactor', (await page.locator('ol li code').first().innerText()).includes(FIRST));

// An invalid file must be refused with a sentence, not a crash.
await page.setInputFiles('input[type="file"]', {
  name: 'not-a-backup.slip',
  mimeType: 'application/json',
  buffer: Buffer.from('{"hello":"world"}'),
});
await page.waitForTimeout(300);
const badFile = await page.locator('[role="status"]').last().innerText();
check('a non-backup file is refused politely', /not a slip backup|format/i.test(badFile), badFile);

// --- wipe ------------------------------------------------------------------
const wipeBtn = page.getByRole('button', { name: /Wipe this device/ });
check('wipe is disabled until you type WIPE', await wipeBtn.isDisabled());
await page.getByLabel(/Type WIPE/).fill('WIPE');
check('wipe unlocks on the exact word', await wipeBtn.isEnabled());

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: 'screenshots/refine.png', fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nRefinement checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
