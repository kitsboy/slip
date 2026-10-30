#!/usr/bin/env node
/**
 * Browser checks for the quick-win batch: staff hand-off (BIP-85 counters), address
 * validation, the live network-request counter, and the derivation-preview gate.
 *
 * Runs against a real HTTP origin (localStorage is blocked on file:// in some browsers),
 * which is also how a merchant actually uses the installed app.
 *
 * Usage: node tests/e2e/quick-wins.mjs [baseUrl]
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
const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  // Cloudflare's injected challenge script is refused on the proxied domain by design.
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// 1. The no-telemetry claim, measured.
const counter = await page.locator('[data-testid="request-counter"]').innerText();
check('network-request counter reads 0 to other servers', /: 0\b/.test(counter), counter);

// 2. Address validation: right chain accepted, wrong chain refused.
await page.fill('#ac-address', FIRST);
const okMsg = await page.locator('#ac-address ~ * [role="status"], [role="status"]').first().innerText();
check('mainnet address accepted on Bitcoin', /valid for Bitcoin/.test(okMsg), okMsg);
await page.selectOption('#ac-network', 'ltc-mainnet');
await page.waitForTimeout(150);
const badMsg = await page.locator('[role="status"]').first().innerText();
check('same address refused on Litecoin', /belongs to Bitcoin, not Litecoin/.test(badMsg), badMsg);
await page.selectOption('#ac-network', 'btc-mainnet');

// 3. Derivation-preview gate: Save is disabled until the merchant confirms address 0/0.
await page.fill('#ct-label', 'Front counter');
await page.fill('#ct-xpub', ZPUB);
await page.waitForSelector('#ct-xpub ~ div ol li code, ol li code');
const saveBtn = page.getByRole('button', { name: 'Save counter' });
check('save is blocked before the wallet check', await saveBtn.isDisabled());
const preview = await page.locator('ol li code').first().innerText();
check('preview shows the BIP-84 first address', preview.includes(FIRST), preview);

await page.getByLabel(/I opened my wallet/).check();
check('save enabled once the check is ticked', await saveBtn.isEnabled());
await saveBtn.click();
await page.waitForTimeout(200);
const checkedBadge = await page
  .locator('li span:text-matches("^(checked|needs your check)$", "i")')
  .first()
  .innerText()
  .catch(() => '');
check('counter saved as checked', /checked/i.test(checkedBadge), checkedBadge);

// 4. Staff hand-off requires a name and then names the holder.
await page.selectOption('#ho-account', { index: 1 });
await page.getByRole('button', { name: 'Hand over' }).click();
await page.waitForTimeout(150);
const noName = await page.locator('[data-testid="counter-message"]').innerText();
check('hand-off refuses an unnamed staff member', /name the person/.test(noName), noName);

await page.fill('#ho-staff', 'Ana');
await page.getByRole('button', { name: 'Hand over' }).click();
await page.waitForTimeout(250);
const banner = await page.locator('p:has-text("Held by")').first().innerText();
check('till shows who is holding it', /Held by\s+Ana/.test(banner), banner);

// 5. Reload keeps the hand-off (persisted, not just in memory).
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
const afterReload = await page.locator('p:has-text("Held by")').first().innerText().catch(() => '');
check('hand-off survives a reload', /Ana/.test(afterReload), afterReload);

// 6. Owning it out loud: no runtime errors from our code.
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: 'screenshots/quick-wins.png', fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nAll quick-win checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
