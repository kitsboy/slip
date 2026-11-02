#!/usr/bin/env node
/**
 * The (i) icons: six clips, on six cards, and nothing downloaded until asked.
 *
 * The rule that matters here is the one a merchant pays for: a shop on mobile data must not
 * pull six videos it never watched. So this suite asserts the *absence* of the network before a
 * tap, and the presence of the right clip after it.
 *
 * Usage: node tests/e2e/info.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4181/';

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1400 } });

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const videoRequests = [];
context.on('request', (req) => {
  if (/\/videos\/.*\.mp4/.test(req.url())) videoRequests.push(req.url());
});

const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(`${BASE}#sell`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-panel="till"]', { timeout: 20_000 });

// --- nothing downloads until asked ------------------------------------------
check('no video element exists on load', (await page.locator('video').count()) === 0);
check('no clip was fetched on load', videoRequests.length === 0, videoRequests.join(' '));

// --- six icons, on the six cards that need explaining -----------------------
const icons = page.locator('[data-info-video]');
const count = await icons.count();
check('six info icons are on the page', count === 6, String(count));

for (const clip of [
  '01-intro',
  '02-take-a-payment',
  '03-status-strip',
  '04-books',
  '05-customer-proof',
  '06-your-counters',
]) {
  check(`${clip} is wired to an icon`, (await page.locator(`[data-info-video$="${clip}.mp4"]`).count()) === 1);
}

// --- the hero clip ----------------------------------------------------------
const hero = page.locator('[data-info-video="videos/01-intro.mp4"]');
check('the hero icon says what it is', /what is slip/i.test(await hero.innerText()));

await hero.click();
const dialog = page.locator('[role="dialog"][aria-modal="true"]');
await dialog.waitFor({ state: 'visible', timeout: 10_000 });
check('clicking the icon opens a pop-up card', true);

const player = page.locator('[data-info-player="videos/01-intro.mp4"]');
await player.waitFor({ state: 'visible', timeout: 10_000 });
check('the pop-up holds the matching clip', true);
check('the clip is not preloaded', (await player.getAttribute('preload')) === 'none');
check('the clip is inline-safe on iOS', (await player.getAttribute('playsinline')) !== null);
check(
  'the music is credited where it plays',
  /Electro Cabello/.test(await dialog.innerText()) && /CC BY 4\.0/.test(await dialog.innerText()),
);
check('the licence names the composer', /Kevin MacLeod/.test(await dialog.innerText()));

// The player must be a same-origin file: a CDN here would be a phone-home.
const src = await player.getAttribute('src');
check('the clip is served from this app', src !== null && !/^https?:/i.test(src), String(src));

await page.getByRole('button', { name: 'Close' }).click();
await page.waitForTimeout(200);
check('Close removes the pop-up', (await page.locator('[role="dialog"]').count()) === 0);
check('closing stops the player', (await page.locator('video').count()) === 0);
// The meaningful claim: nothing but the clip that was asked for was fetched. The browser may
// re-request the same URL for byte ranges, so count distinct clips, not requests.
const fetched = new Set(videoRequests.map((u) => u.split('/').pop()));
check('only the clip that was asked for was fetched', [...fetched].every((f) => f === '01-intro.mp4'), [...fetched].join(' '));

// --- Escape also closes -----------------------------------------------------
await hero.click();
await dialog.waitFor({ state: 'visible', timeout: 10_000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escape closes the pop-up', (await page.locator('[role="dialog"]').count()) === 0);

// --- the card icons open their own clip -------------------------------------
const opens = async (panel, clip) => {
  await showPanel(page, panel);
  const button = page.locator(`[data-info-video$="${clip}.mp4"]`);
  await button.click();
  const open = await page
    .locator(`[data-info-player$="${clip}.mp4"]`)
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return open;
};

check('the till card explains taking a payment', await opens('till', '02-take-a-payment'));
check('the books card explains the day close', await opens('history', '04-books'));
check('the receipts card explains the customer proof', await opens('verify', '05-customer-proof'));
check('the counters card explains watch-only keys', await opens('wallets', '06-your-counters'));

// The status strip lives in the footer, reachable from any panel.
const strip = page.locator('[data-info-video$="03-status-strip.mp4"]');
check('the status strip has its own clip', (await strip.count()) === 1);
await strip.click();
const stripOpen = await page
  .locator('[data-info-player$="03-status-strip.mp4"]')
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
check('the status strip clip plays', stripOpen);
await page.keyboard.press('Escape');

check('no runtime errors', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nInfo-video checks passed.');
