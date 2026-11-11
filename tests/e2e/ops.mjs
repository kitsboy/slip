#!/usr/bin/env node
/**
 * The operations batch: day close, CSV, refunds, split payment, Silent Payments, install and
 * offline reconciliation.
 *
 * Seeded from localStorage so the run is about behaviour, and every third party is stubbed
 * locally. The assertions care about wording as much as numbers: a refund that moved money and a
 * deposit that did not are different sentences.
 *
 * Usage: node tests/e2e/ops.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 }, acceptDownloads: true });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const today = new Date().toISOString().slice(0, 10);

// Never seed a fixed wall-clock. An invoice "created" at 09:00 UTC is in the FUTURE when this
// suite runs before 09:00 UTC, and reconciliation deliberately skips future-dated invoices — so
// the sweep found nothing and inv_open stayed 'awaiting'. Anchor the fixture relative to now.
const NOW_MS = Date.now();

// A second time bomb, and a nastier one: "30 minutes ago" is YESTERDAY for the first 30 minutes of
// every UTC day, so the day-close panel — which shows today — counted nothing and this suite went red
// at 00:19 UTC on green code. Keep the fixture inside today, in the past, and 10 minutes wide.
const DAY_START_MS = Date.parse(`${today}T00:00:00.000Z`);
const CREATED_MS = Math.min(Math.max(NOW_MS - 30 * 60_000, DAY_START_MS + 60_000), NOW_MS - 60_000);
const CREATED_AT = new Date(CREATED_MS).toISOString();
const EXPIRES_AT = new Date(CREATED_MS + 45 * 60_000).toISOString();
const SEEN_AT = new Date(CREATED_MS + 60_000).toISOString();
const wallet = (id, label, colour) => ({
  id,
  label,
  xpub: ZPUB,
  coin: 'btc',
  networkId: 'btc-mainnet',
  scriptType: 'p2wpkh',
  source: 'xpub',
  colour,
  purpose: 'till',
  note: '',
  fingerprintHex: '7ef32bdb',
  prefix: 'zpub',
  firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  acknowledgedAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
  staffName: null,
  nextIndex: 1,
});

const invoice = (id, over) => ({
  id,
  walletId: 'w1',
  walletLabel: 'Front counter',
  address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  index: 0,
  amountAtoms: '10000',
  amountMinor: '600',
  currency: 'USD',
  rateMinorPerCoin: '6000000',
  rateAt: CREATED_AT,
  lines: [],
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
  status: 'complete',
  seenAt: SEEN_AT,
  confirmedAt: SEEN_AT,
  manual: false,
  note: '',
  ...over,
});

await context.addInitScript(
  ([w1, w2, invoices, day]) => {
    if (window.localStorage.getItem('slip.ops.seeded') === '1') return;
    const stamp = new Date().toISOString();
    window.localStorage.setItem('slip.ops.seeded', '1');
    window.localStorage.setItem(
      'slip.accounts.v1',
      JSON.stringify({ version: 1, accounts: [w1, w2], activeAccountId: 'w1', pinHash: null, savedAt: stamp }),
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
        staff: [],
        language: 'en',
        onboardedAt: stamp,
      }),
    );
    window.localStorage.setItem(
      'slip.ledger.v1',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'i1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, template: 'cafe' },
        ],
        invoices,
        requests: [],
        books: {},
        watches: [],
        anchors: [],
        refunds: [],
      }),
    );
    void day;
  },
  [
    wallet('w1', 'Front counter', 'orange'),
    wallet('w2', 'Back bar', 'teal'),
    [
      invoice('inv_onchain', {}),
      invoice('inv_manual', { id: 'inv_manual', walletId: 'w2', walletLabel: 'Back bar', amountAtoms: '5000', manual: true }),
      invoice('inv_ln', { id: 'inv_ln', walletId: 'ln:shop@x', walletLabel: 'Lightning', amountAtoms: '7000', note: 'lightning' }),
      // open, and the stub explorer will report it paid: this is the reconciliation case
      invoice('inv_open', { id: 'inv_open', status: 'awaiting', amountAtoms: '2500', confirmedAt: null, seenAt: null, address: 'bc1qopenaddress4kr609gcawutmrza0j4xv80jy8' }),
    ],
    today,
  ],
);

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

await page.route('https://mempool.space/**', async (route) => {
  const url = route.request().url();
  const paid = url.includes('bc1qopenaddress');
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: paid
        ? { funded_txo_sum: 2500, spent_txo_sum: 0, tx_count: 1 }
        : { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');
await page.waitForTimeout(1200);

const body = () => page.locator('body').innerText();

// --- offline reconciliation ---------------------------------------------------------
let text = await body();
check('reconciliation re-checks open sales', /Open sales: .*open sale/.test(text), text.slice(0, 400));
check('a paid open sale becomes confirmed without a human', (await page.evaluate(() => {
  const raw = JSON.parse(window.localStorage.getItem('slip.ledger.v1'));
  return raw.invoices.find((i) => i.id === 'inv_open').status;
})) === 'complete' || text.includes('now paid'));

// --- day close ----------------------------------------------------------------------
await showPanel(page, 'history');
const panel = page.locator('[data-panel="history"]');
await panel.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const counts = await panel.evaluate((el) => ({
  count: el.getAttribute('data-close-count'),
  net: el.getAttribute('data-close-net'),
  observed: el.getAttribute('data-close-observed'),
  manual: el.getAttribute('data-close-manual'),
  onchain: el.getAttribute('data-rail-onchain'),
  lightning: el.getAttribute('data-rail-lightning'),
  railManual: el.getAttribute('data-rail-manual'),
}));
check('the day close counts every completed sale including the swept one', counts.count === '4', JSON.stringify(counts));
check('the day close splits human-confirmed from observed', counts.manual === '5000' && counts.observed === '19500', JSON.stringify(counts));
check(
  'the day close keeps each rail separate',
  counts.onchain === '12500' && counts.lightning === '7000' && counts.railManual === '5000',
  JSON.stringify(counts),
);

// --- the day close on A4 ------------------------------------------------------------
// A till roll is 80mm wide, so a busy day printed on A4 used to be a thin strip down the left edge.
// The A4 sheet must be A4, must carry every sale as a real row, and must keep the honesty note.
const [sheet] = await Promise.all([
  context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
  page.getByRole('button', { name: 'Print on A4' }).click(),
]);
if (sheet) {
  await sheet.waitForLoadState('load');
  const a4 = await sheet.evaluate(() => ({
    style: [...document.querySelectorAll('style')].map((n) => n.textContent).join('').replace(/\s+/g, ' '),
    rows: document.querySelectorAll('tr.sale').length,
    text: document.body.innerText,
  }));
  check('the day close prints as A4 when asked', /@page \{ size: A4/.test(a4.style), a4.style.slice(0, 120));
  check('every counted sale is a row on the sheet', a4.rows === 4, `${a4.rows} rows`);
  check('the A4 sheet keeps the manual-confirmation note', /human confirmation, not an observation/.test(a4.text));
  await sheet.close();
} else {
  check('the day close prints as A4 when asked', false, 'no print window');
}

// --- CSV ----------------------------------------------------------------------------
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.getByRole('button', { name: 'download CSV' }).click(),
]);
check('CSV downloads with a dated filename', Boolean(download) && /slip-sales-\d{4}-\d{2}-\d{2}\.csv/.test(download.suggestedFilename()), download?.suggestedFilename() ?? 'no download');

// --- refunds ------------------------------------------------------------------------
await page.getByRole('button', { name: 'refund' }).first().click();
await page.locator('#rf-atoms').fill('999999');
await page.locator('#rf-reason').fill('too much');
await page.getByRole('button', { name: 'record refund' }).click();
text = await body();
check('a refund larger than the sale is refused', /more than was received/.test(text), text.slice(0, 300));

await page.locator('#rf-atoms').fill('4000');
await page.locator('#rf-reason').fill('wrong order');
await page.getByRole('button', { name: 'record refund' }).click();
await page.waitForTimeout(400);
text = await body();
check('a refund is recorded', /refund recorded: 4000 sats/.test(text), text.slice(0, 400));
check('the refund says slip moved nothing', /did not move any money/.test(text));
check('the refund reaches storage', (await page.evaluate(() => JSON.parse(window.localStorage.getItem('slip.ledger.v1')).refunds.length)) === 1);

// --- split payment ------------------------------------------------------------------
await showPanel(page, 'till');
await page.locator('#tl-split').check();
await page.locator('#tl-split-wallet').selectOption('w2');
await page.locator('#tl-split-pct').fill('40');
await page.locator('#tl-custom').fill('10.00');
await page.locator('#tl-rate').fill('60000.00');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^charge/i }).click();
await page.waitForSelector('text=Pay exactly');
text = await body();
check('a split sale shows a second leg', /second leg/i.test(text), text.slice(0, 400));
check('a split sale says the receipt waits for both', /receipt appears when both legs are paid/.test(text));

// --- silent payments ----------------------------------------------------------------
await page.getByRole('button', { name: 'cancel sale' }).click();
await showPanel(page, 'silentpay');
await page.locator('#sp-addr').fill('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
await page.locator('#sp-addr').press('Enter');
await page.waitForTimeout(200);
text = await page.locator('[data-panel="silentpay"]').innerText();
check('an ordinary address is refused as a silent payment', /ordinary on-chain address/.test(text), text.slice(0, 400));

await page.locator('#sp-addr').fill('sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
await page.locator('#sp-addr').press('Enter');
await page.locator('#sp-amount').fill('5.00');
await page.locator('#sp-rate').fill('60000.00');
await page.getByRole('button', { name: 'show payment QR' }).click();
await page.waitForTimeout(300);
text = await body();
check('a silent payment QR is produced', /sp1 destination/.test(text), text.slice(0, 400));
await page.getByRole('button', { name: /record as paid \(manual\)/ }).click();
await page.waitForTimeout(300);
text = await body();
check('a silent payment is recorded as manual only', /manual confirmation/.test(text) && /cannot watch an sp1 address/.test(text), text.slice(0, 400));

// --- install ------------------------------------------------------------------------
const installState = await page.locator('[data-install]').count();
check('no install button is shown when the browser offers no prompt', installState === 0, String(installState));

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nOps checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
