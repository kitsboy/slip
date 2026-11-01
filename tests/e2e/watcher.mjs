#!/usr/bin/env node
/**
 * The watcher proves money is spotted from a panel that is not the till.
 *
 * Before this, reconciliation lived inside the till component: a merchant reading the books or the
 * watchlist never learned a sale had landed. This suite seeds one open invoice, opens the app on
 * **Books**, and asserts the invoice flips to paid without the till ever being shown.
 *
 * Usage: node tests/e2e/watcher.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const WATCH_ADDRESS = 'bc1qwatchaddress4kr609gcawutmrza0j4xv80jy8z';

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1200 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const NOW = Date.now();
const agoMin = (m) => new Date(NOW - m * 60_000).toISOString();
const inMin = (m) => new Date(NOW + m * 60_000).toISOString();

await context.addInitScript(
  ([address, created, expires]) => {
    if (window.localStorage.getItem('slip.watcher.seeded') === '1') return;
    const stamp = new Date().toISOString();
    window.localStorage.setItem('slip.watcher.seeded', '1');
    window.localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({
        version: 1,
        accounts: [
          {
            id: 'w1',
            label: 'Front counter',
            xpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
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
            acknowledgedAt: stamp,
            createdAt: stamp,
            staffName: null,
            nextIndex: 2,
          },
        ],
        activeAccountId: 'w1',
        pinHash: null,
        savedAt: stamp,
      }),
    );
    window.localStorage.setItem(
      'slip.settings.v1',
      JSON.stringify({
        businessName: 'Watcher Café',
        currency: 'USD',
        taxBps: 0,
        taxInclusive: false,
        tipPresetsBps: [0],
        receiptFooter: '',
        explorerUrl: '',
        rateEndpoint: '',
        autoRate: false,
        staff: [],
        language: 'en',
        onboardedAt: stamp,
      }),
    );
    window.localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [],
        invoices: [
          {
            id: 'inv_watch',
            walletId: 'w1',
            walletLabel: 'Front counter',
            address,
            index: 0,
            amountAtoms: '12000',
            amountMinor: '720',
            currency: 'USD',
            rateMinorPerCoin: '6000000',
            rateAt: created,
            lines: [],
            createdAt: created,
            expiresAt: expires,
            status: 'awaiting',
            seenAt: null,
            confirmedAt: null,
            manual: false,
            note: '',
          },
        ],
        requests: [],
        books: {},
        watches: [],
        anchors: [],
        refunds: [],
      }),
    );
  },
  [WATCH_ADDRESS, agoMin(20), inMin(20)],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

// The explorer reports the watched address as paid and mined.
await page.route('https://mempool.space/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: { funded_txo_sum: 12000, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  });
});

// Open on Books — deliberately NOT the till.
await page.goto(`${BASE.replace(/\/$/, '')}/#history`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 15000 });

const tillVisible = await page.evaluate(() => {
  const el = document.querySelector('[data-panel="till"]');
  return !!el && el.offsetHeight > 0;
});
check('the run starts on Books, not the till', !tillVisible);

const statusOf = () =>
  page.evaluate(() => {
    const raw = JSON.parse(window.localStorage.getItem('slip.ledger.v1') ?? '{}');
    return raw.invoices?.find((i) => i.id === 'inv_watch')?.status ?? 'missing';
  });

let status = 'awaiting';
for (let i = 0; i < 24; i++) {
  status = await statusOf();
  if (status !== 'awaiting') break;
  await page.waitForTimeout(1000);
}
check(`a sale is spotted while the books are open (status: ${status})`, status === 'complete' || status === 'confirmed', status);

const stillTillHidden = await page.evaluate(() => {
  const el = document.querySelector('[data-panel="till"]');
  return !!el && el.offsetHeight > 0;
});
check('the till was never opened to achieve it', !stillTillHidden);
check('no runtime errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(failures === 0 ? '\nWatcher checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
