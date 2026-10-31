#!/usr/bin/env node
/**
 * Assistance: the switches that keep the screen quiet, the explanation popover, rehearsal mode,
 * the self test, the handover note and the printable counter card.
 *
 * Usage: node tests/e2e/assist.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const CHROME = execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1500 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const today = new Date().toISOString().slice(0, 10);
await context.addInitScript(
  ([zpub, day]) => {
    const stamp = new Date().toISOString();
    localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({
        version: 1,
        accounts: [{
          id: 'w1', label: 'Front counter', xpub: zpub, coin: 'btc', networkId: 'btc-mainnet',
          scriptType: 'p2wpkh', source: 'xpub', colour: 'blue', purpose: 'till', note: '',
          fingerprintHex: '7ef32bdb', prefix: 'zpub',
          firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
          acknowledgedAt: stamp, createdAt: stamp, staffName: null, nextIndex: 1,
        }],
        activeAccountId: 'w1', pinHash: null, savedAt: stamp,
      }),
    );
    localStorage.setItem(
      'slip.settings.v1',
      JSON.stringify({
        businessName: 'Café Nord', currency: 'USD', taxBps: 0, taxInclusive: false,
        tipPresetsBps: [0, 1000], receiptFooter: 'Thanks', explorerUrl: '',
        rateEndpoint: '', autoRate: false, staff: [], language: 'en', onboardedAt: stamp,
      }),
    );
    localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [{ id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, active: true }],
        invoices: [],
        requests: [], books: {}, watches: [], anchors: [], refunds: [],
      }),
    );
    void day;
  },
  [ZPUB, today],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});
await page.route('https://mempool.space/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chain_stats: {}, mempool_stats: {} }) }),
);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(800);

// --- the switches -------------------------------------------------------------------
const assistPanel = page.locator('[data-panel="assist"]');
await assistPanel.scrollIntoViewIfNeeded();
check('assistance switches exist in Settings', (await assistPanel.count()) === 1);
const switches = await assistPanel.locator('input[type="checkbox"]').count();
check('every assistance choice has a switch', switches >= 6, String(switches));
check('rehearsal starts OFF', !(await page.locator('#as-rehearsal').isChecked()));
check('explanations start ON', await page.locator('#as-explainNumbers').isChecked());

// --- explain a number ---------------------------------------------------------------
const till = page.locator('[data-panel="till"]');
await till.scrollIntoViewIfNeeded();
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('#tl-rate').fill('60000.00');
await page.waitForTimeout(300);
const explainButton = till.locator('button[aria-label*="amount to ask"]').first();
check('the charge figure offers an explanation', (await explainButton.count()) === 1);
await explainButton.click();
await page.waitForTimeout(200);
const popover = page.locator('[data-explain="charge"]');
check('tapping it explains in plain words', (await popover.count()) === 1);
const popText = (await popover.innerText()).toLowerCase();
check('the explanation carries its caveat', /rounding|never short/.test(popText), popText.slice(0, 200));

// --- turning explanations off removes the noise --------------------------------------
await assistPanel.scrollIntoViewIfNeeded();
await page.locator('#as-explainNumbers').uncheck();
await page.locator('[data-panel="settings"]').getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(500);
check('switching explanations off removes the tap targets', (await page.locator('button[aria-label*="amount to ask"]').count()) === 0);

// --- rehearsal mode -----------------------------------------------------------------
await page.locator('#as-rehearsal').check();
await page.locator('[data-panel="settings"]').getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(600);
await till.scrollIntoViewIfNeeded();
const chargeLabel = await page.getByRole('button', { name: /^(charge|rehearse)/i }).innerText();
check('the charge button becomes a rehearsal', /rehearse/i.test(chargeLabel), chargeLabel);
await page.getByRole('button', { name: /rehearse/i }).click();
await page.waitForSelector('text=Pay exactly');
check('a rehearsal says nothing is being watched', /nothing is being watched/.test(await page.locator('body').innerText()));
await page.getByRole('button', { name: /I have the money/ }).click();
await page.waitForSelector('text=Receipt');
const rehearsalReceipt = await page.locator('body').innerText();
check('a rehearsal receipt says REHEARSAL', /REHEARSAL — nothing was charged/.test(rehearsalReceipt), rehearsalReceipt.slice(0, 200));
check('a rehearsal writes nothing to the books', (await page.evaluate(() => JSON.parse(window.localStorage.getItem('slip.ledger.v1')).invoices.length)) === 0);
await page.getByRole('button', { name: 'new sale' }).click();
await page.waitForTimeout(300);

// --- self test ----------------------------------------------------------------------
const selfTest = page.locator('[data-panel="selftest"]');
await selfTest.scrollIntoViewIfNeeded();
await selfTest.getByRole('button', { name: 'run the check' }).click();
await page.waitForTimeout(400);
check('the self test passes on this build', (await selfTest.locator('[data-selftest]').getAttribute('data-selftest')) === 'pass');
check('it names five checks', (await selfTest.locator('li').count()) >= 5);

// --- handover note ------------------------------------------------------------------
const counters = page.locator('[data-panel="wallets"]');
await counters.scrollIntoViewIfNeeded();
await page.locator('#ho-staff').fill('Ana');
await page.getByRole('button', { name: 'Hand over' }).click();
await page.waitForTimeout(500);
const handoverText = await counters.innerText();
check('a handover produces a note for the next person', /Handover from|no parked sales|nothing waiting/.test(handoverText), handoverText.slice(-300));

// --- the counter card ---------------------------------------------------------------
const [popup] = await Promise.all([
  page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
  assistPanel.scrollIntoViewIfNeeded().then(() => page.getByRole('button', { name: 'print the counter card' }).click()),
]);
if (popup) {
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  const card = await popup.content();
  check('the counter card carries the three never-rules', /Never/.test(card) && /seed phrase/i.test(card) && /same address twice/i.test(card));
  check('the counter card is black on white', /background: #fff/i.test(card) && /color: #000/i.test(card));
  await popup.close();
} else {
  check('the counter card opens a printable page', false, 'no popup');
}

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(failures === 0 ? '\nAssist checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
