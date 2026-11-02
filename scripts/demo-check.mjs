#!/usr/bin/env node
/**
 * Demo parity probe: every pipe the demo claims must work, and nothing may leave the device.
 *
 *   node scripts/demo-check.mjs [baseUrl]
 *
 * Prints one line per pipe: PASS/FAIL, then exits non-zero if anything failed.
 */

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();

const escaped = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('http://[::1]:4181') && !u.startsWith('http://127.0.0.1:4181') && !u.startsWith(BASE)) {
    escaped.push(u);
  }
});

await page.goto(`${BASE}?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-how-it-works]', { timeout: 30_000 });
check('the demo shop opens', true);

// --- on-chain pipe: add an item, charge, and let the simulated explorer confirm it.
await page.locator('button:has-text("Espresso")').first().click().catch(() => {});
await page.locator('button:has-text("Charge")').first().click().catch(() => {});
const waitForText = async (pattern, tries = 50) => {
  for (let i = 0; i < tries; i += 1) {
    if (pattern.test(await page.locator('body').innerText())) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

const paid = await waitForText(/paid|complete|confirmed/i);
check('an on-chain sale reaches paid', paid);

// --- Lightning pipe: the card is pre-filled with a demo address in demo mode.
await page.goto(`${BASE}?demo=1#lightning`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-panel="lightning"]', { timeout: 20_000 });
const address = await page.locator('#ln-addr').inputValue();
check('the demo fills in a Lightning address', address.length > 3, address);

await page.locator('#ln-amt').fill('4.20').catch(async () => {
  const amount = page.locator('[data-panel="lightning"] input').nth(1);
  await amount.fill('4.20');
});
await page.getByRole('button', { name: /request invoice/i }).click();
const qr = await page
  .locator('[data-panel="lightning"] svg')
  .first()
  .waitFor({ state: 'visible', timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
check('a Lightning invoice is issued in the demo', qr);

const settled = await waitForText(/settled/i);
check('the simulated Lightning payment settles', settled);

// --- price pipe: the rate lookup answers locally.
const priced = await page.evaluate(async () => {
  const res = await fetch('https://mempool.space/api/v1/prices');
  const body = await res.json();
  return typeof body.USD === 'number' && body.USD > 1000;
});
check('the price lookup is answered by the demo', priced);

// --- the day stamp pipe: a calendar POST must not reach the internet.
const stamped = await page.evaluate(async () => {
  const res = await fetch('https://a.pool.opentimestamps.org/digest', {
    method: 'POST',
    body: new Uint8Array(32),
  });
  return res.ok;
});
check('the day stamp calendar answers locally', stamped);

check('nothing left the device', escaped.length === 0, escaped.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pipes passed.`);
process.exit(failed.length === 0 ? 0 : 1);
