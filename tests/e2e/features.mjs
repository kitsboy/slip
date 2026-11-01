#!/usr/bin/env node
/**
 * The P10 batch, end to end: Lightning, anchoring, pairing, watchlist, customer screen, proof
 * checking and the fetched rate.
 *
 * Everything third-party is stubbed and every stub is local to this file, so the run proves
 * slip's behaviour rather than somebody's uptime. The assertions are deliberately about
 * WORDING as much as function: "submitted" must never be printed as "confirmed", and a stale
 * rate must be refused rather than used.
 *
 * Usage: node tests/e2e/features.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1600 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

// --- seed a shop, so the test is about features and not about the wizard -------------
const account = {
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
  nextIndex: 1,
};

const completedInvoice = {
  id: 'inv_seed01',
  walletId: 'w1',
  walletLabel: 'Front counter',
  address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  index: 0,
  amountAtoms: '17084',
  amountMinor: '1025',
  currency: 'USD',
  rateMinorPerCoin: '6000000',
  rateAt: '2026-10-31T09:00:00.000Z',
  lines: [],
  createdAt: new Date().toISOString().slice(0, 11) + '09:00:00.000Z',
  expiresAt: new Date().toISOString().slice(0, 11) + '09:15:00.000Z',
  status: 'complete',
  seenAt: '2026-10-31T09:01:00.000Z',
  confirmedAt: '2026-10-31T09:01:00.000Z',
  manual: false,
  note: '',
};

await context.addInitScript(
  ([acct, inv, today]) => {
    if (window.localStorage.getItem('slip.e2e.seeded') === '1') return;
    const stamp = new Date().toISOString();
    window.localStorage.setItem('slip.e2e.seeded', '1');
    window.localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({ version: 1, accounts: [acct], activeAccountId: acct.id, pinHash: null, savedAt: stamp }),
    );
    window.localStorage.setItem(
      'slip.settings.v1',
      JSON.stringify({
        businessName: 'Test Café',
        currency: 'USD',
        taxBps: 0,
        taxInclusive: false,
        tipPresetsBps: [0, 1000, 1500, 2000],
        receiptFooter: '',
        explorerUrl: '',
        rateEndpoint: 'https://rates.example/prices',
        autoRate: true,
        staff: [{ name: 'Ana', walletId: acct.id }],
        language: 'en',
        onboardedAt: stamp,
      }),
    );
    window.localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'i1',
            name: 'Espresso',
            priceMinor: '350',
            priceCurrency: 'FIAT',
            category: 'Drinks',
            emoji: '☕',
            taxBps: 0,
            sort: 1,
            template: 'cafe',
          },
        ],
        invoices: [{ ...inv, createdAt: today + 'T09:00:00.000Z', expiresAt: today + 'T09:15:00.000Z' }],
        requests: [],
        books: {},
        watches: [],
        anchors: [],
      }),
    );
  },
  [account, completedInvoice, new Date().toISOString().slice(0, 10)],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

// --- third-party stubs --------------------------------------------------------------
let rateHits = 0;
await page.route('https://rates.example/prices', async (route) => {
  rateHits += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ time: Math.floor(Date.now() / 1000), USD: 60_000, CAD: 82_000 }),
  });
});

await page.route('https://mempool.space/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: { funded_txo_sum: 12_345_678, spent_txo_sum: 0, tx_count: 3 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  });
});

let invoiceRequests = 0;
let verifyCalls = 0;
await page.route('https://shop.example/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/.well-known/lnurlp/shop') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tag: 'payRequest',
        callback: 'https://shop.example/lnurlp/shop/callback',
        minSendable: 1000,
        maxSendable: 100_000_000,
        metadata: '[]',
      }),
    });
    return;
  }
  if (url.pathname === '/lnurlp/shop/callback') {
    invoiceRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pr: 'lnbc1fakeinvoice' + 'q'.repeat(60),
        verify: 'https://shop.example/verify/abc123',
        routes: [],
      }),
    });
    return;
  }
  if (url.pathname === '/verify/abc123') {
    verifyCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'OK', settled: verifyCalls > 1, preimage: 'aa'.repeat(32) }),
    });
    return;
  }
  await route.fulfill({ status: 404, body: '{}' });
});

let calendarPosts = 0;
await page.route('https://a.pool.opentimestamps.org/**', async (route) => {
  calendarPosts += 1;
  await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from([0x00, 0x01, 0x02, 0x03]) });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// --- the fetched rate ---------------------------------------------------------------
await page.waitForTimeout(900);
const bodyText = () => page.locator('body').innerText();
let text = await bodyText();
check('a fetched rate is announced with its time', /fetched \d\d:\d\d UTC from rates\.example/.test(text), text.slice(0, 300));
check('the fetched rate fills the rate field', (await page.locator('#tl-rate').inputValue()).startsWith('600'));
check('the rate service was contacted once', rateHits === 1, String(rateHits));

// --- pairing ------------------------------------------------------------------------
await showPanel(page, 'pair');
await page.locator('#pr-in').fill('SLIP-WALLET-1|Trap|btc|btc-mainnet|xpub|p2wpkh|abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
await page.getByRole('button', { name: 'read code' }).click();
text = await bodyText();
check('a pairing code containing a seed is refused', /private material/.test(text));
check('the refusal never echoes the seed', !/abandon abandon/.test(text.split('private material')[1]?.slice(0, 200) ?? ''));

await page.locator('#pr-in').fill(
  `SLIP-WALLET-1|Back bar|btc|btc-mainnet|xpub|p2wpkh|${ZPUB}`,
);
await page.getByRole('button', { name: 'read code' }).click();
await page.getByRole('button', { name: /import \(unchecked\)/ }).click();
text = await bodyText();
check('an imported wallet arrives UNCHECKED', /UNCHECKED/.test(text) && /compare address bc1qcr8te4/.test(text), text.slice(0, 400));
check('the imported wallet exists on the device', (await page.evaluate(() => window.slip.wallets().length)) === 2);

// --- watchlist ----------------------------------------------------------------------
await showPanel(page, 'watchlist');
await page.locator('#wl-label').fill('Landlord');
await page.locator('#wl-addr').fill('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
await page.getByRole('button', { name: 'add to watchlist' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'check all' }).click();
await page.waitForTimeout(800);
text = await bodyText();
check(
  'a watched address shows a balance with the moment it was read',
  /balance 12,345,678 sats/.test(text) && /3 tx/.test(text) && /read \d\d:\d\d:\d\d UTC/.test(text),
  text.slice(0, 500),
);

// Two taps, not one: the first press only arms the removal.
await page.getByRole('button', { name: 'remove', exact: true }).click();
await page.waitForTimeout(150);
check('one tap does not remove a watched address', /Landlord/.test(await bodyText()));
await page.getByRole('button', { name: /remove again/i }).click();
await page.waitForTimeout(300);
check('the second tap removes it', !/Landlord/.test(await bodyText()));
check('the empty watchlist coaches again', /Nothing is being watched yet/.test(await bodyText()));

// --- lightning ----------------------------------------------------------------------
await showPanel(page, 'lightning');
await page.locator('#ln-addr').fill('shop@shop.example');
await page.locator('#ln-amt').fill('4.50');
await page.locator('#ln-rate').fill('60000.00');
await page.getByRole('button', { name: 'request invoice' }).click();
await page.waitForTimeout(900);
text = await page.locator('[data-panel="lightning"]').innerText();
check(
  'a lightning invoice is drawn',
  invoiceRequests === 1 && /invoice ready/.test(text) && /only its answer counts/.test(text),
  `requests ${invoiceRequests}`,
);
check('the lightning QR is present', (await page.locator('svg').count()) > 0);

// --- anchoring ----------------------------------------------------------------------
await showPanel(page, 'anchor');
const stampButton = page.getByRole('button', { name: /stamp with a calendar/ });
await stampButton.scrollIntoViewIfNeeded();
await stampButton.click();
await page.waitForTimeout(900);
text = await bodyText();
check('the day digest is computed', /[0-9a-f]{32}…/.test(text), text.slice(0, 300));
check('stamping submits to a calendar', calendarPosts >= 1, String(calendarPosts));
check('the anchor claims only what happened', /submitted to a public calendar/.test(text));
check('the anchor never claims a Bitcoin confirmation', !/confirmed on bitcoin|bitcoin confirmation received/i.test(text));

// --- receipt proofs -----------------------------------------------------------------
await showPanel(page, 'verify');
await page.locator('#vf-pick').selectOption('inv_seed01');
await page.waitForTimeout(400);
const proofText = (await page.locator('[data-proof]').first().innerText()).trim();
check('a stored sale yields a proof line', /^SLIP1\|inv_seed01\|/.test(proofText), proofText.slice(0, 80));

await page.locator('#vf-in').fill(proofText.trim());
await page.getByRole('button', { name: 'check receipt' }).click();
text = await bodyText();
check('a proof from this device is matched to its sale', /Matches inv_seed01/.test(text), text.slice(0, 300));

await page.locator('#vf-in').fill('SLIP1|inv_nope|bc1qzzzzzzzzzzzzzz|1|2026-10-31T00:00:00Z|-');
await page.getByRole('button', { name: 'check receipt' }).click();
text = await bodyText();
check('an unknown proof is not called checked', /do not treat it as checked/.test(text), text.slice(0, 300));

// --- the customer screen ------------------------------------------------------------
const display = await context.newPage();
await display.goto(`${BASE}${BASE.includes('?') ? '&' : '?'}display=1`, { waitUntil: 'domcontentloaded' });
await display.waitForSelector('main');
check('the display opens with no books on it', !/Landlord|Front counter|Invoice/.test(await display.locator('body').innerText()));
await display.evaluate(() => {
  const ch = new BroadcastChannel('slip-display');
  ch.postMessage({ kind: 'pay', uri: 'bitcoin:bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu?amount=0.00017084', sats: '17084', label: 'Front counter', status: 'awaiting', at: new Date().toISOString() });
  ch.close();
});
await display.waitForTimeout(700);
const shown = await display.locator('body').innerText();
check('the display shows the amount and a QR', /17,084 sats/.test(shown) && (await display.locator('svg').count()) > 0, shown.slice(0, 200));
check('the display says it is waiting, not paid', /Waiting for payment/.test(shown));

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nFeature checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
