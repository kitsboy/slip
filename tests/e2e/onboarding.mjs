#!/usr/bin/env node
/**
 * Onboarding batch: the trust moment, the honesty fix, the compare-address finish, and the
 * timed first-sale metric.
 *
 * This suite exists because the wizard is where the product makes its biggest promise — "slip
 * will never ask for your seed phrase". A promise in body copy is a claim; a refusal that empties
 * the field is proof. So we paste a real seed and a real xprv and assert they are refused AND never
 * echoed, then finish setup through the compare-address gate.
 *
 * Usage: node tests/e2e/onboarding.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const FIRST_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const XPRV = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi';

const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});
const body = () => page.locator('body').innerText();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 15000 });

// Open the wizard from the hero.
await page.getByRole('button', { name: /set up your shop/i }).click();
await page.waitForSelector('#wz-try', { timeout: 8000 });

// --- Step 1: the wall is demonstrated, not just described -------------------
check('step 1 states the one rule', /never ask for your seed phrase/i.test(await body()));
check('step 1 offers the pretend shop', /Pretend shop first/i.test(await body()));

await page.locator('#wz-try').fill(SEED);
await page.waitForTimeout(150);
const tryText = await body();
check('a seed pasted into the try-it field is refused', /recovery phrase/i.test(tryText));
check('the try-it field empties itself', (await page.locator('#wz-try').inputValue()) === '');
check('the seed is never echoed into the page', !/abandon abandon/i.test(tryText));

// --- Step 2: name the shop --------------------------------------------------
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('#wz-name', { timeout: 8000 });
await page.locator('#wz-name').fill('Onboard Café');
check('step 2 asks for the shop name', /Shop name/i.test(await body()));

// --- Step 3: the trust moment on the real wallet field ---------------------
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('#wz-xpub', { timeout: 8000 });
await page.locator('#wz-network').selectOption('btc-mainnet');

await page.locator('#wz-xpub').fill(XPRV);
await page.waitForTimeout(150);
const xpText = await body();
check('an extended private key is refused', /private key/i.test(xpText));
check('the xpub field empties itself', (await page.locator('#wz-xpub').inputValue()) === '');
check('the xprv is never echoed into the page', !/xprv9s21/i.test(xpText));

await page.locator('#wz-xpub').fill(ZPUB);
await page.waitForTimeout(250);
check('a public zpub derives addresses', /m\/84.\/0.0\/0/i.test(await body()) || /bc1qcr8/i.test(await body()));
check('the compare-address checkbox names address 0/0', new RegExp(FIRST_ADDRESS.slice(0, 8)).test(await body()));
await page.getByLabel(/I opened my wallet/i).check();
await page.getByRole('button', { name: 'Save wallet' }).click();
await page.waitForTimeout(250);

// --- Step 4: PIN may be deferred -------------------------------------------
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForSelector('#wz-pin', { timeout: 8000 });
check('step 4 explains the PIN can be skipped and set later', /skip this and set it later/i.test(await body()));

// --- Step 5: the wizard ENDS on compare-address, and the lies are gone -----
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(300);
const finalText = await body();
check('step 5 shows the confirmed address 0/0', finalText.includes(FIRST_ADDRESS), FIRST_ADDRESS);
check('step 5 states the working till, not a future stage', /Working till/i.test(finalText));
check('the stale "no till yet" claim is gone', !/no till yet/i.test(finalText));
check('the stale "cannot take a payment yet" claim is gone', !/cannot take a payment yet/i.test(finalText));
check('step 5 tells the merchant to compare before taking money', /match the first address in your wallet/i.test(finalText));

const finish = page.getByRole('button', { name: /finish setup/i });
check('finish is gated until the merchant checks the address', await finish.isDisabled());
await page.getByLabel(/I checked address 0\/0/i).check();
check('finish unlocks after the check', !(await finish.isDisabled()));
await finish.click();
await page.waitForTimeout(400);
check('setup marks the shop onboarded (hero shows run setup again)', /run setup again/i.test(await body()));

// --- The timed metric: cold start to a chargeable sale in < 60s ------------
const t0 = Date.now();
const timed = await browser.newContext({ viewport: { width: 430, height: 1200 } });
const tp = await timed.newPage();
await tp.goto(BASE.replace(/\/$/, '') + '/?demo=1#till', { waitUntil: 'domcontentloaded' });
await tp.waitForSelector('[data-panel="till"]', { timeout: 15000 });
await tp.waitForTimeout(1200);
await tp.locator('[data-panel="till"] button:has-text("Espresso")').first().click();
await tp.waitForTimeout(300);
await tp.getByRole('button', { name: /^charge/i }).click();
await tp.waitForSelector('text=Pay the exact amount', { timeout: 15000 });
const elapsed = (Date.now() - t0) / 1000;
check(`first chargeable screen from cold start in < 60s (took ${elapsed.toFixed(1)}s)`, elapsed < 60, `${elapsed}s`);
await timed.close();

check('no runtime errors from slip', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(failures === 0 ? '\nOnboarding checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
