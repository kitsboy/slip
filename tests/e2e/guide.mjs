#!/usr/bin/env node
/**
 * The self-updating layer: the manual, the tamper-evident footer, freshness, parked tabs and
 * repeat-last.
 *
 * Usage: node tests/e2e/guide.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 } });

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
        rateEndpoint: 'https://rates.example/prices', autoRate: true, staff: [],
        language: 'en', onboardedAt: stamp,
      }),
    );
    localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [{ id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, active: true }],
        invoices: [{
          id: 'inv_seed', walletId: 'w1', walletLabel: 'Front counter',
          address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', index: 0, amountAtoms: '17084',
          amountMinor: '1025', currency: 'USD', rateMinorPerCoin: '6000000', rateAt: day + 'T09:00:00.000Z',
          lines: [], createdAt: day + 'T09:00:00.000Z', expiresAt: day + 'T09:15:00.000Z',
          status: 'complete', seenAt: day + 'T09:01:00.000Z', confirmedAt: day + 'T09:01:00.000Z',
          manual: false, note: '',
        }],
        requests: [], books: {}, watches: [], anchors: [], refunds: [],
      }),
    );
  },
  [ZPUB, today],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});
await page.route('https://rates.example/prices', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ USD: 60_000 }) }),
);
await page.route('https://mempool.space/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: { funded_txo_sum: 17_084, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  }),
);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(1000);

// --- the tamper-evident footer ------------------------------------------------------
const seal = page.locator('[data-book-seal]').first();
check('the footer carries today’s book digest', (await seal.count()) === 1);
const sealBefore = await seal.getAttribute('data-book-seal');
check('the digest is hex, not a placeholder', /^[0-9a-f]{8}$/.test(sealBefore ?? ''), String(sealBefore));

// --- freshness ----------------------------------------------------------------------
const fresh = page.locator('[data-freshness]').first();
check('the fetched rate carries a freshness ring', (await fresh.count()) >= 1);
check('a rate read seconds ago is fresh', (await fresh.getAttribute('data-freshness')) === 'fresh');

// --- the manual ---------------------------------------------------------------------
await showPanel(page, 'manual');
const manual = page.locator('[data-panel="manual"]');
await manual.scrollIntoViewIfNeeded();
const entries = await manual.locator('[data-manual-entry]').count();
check('the manual renders every entry', entries >= 12, String(entries));
const allText = await manual.innerText();
check('each card states its limit', (allText.match(/Limit:/g) ?? []).length >= 10);

// The customer QR used to be drawn at its own pixel size inside a fixed box, so it painted wider than the
// box and crossed the paragraph beside it. Size is the box's job: measure it, and decode it, because a
// code that is visible but unscannable is the same failure as an invisible one.
const qr = await page.evaluate(() => {
  const box = document.querySelector('[data-manual-qr]');
  if (!box) return null;
  const svg = box.querySelector('svg');
  const para = box.parentElement.querySelector('p');
  const r = (el) => el.getBoundingClientRect();
  const B = r(box), S = r(svg), P = r(para);
  return {
    inside: S.left >= B.left - 0.5 && S.top >= B.top - 0.5 && S.right <= B.right + 0.5 && S.bottom <= B.bottom + 0.5,
    clearsText: S.right <= P.left,
    px: Math.round(S.width),
  };
});
check('the customer QR is drawn inside its own box', Boolean(qr) && qr.inside, JSON.stringify(qr));
check('the customer QR does not cross the words beside it', Boolean(qr) && qr.clearsText, JSON.stringify(qr));
check('the customer QR is big enough to scan', Boolean(qr) && qr.px >= 100, `${qr?.px ?? 0}px`);

// The code on the page is a screen size. The sheet it prints is a paper size — 92mm — and that is the one a
// customer actually scans, so measure the sheet, not the pocket.
const [sheet] = await Promise.all([
  page.waitForEvent('popup'),
  page.locator('[data-manual-qr]').click(),
]);
await sheet.waitForLoadState('domcontentloaded');
await sheet.waitForTimeout(400);
const sheetInfo = await sheet.evaluate(() => {
  const style = document.querySelector('style')?.textContent ?? '';
  const svg = document.querySelector('.qr svg');
  const r = svg ? svg.getBoundingClientRect() : null;
  const text = document.body.innerText;
  return {
    a4: /size:\s*A4/.test(style),
    mm: /width:\s*92mm/.test(style),
    px: r ? Math.round(r.width) : 0,
    saysMoney: /goes straight into the shop/.test(text),
    saysReceipt: /Nothing is emailed/.test(text),
    link: /explain=1/.test(text),
  };
});
check('the customer sheet is an A4 page', sheetInfo.a4);
check('the sheet draws the code at 92mm, not at screen size', sheetInfo.mm && sheetInfo.px >= 300, `${sheetInfo.px}px`);
check('the sheet says who holds the money', sheetInfo.saysMoney);
check('the sheet says why nothing is emailed', sheetInfo.saysReceipt);
check('the sheet carries the link in words, for a phone that will not scan', sheetInfo.link);
await sheet.close();
await page.locator('#mn-search').fill('lightning');
await page.waitForTimeout(200);
check('search narrows the manual', (await manual.locator('[data-manual-entry]').count()) < entries);
check('searching "lightning" finds the lightning card', (await manual.locator('[data-manual-entry="lightning"]').count()) === 1);
await page.locator('#mn-search').fill('nothingmatches');
check('an empty search says so in plain words', /Nothing matches/.test(await manual.innerText()));
await page.locator('#mn-search').fill('');

// --- parked tabs --------------------------------------------------------------------
await showPanel(page, 'till');
const till = page.locator('[data-panel="till"]');
await till.scrollIntoViewIfNeeded();
await page.locator('button:has-text("Espresso")').first().click();
await page.locator('#tl-rate').fill('60000.00');
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'park sale' }).click();
await page.waitForTimeout(250);
check('parking a sale creates a tab', (await till.locator('[data-tabs]').getAttribute('data-tabs')) === '1');
check('parking clears the cart', (await page.locator('li:has-text("Espresso")').count()) === 0);
check('the tab says what it holds', /1× Espresso/.test(await till.innerText()), (await till.innerText()).slice(0, 200));

// resume it
await till.locator('[data-tabs] button').first().click();
await page.waitForTimeout(250);
check('resuming restores the cart', (await page.locator('li:has-text("Espresso")').count()) === 1);
check('the tab is consumed on resume', (await page.locator('[data-tabs]').count()) === 0);

// --- a sale, then repeat last -------------------------------------------------------
await page.getByRole('button', { name: /^charge/i }).click();
await page.waitForSelector('text=Pay exactly');
await page.getByRole('button', { name: /I have the money/ }).click();
await page.waitForSelector('text=Receipt');
await page.getByRole('button', { name: 'Next sale' }).click();
await page.waitForTimeout(400);
check('after a sale, repeat last is offered', (await page.getByRole('button', { name: 'repeat last' }).count()) === 1);
await page.getByRole('button', { name: 'repeat last' }).click();
await page.waitForTimeout(250);
check('repeat last restores the same lines', (await page.locator('li:has-text("Espresso")').count()) === 1);

// --- and the footer changes when the books change -----------------------------------
const sealAfter = await page.locator('[data-book-seal]').first().getAttribute('data-book-seal');
check('the digest moved when a sale landed', sealAfter !== sealBefore, `${sealBefore} → ${sealAfter}`);

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(failures === 0 ? '\nGuide checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
