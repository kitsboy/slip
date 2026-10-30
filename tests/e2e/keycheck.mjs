#!/usr/bin/env node
/**
 * Proves the BUILT artifact (dist/index.html, opened over file://) derives the right
 * addresses in a real browser — not just that the source modules pass unit tests.
 *
 * Checks the official BIP-84 vector through the actual UI:
 *   zpub6rFR7y4Q… → address 0/0 must read bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
 *
 * Usage: node tests/e2e/keycheck.mjs
 */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const EXPECTED_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const SEED_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const dist = resolve('dist/index.html');
if (!existsSync(dist)) {
  console.error('dist/index.html missing — run `npm run build` first');
  process.exit(1);
}

const CHROME =
  process.env.SLIP_CHROME ??
  execSync('find /root/.cache/ms-playwright -name chrome -type f | head -1', {
    encoding: 'utf8',
  }).trim();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1200 } });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

await page.goto(`file://${dist}`);

// 1. It renders, offline, from disk.
check('renders from file://', (await page.locator('h1').innerText()).length > 0);

// 2. Official vector through the real UI.
await page.fill('#xpub', ZPUB);
await page.waitForSelector('ol li code');
const first = await page.locator('ol li code').first().innerText();
check('derives BIP-84 address 0/0', first === EXPECTED_0, `got ${first}`);
const count = await page.locator('ol li code').count();
check('shows five preview addresses', count === 5, `got ${count}`);

// 3. A seed phrase is refused, and the refusal never repeats the words.
await page.fill('#xpub', SEED_PHRASE);
await page.waitForSelector('[role="alert"]');
const alertText = await page.locator('[role="alert"]').innerText();
check('refuses a seed phrase', /recovery phrase/.test(alertText), alertText);
check('does not echo the phrase', !/abandon/.test(alertText));
check('no addresses shown for a refusal', (await page.locator('ol li code').count()) === 0);

// 4. Litecoin: same zpub, coin chosen → ltc1 address, never bc1.
await page.fill('#xpub', ZPUB);
await page.getByRole('button', { name: 'Litecoin' }).click();
await page.waitForSelector('ol li code');
const ltcFirst = await page.locator('ol li code').first().innerText();
check('same zpub derives an ltc1 address on Litecoin', ltcFirst.startsWith('ltc1q'), ltcFirst);
check('address differs between coins', ltcFirst !== EXPECTED_0);
check(
  'warns that the prefix is shared',
  /shared between/.test(await page.locator('ul li').first().innerText()),
);

// 5. Zero network requests: a till on a plane must not phone home.
const requests = [];
page.on('request', (r) => requests.push(r.url()));
await page.reload();
await page.waitForSelector('h1');
check('makes no network requests', requests.every((u) => u.startsWith('file://')), requests.join(','));


// 6. Money maths in the real UI: 4.50 USD at 60,000 USD/BTC must charge 7,500 sats,
//    and the zero-decimal currency must not gain decimals.
const ddFor = async (label) =>
  (await page.locator(`div:has(> dt:text-is("${label}")) > dd`).first().innerText()).trim();

const charge = await ddFor('Charge');
check('4.50 USD at 60,000 charges 7,500 sats', charge === '7,500 sats', charge);
const total = await ddFor('Total');
check('total reads 4.50 USD', total === '4.50 USD', total);

await page.selectOption('#pc-currency', 'JPY');
await page.fill('#pc-price', '1500');
await page.fill('#pc-rate', '9000000');
const jpyCharge = await ddFor('Charge');
check('¥1,500 at ¥9,000,000 rounds up to 16,667 sats', jpyCharge === '16,667 sats', jpyCharge);
const jpyMinor = await ddFor('Minor units');
check('JPY is zero-decimal', jpyMinor === '0', jpyMinor);

await page.getByRole('button', { name: 'Bitcoin', exact: true }).click();
await page.fill('#xpub', ZPUB);
await page.waitForSelector('ol li code');
await page.screenshot({ path: 'dist/keycheck.png', fullPage: true });

await browser.close();
console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);