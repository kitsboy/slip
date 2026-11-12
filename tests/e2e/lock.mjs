/**
 * The till lock, end to end: set it, wear it, forget the PIN once, get in, take it off.
 *
 * The point of these checks is not that a PIN is stored — it is that the till is genuinely shut:
 * no header, no tabs, no books, and no way to read the day's takings without the digits.
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4183/').replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

await page.goto(`${BASE}/?cb=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
await showPanel(page, 'settings');
await page.waitForTimeout(400);

check('Settings offers a till lock', (await page.locator('[data-till-lock]').count()) === 1);
check('a new till says it has no PIN', /No PIN yet/.test(await page.locator('[data-till-lock]').innerText()));

// ── set one ──────────────────────────────────────────────────────────────────────────────────────
await page.locator('#st-pin-new').fill('4821');
await page.locator('#st-pin-confirm').fill('4821');
await page.locator('#st-pin-save').click();
await page.waitForTimeout(900);
check('the PIN is accepted and reported', /PIN set/.test(await page.locator('body').innerText()));

// ── lock it ──────────────────────────────────────────────────────────────────────────────────────
await page.locator('#st-lock-now').click();
await page.waitForTimeout(300);
check('Lock now shuts the till', (await page.locator('[data-lock-screen]').count()) === 1);
check('the cash is not on show behind the lock', (await page.locator('[data-panel="till"], [data-books-sheet]').count()) === 0);

// ── a wrong PIN ──────────────────────────────────────────────────────────────────────────────────
await page.locator('#lk-pin').fill('0000');
await page.locator('.v2-lock-go').click();
await page.waitForTimeout(500);
check('a wrong PIN is refused', /not the PIN/.test(await page.locator('[data-lock-error]').innerText()));
check('a wrong PIN leaves the till shut', (await page.locator('[data-lock-screen]').count()) === 1);

// ── the right one ────────────────────────────────────────────────────────────────────────────────
await page.locator('#lk-pin').fill('4821');
await page.locator('.v2-lock-go').click();
await page.waitForTimeout(700);
check('the right PIN opens the till', (await page.locator('[data-lock-screen]').count()) === 0);
check('the PIN box is left empty for the next person', (await page.locator('#lk-pin').count()) === 0);

// ── a reload is locked ───────────────────────────────────────────────────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
check('opening the page again is locked, not open', (await page.locator('[data-lock-screen]').count()) === 1);

await page.locator('#lk-pin').fill('4821');
await page.locator('.v2-lock-go').click();
await page.waitForTimeout(700);

// ── and off again ────────────────────────────────────────────────────────────────────────────────
await showPanel(page, 'settings');
await page.waitForTimeout(400);
await page.locator('#st-pin-current').fill('1111');
await page.locator('#st-pin-remove').click();
await page.waitForTimeout(600);
check('removing the PIN needs the current one', /not the current PIN/.test(await page.locator('body').innerText()));

await page.locator('#st-pin-current').fill('4821');
await page.locator('#st-pin-remove').click();
await page.waitForTimeout(800);
check('the PIN comes off with the right digits', /No PIN yet/.test(await page.locator('[data-till-lock]').innerText()));

// No PIN, no lock: a reload must open straight into the till.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
check('without a PIN the till opens', (await page.locator('[data-lock-screen]').count()) === 0);

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(failures === 0 ? '\nLock checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
