#!/usr/bin/env node
/**
 * Wallets you hold for other people: colour, purpose, notes, and a live balance read from
 * an explorer — with the explorer stubbed, so the test proves the WIRING without a network
 * dependency or a third party seeing anything.
 *
 * Usage: node tests/e2e/wallets.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4180/';
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const GEN_ADDR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const CHROME = chromePath();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

// Stub the explorer: the app must talk to the configured endpoint and nothing else.
let explorerHits = 0;
await page.route('https://mempool.space/**', async (route) => {
  explorerHits += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      chain_stats: { funded_txo_sum: 250_000, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }),
  });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1');

// --- a wallet for someone else: single pubkey, family colour, note -------------
await page.locator('#ct-label').fill("Mum's savings");
await page.locator('#ct-purpose').selectOption('family');
await page.locator('#ct-note').fill('rent account');
await page.getByRole('button', { name: 'Colour Teal' }).click();
await page.locator('#ct-xpub').fill(PUBKEY);
await page.waitForSelector('ol li code');
const preview = await page.locator('ol li code').first().innerText();
check('pubkey derives the BIP-173 vector address', preview.includes(GEN_ADDR), preview);
check(
  'the UI warns that a pubkey is one address',
  /exactly ONE address/.test(await page.locator('body').innerText()),
);

await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save counter' }).click();
await page.waitForTimeout(300);

const card = await page.locator('li:has-text("Mum\'s savings")').first().innerText();
check('wallet shows its purpose', /Family/i.test(card), card.slice(0, 80));
check('wallet shows its note', /rent account/.test(card));
check('wallet shows a colour swatch', (await page.locator('li:has-text("Mum\'s savings") span[style*="background-color"]').count()) > 0);

// --- live balance from the configured explorer --------------------------------
await page.getByRole('button', { name: 'check balance' }).first().click();
await page.waitForTimeout(600);
const balanceText = await page.locator('li:has-text("Mum\'s savings")').first().innerText();
check('balance reads the explorer and formats atoms', /0\.0025 BTC/.test(balanceText), balanceText.slice(0, 160));
check('balance names its source', /mempool\.space/.test(balanceText));
check('balance names a fetch time', /\d{2}:\d{2}/.test(balanceText));
check('exactly one explorer request was made', explorerHits === 1, String(explorerHits));

// --- a second wallet: an xpub till, different colour -------------------------
await page.locator('#ct-label').fill('Shop till');
await page.locator('#ct-purpose').selectOption('till');
await page.getByRole('button', { name: 'Colour Blue' }).click();
await page.locator('#ct-xpub').fill(ZPUB);
// Wait for THIS key's preview, not just any preview: the first wallet's addresses are
// still on screen, so a bare waitForSelector would race past the new derivation.
await page.waitForFunction(() =>
  Array.from(document.querySelectorAll('ol li code')).some((el) =>
    (el.textContent ?? '').startsWith('bc1qcr8te4'),
  ),
);
await page.getByLabel(/I opened my wallet/).check();
await page.getByRole('button', { name: 'Save counter' }).click();
await page.waitForTimeout(400);

const body = await page.locator('body').innerText();
check("two wallets, labelled separately", /Mum's savings/.test(body) && /Shop till/.test(body));

// --- the explorer endpoint is a setting --------------------------------------
await page.locator('#st-explorer').fill('https://node.local/api');
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(200);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#st-explorer');
check('custom explorer persists', (await page.locator('#st-explorer').inputValue()) === 'https://node.local/api');

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: 'screenshots/wallets.png', fullPage: false });
await browser.close();
console.log(failures === 0 ? '\nWallet checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
