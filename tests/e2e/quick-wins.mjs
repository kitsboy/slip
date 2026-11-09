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
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const FIRST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

const CHROME = chromePath();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const errs = [];
/**
 * The shell is one page per section: a panel in Setup is `hidden` until the hash opens its
 * section. A direct `fill` on it therefore times out on a page that is working correctly, so
 * every step below opens the section it is about first. (This suite was written before the
 * five-tab shell existed and had been red ever since.)
 */
const go = async (hash) => {
  const url = new URL(BASE);
  url.hash = hash;
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
};
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
await go('#setup');
await page.waitForSelector('#ac-address', { state: 'visible' });
// The nearest section holding the field, not an outer wrapper that also holds other statuses.
const acSection = page.locator('section:has(#ac-address)').last();
await page.fill('#ac-address', FIRST);
const okMsg = await acSection.locator('[role="status"]').first().innerText();
check('mainnet address accepted on Bitcoin', /valid for Bitcoin/.test(okMsg), okMsg);
await page.selectOption('#ac-network', 'ltc-mainnet');
await page.waitForTimeout(150);
const badMsg = await acSection.locator('[role="status"]').first().innerText();
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
await go('#sell');
const afterReload = await page.locator('p:has-text("Held by")').first().innerText().catch(() => '');
check('hand-off survives a reload', /Ana/.test(afterReload), afterReload);


// 7. Descriptors are accepted, not just bare xpubs.
await go('#setup');
await page.fill('#ct-label', 'Truck');
await page.fill('#ct-xpub', `wpkh(${ZPUB}/0/*)`);
await page.waitForTimeout(300);
const descPreview = await page.locator('ol li code').first().innerText();
check('wpkh() descriptor derives the same address 0/0', descPreview.includes(FIRST), descPreview);

// 8. The receive QR renders (and is our own SVG, not an image fetch).
await page.getByRole('button', { name: /address 0\/0 QR/ }).first().click();
await page.waitForTimeout(200);
const svgCount = await page.locator('div.h-32.w-32 svg').count();
check('counter QR renders as inline SVG', svgCount > 0, String(svgCount));

// 9. Shift log is written and verifies.
const chainChip = await page.locator('text=/chain intact/').first().innerText().catch(() => '');
check('shift log verified as intact after a hand-off', /chain intact/.test(chainChip), chainChip);

// 10. Encrypted backup actually downloads a file.
await page.fill('#bk-pass', 'correct horse battery staple');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.getByRole('button', { name: /Export encrypted backup/ }).click(),
]);
if (download) {
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  check('backup downloads as a .slip file', download.suggestedFilename().endsWith('.slip'), download.suggestedFilename());
  check('backup is encrypted (xpub absent from the file)', !text.includes(ZPUB.slice(0, 24)));
  check('backup declares itself encrypted', /"ciphertext"/.test(text) && /slip-backup/.test(text));
} else {
  check('backup downloads as a .slip file', false, 'no download event');
}

// 11. The version on the page matches the package version the deploy stamped.
// In v2 the stamp lives in the footer; the header chip is the older skin's home for it.
// In v2 the stamp lives in the footer; `header .chip.figure` is the older skin's home for it.
const footStamp = page.locator('.v2-foot-ver');
const versionChip =
  (await footStamp.count()) > 0
    ? await footStamp.first().innerText()
    : await page.locator('header .chip.figure').first().innerText();
check('header shows a version stamp', /^v\d+\.\d+\.\d+ · /.test(versionChip), versionChip);

// 12. Owning it out loud: no runtime errors from our code.
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: 'screenshots/quick-wins.png', fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nAll quick-win checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
