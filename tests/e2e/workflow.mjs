#!/usr/bin/env node
/**
 * The counter batch: the waiting strip, opening and closing the till, scanning into the cart, and
 * the sound switch.
 *
 * These are the things a cashier does a hundred times a day, so the assertions are about what is on
 * screen at that moment — not about the modules underneath, which the unit tests cover.
 *
 * Usage: node tests/e2e/workflow.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const NOW_MS = Date.now();
const agoMin = (m) => new Date(NOW_MS - m * 60_000).toISOString();
const inMin = (m) => new Date(NOW_MS + m * 60_000).toISOString();

const wallet = {
  id: 'w1',
  label: 'Front counter',
  xpub: ZPUB,
  coin: 'btc',
  networkId: 'btc-mainnet',
  scriptType: 'p2wpkh',
  source: 'xpub',
  colour: 'orange',
  purpose: 'till',
  note: '',
  fingerprintHex: '7ef32bdb',
  prefix: 'zpub',
  firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  acknowledgedAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
  staffName: null,
  nextIndex: 2,
};

const openInvoice = {
  id: 'inv_waiting',
  walletId: 'w1',
  walletLabel: 'Front counter',
  address: 'bc1qwaitingaddress4kr609gcawutmrza0j4xv80jy8',
  index: 1,
  amountAtoms: '2500',
  amountMinor: '600',
  currency: 'USD',
  rateMinorPerCoin: '6000000',
  rateAt: agoMin(6),
  lines: [],
  createdAt: agoMin(6),
  expiresAt: inMin(9),
  status: 'awaiting',
  seenAt: null,
  confirmedAt: null,
  manual: false,
  note: '',
};

await context.addInitScript(
  ([account, invoices]) => {
    if (window.localStorage.getItem('slip.workflow.seeded') === '1') return;
    const stamp = new Date().toISOString();
    window.localStorage.setItem('slip.workflow.seeded', '1');
    window.localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({ version: 1, accounts: [account], activeAccountId: 'w1', pinHash: null, savedAt: stamp }),
    );
    window.localStorage.setItem(
      'slip.settings.v1',
      JSON.stringify({
        businessName: 'Test Café',
        currency: 'USD',
        taxBps: 0,
        taxInclusive: false,
        tipPresetsBps: [0, 1000],
        receiptFooter: 'Thanks',
        explorerUrl: '',
        rateEndpoint: '',
        autoRate: false,
        staff: [{ name: 'Ana', walletId: 'w1' }],
        language: 'en',
        onboardedAt: stamp,
      }),
    );
    window.localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, template: 'cafe', active: true },
          { id: 'i2', name: 'Croissant', priceMinor: '400', priceCurrency: 'FIAT', category: 'Food', emoji: '🥐', taxBps: 0, sort: 2, template: 'cafe', active: true },
        ],
        invoices,
        requests: [],
        books: {},
        watches: [],
        anchors: [],
        refunds: [],
      }),
    );
  },
  [wallet, [openInvoice]],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

// The public explorer is stubbed, and this address stays unpaid: the sale must remain waiting.
await page.route('https://mempool.space/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  });
});

await page.goto(`${BASE}#till`, { waitUntil: 'domcontentloaded' });
await showPanel(page, 'till');

// --- the waiting strip -------------------------------------------------------
const strip = page.locator('[data-awaiting]');
await strip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
check('an open sale shows in the waiting strip', (await strip.count()) > 0);

const stripText = (await strip.count()) > 0 ? (await strip.innerText()).replace(/\s+/g, ' ') : '';
check('the strip names the age, not just the amount', /6 min/.test(stripText), stripText);
check('the strip says what it is', /waiting to be paid/i.test(stripText), stripText);

// Money waiting outranks admin: the strip must sit above the till card, not below it.
const order = await page.evaluate(() => {
  const strip = document.querySelector('[data-awaiting]');
  const shift = document.querySelector('[data-shift]');
  if (!strip || !shift) return null;
  return Math.sign(strip.getBoundingClientRect().top - shift.getBoundingClientRect().top);
});
check('money waiting sits above opening the till', order === -1, String(order));

// Tapping it must land on that sale's payment screen, not on a fresh cart.
if ((await strip.count()) > 0) {
  await strip.locator('button').first().click();
  await page.waitForSelector('text=Pay exactly', { timeout: 10_000 });
  const payment = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('tapping the strip reopens that sale', /bc1qwaitingaddress/.test(payment));
  check('reopening keeps the amount that was quoted', /2,500 sats/.test(payment), payment.slice(0, 120));

  await page.getByRole('button', { name: /cancel sale/i }).click();
  await showPanel(page, 'till');
}

// A cancelled sale must leave the strip: a "waiting" line for a dead invoice is a lie.
await page.waitForTimeout(300);
check('a cancelled sale leaves the strip', (await page.locator('[data-awaiting]').count()) === 0);

// --- opening and closing the till -------------------------------------------
const closed = page.locator('[data-shift="closed"]');
await closed.waitFor({ state: 'visible', timeout: 10_000 });
check('a till that was never opened asks to be opened', /Open the till/i.test(await closed.innerText()));

// Collapsed by default: opening the till is admin, and must not push the counter down.
check('the invitation is one line, not a form', (await page.locator('#tl-staff-open').count()) === 0);
await page.getByRole('button', { name: 'Open the till' }).click();
await page.waitForSelector('#tl-staff-open', { timeout: 10_000 });

await page.fill('#tl-staff-open', 'Ana');
await page.fill('#tl-float', '120.00');
await page.getByRole('button', { name: 'Open the till' }).click();

const opened = page.locator('[data-shift="open"]');
await opened.waitFor({ state: 'visible', timeout: 10_000 });
const openedText = (await opened.innerText()).replace(/\s+/g, ' ');
check('opening names who is on', /Ana has the till/.test(openedText), openedText);
check('opening keeps the float that was counted', /120\.00 USD/.test(openedText), openedText);

await page.getByRole('button', { name: 'Close the till' }).click();
await page.locator('[data-shift="closed"]').waitFor({ state: 'visible', timeout: 10_000 });
check('closing returns the till to its unopened state', true);

// The opening and closing must be in the hashed log, not only in React state.
const shiftLog = await page.evaluate(() => window.localStorage.getItem('slip.shifts.v1') ?? '');
check(
  'opening and closing were written to the shift log',
  /"kind":"open"/.test(shiftLog) && /"kind":"return"/.test(shiftLog),
  shiftLog.slice(0, 160),
);

// --- scanning into the cart --------------------------------------------------
await page.getByRole('button', { name: 'Scan', exact: true }).click();
await page.waitForSelector('#tl-scan', { timeout: 10_000 });
await page.fill('#tl-scan', 'Espresso');
await page.press('#tl-scan', 'Enter');
await page.waitForTimeout(250);
const scanNote = (await page.locator('[data-scan="open"]').innerText()).replace(/\s+/g, ' ');
check('scanning a known item adds it to the sale', /Espresso added/.test(scanNote), scanNote);

await page.fill('#tl-scan', 'not-a-real-product');
await page.press('#tl-scan', 'Enter');
await page.waitForTimeout(250);
const missNote = (await page.locator('[data-scan="open"]').innerText()).replace(/\s+/g, ' ');
check('an unknown code says so instead of guessing', /nothing in your catalog/i.test(missNote), missNote);

// A plain amount is an amount, not a product code.
await page.fill('#tl-scan', '12.50');
await page.press('#tl-scan', 'Enter');
await page.waitForTimeout(250);
const value = await page.inputValue('#tl-custom').catch(() => '');
check('a scanned amount lands in the custom field', value === '12.50', value);

// --- the sound switch --------------------------------------------------------
await showPanel(page, 'assist');
const assist = page.locator('[data-panel="assist"]');
const assistText = (await assist.innerText()).replace(/\s+/g, ' ');
check('the chime has a switch a merchant can find', /Chime when money lands/i.test(assistText));
check('the chime is grouped with making the counter quiet', /Quiet the counter/i.test(assistText));

check('no runtime errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nWorkflow checks passed.');
