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
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'; // fixing a checked test wallet

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

// Real, non-demo wallet setup above is intentional: demo isolation cannot mask this failure.
check(
  'failure coverage uses the real drawer',
  new URL(page.url()).searchParams.get('demo') !== '1',
);
// --- break the disk: every subsequent localStorage write throws ---
await page.evaluate(() => {
  window.__realSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItemFull(key, value) {
    // Keep this unrelated key healthy so exports exercise a genuine successful
    // guarded write, rather than trying to replace a previously pending date.
    if (key === 'slip.lastBackup.v1') return window.__realSetItem.call(this, key, value);
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
check(
  'the save-warning banner is visible',
  (await page.locator('[data-save-warning]').count()) > 0,
);

// 3. The message names a full device, not a vague failure.
check(
  'the till names a full device',
  /device is full|refused/i.test(await page.locator('[data-save-warning]').first().innerText()),
);

// 4. The sale is not lost — it is still in the cart for a retry.
check('the sale stays in the cart', (await page.locator('li:has-text("Espresso")').count()) > 0);

// 5. No uncaught runtime errors.
check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

// A repeat retry while full must remain loud and keep the original recovery payload.
await page.getByRole('button', { name: 'Retry unsaved changes' }).click();
check(
  'retry while full leaves the alert visible',
  await page.locator('[data-save-warning]').isVisible(),
);

// Export while storage is STILL broken. Decode the actual downloaded encrypted file
// with WebCrypto, not a mock export callback, and inspect its cart snapshot.
await page.getByRole('link', { name: 'Export encrypted backup', exact: true }).click();
await page.locator('[data-panel="backup"]').waitFor({ state: 'visible' });
const passphrase = 'store failure recovery passphrase';
await page.locator('#bk-pass').fill(passphrase);
const downloadEvent = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export encrypted backup', exact: true }).click();
const download = await downloadEvent;
const stream = await download.createReadStream();
const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
const text = Buffer.concat(chunks).toString('utf8');
check(
  'backup download is encrypted, not a plaintext cart',
  JSON.parse(text).format === 'slip-backup' && !text.includes('Espresso'),
);
const recovered = await page.evaluate(
  async ({ text, passphrase }) => {
    const env = JSON.parse(text);
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: bytes(env.kdf.salt),
        iterations: env.kdf.iterations,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const raw = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes(env.iv),
        additionalData: new TextEncoder().encode('slip-backup-v1'),
      },
      key,
      bytes(env.ciphertext),
    );
    return JSON.parse(JSON.parse(new TextDecoder().decode(raw)).stateJson);
  },
  { text, passphrase },
);
check(
  'encrypted backup contains the unsaved cart snapshot',
  recovered.recoverySale?.cart?.some((line) => line.item.name === 'Espresso') &&
    recovered.recoverySale.cart.reduce((n, line) => n + line.quantity, 0) === 2,
  JSON.stringify(recovered.recoverySale ?? null),
);
check(
  'encrypted backup includes failed raw records',
  Object.keys(recovered.recoveryWrites ?? {}).length > 0,
);
check(
  'backup export never clears unresolved save failures',
  await page.locator('[data-save-warning]').isVisible(),
);

// Let unrelated bookkeeping succeed, not the failed ledger. Export again to exercise
// a genuine guarded successful write (recordBackupTaken), not direct localStorage.
await page.evaluate(() => {
  Storage.prototype.setItem = function selectivelyFull(key, value) {
    if (key === 'slip.ledger.v1') throw new DOMException('full', 'QuotaExceededError');
    return window.__realSetItem.call(this, key, value);
  };
});
await page.locator('#bk-pass').fill(passphrase);
const secondDownload = page.waitForEvent('download');
await page.getByRole('button', { name: 'Export encrypted backup', exact: true }).click();
await secondDownload;
await page.waitForFunction(() => !!localStorage.getItem('slip.lastBackup.v1'));
check(
  'an unrelated successful backup-date write really reached disk',
  await page.evaluate(() => !!localStorage.getItem('slip.lastBackup.v1')),
);
check(
  'unrelated success cannot clear failed ledger warning',
  await page.locator('[data-save-warning]').isVisible(),
);
await page.evaluate(() => {
  Storage.prototype.setItem = window.__realSetItem;
});
await page.getByRole('button', { name: 'Retry unsaved changes' }).click();
await page.locator('[data-save-warning]').waitFor({ state: 'detached' });
check(
  'genuine retry clears the warning only after storage recovery',
  (await page.locator('[data-save-warning]').count()) === 0,
);

// Fresh non-demo shop: fail the one atomic split write. Neither leg may reach disk or a payer.
const splitPage = await browser.newPage({ viewport: { width: 430, height: 1700 } });
const splitErrors = [];
splitPage.on('pageerror', (error) => splitErrors.push(String(error)));
await splitPage.goto(`${BASE}/?cb=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await splitPage.waitForSelector('h1');
for (const [label, publicKey] of [
  ['First wallet', ZPUB],
  [
    'Second wallet',
    'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
  ],
]) {
  await showPanel(splitPage, 'wallets');
  await splitPage.locator('#ct-label').fill(label);
  await splitPage.locator('#ct-xpub').fill(publicKey);
  await splitPage.waitForSelector('ol li code');
  await splitPage.getByLabel(/I opened my wallet/).check();
  await splitPage.getByRole('button', { name: 'Save counter' }).click();
  await splitPage.waitForTimeout(300);
}
await showPanel(splitPage, 'till');
await splitPage.locator('#tl-custom').fill('10.00');
await splitPage.locator('#tl-rate').fill('60000.00');
await splitPage.locator('#tl-split').check();
const splitWallet = splitPage.locator('#tl-split-wallet option[value]:not([value=""])');
await splitPage
  .locator('#tl-split-wallet')
  .selectOption(await splitWallet.first().getAttribute('value'));
await splitPage.locator('#tl-split-pct').fill('40');
await splitPage.evaluate(() => {
  window.__ledgerWrites = 0;
  window.__payMessages = [];
  const channel = new BroadcastChannel('slip-display');
  channel.onmessage = (event) => {
    if (event.data.kind === 'pay') window.__payMessages.push(event.data);
  };
  window.__displayObserver = channel;
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function failSecondLeg(key, value) {
    if (key === 'slip.ledger.v1' && ++window.__ledgerWrites === 1)
      throw new DOMException('full', 'QuotaExceededError');
    return original.call(this, key, value);
  };
});
await splitPage.locator('#tl-charge').click();
await splitPage.locator('[data-save-warning]').waitFor({ state: 'visible' });
const splitState = await splitPage.evaluate(() => ({
  writes: window.__ledgerWrites,
  messages: window.__payMessages,
  ledger: JSON.parse(localStorage.getItem('slip.ledger.v1')),
}));
check(
  'failure injection reached the single atomic split write',
  splitState.writes === 1 && (splitState.ledger?.invoices.length ?? 0) === 0,
  JSON.stringify(splitState),
);
check(
  'second-leg failure shows no till payment QR',
  (await splitPage.locator('#tl-pay').count()) === 0,
);
check('second-leg failure publishes no customer pay display', splitState.messages.length === 0);
check(
  'second-leg failure retains custom cart amount',
  (await splitPage.locator('#tl-custom').count()) > 0 &&
    (await splitPage.locator('#tl-custom').inputValue()) === '10.00',
);
check('no split runtime errors', splitErrors.length === 0, splitErrors.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nStore-failure checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
