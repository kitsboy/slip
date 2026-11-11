#!/usr/bin/env node
/**
 * The money path, without a mouse.
 *
 * A shopkeeper who cannot use a mouse, or who uses a screen reader, must still be able to ring a sale,
 * hear what state it is in, and hear which claim the receipt is making. This suite does the whole sale
 * with the keyboard only and reads the words slip says out loud.
 *
 * Usage: node tests/e2e/a11y.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4178/';

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 90)));

await page.goto(`${BASE}?cb=${Date.now()}&demo=1#sell`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// ── 1. A refused action is still reachable, and says why ────────────────────────────────────────────
const charge = page.locator('#tl-charge');
check('the charge control exists before a sale is possible', (await charge.count()) === 1);
check('it is not disabled — a refused control must stay focusable', (await charge.getAttribute('disabled')) === null);
check('it is marked refused instead', (await charge.getAttribute('aria-disabled')) === 'true');
const described = await charge.getAttribute('aria-describedby');
const blocker = described ? await page.locator(`#${described}`).count() : 0;
check('it points at the reason it is refused', Boolean(described) && blocker > 0, `describedby=${described}`);

// ── 2. Focus is visible on the way in ──────────────────────────────────────────────────────────────
const stops = [];
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab');
  stops.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      return { ring, shadow: cs.boxShadow !== 'none' };
    }),
  );
}
check('every stop on the way in shows a focus ring', stops.filter(Boolean).every((s) => s.ring || s.shadow), JSON.stringify(stops));

// ── 3. One sale, keyboard only ─────────────────────────────────────────────────────────────────────
await page.locator('#tl-rate').focus();
await page.keyboard.press('Control+A');
await page.keyboard.type('60000');
await page.getByRole('button', { name: /^Espresso/ }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
check('an item is in the cart, chosen with a keyboard', /Espresso/.test(await page.locator('body').innerText()));
check('the charge control is offered once a price exists', (await charge.getAttribute('aria-disabled')) === null);

await charge.focus();
await page.keyboard.press('Enter');
await page.waitForSelector('[data-sale-announcer]', { timeout: 10000 });
await page.waitForTimeout(600);
const waiting = await page.locator('[data-sale-announcer]').first().innerText();
check('the payment screen is announced, with the amount', /Waiting to be paid,\s*[\d,]+ sats/.test(waiting), waiting);
check('it says the code is on screen, not that anything was paid', /code is on screen/.test(waiting), waiting);

const mark = page.getByRole('button', { name: /I have the money/i }).first();
await mark.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const marked = await page.locator('[data-sale-announcer]').first().innerText();
check('a manual confirmation is announced as one', /Marked paid by you/.test(marked), marked);
check('and it says slip did not observe the payment', /did not observe/.test(marked), marked);
check('the receipt is on screen', (await page.locator('.v2-receipt').count()) > 0);
check(
  'focus lands on the way forward, not nowhere',
  ['tl-next', 'tl-check', 'tl-pay'].includes(await page.evaluate(() => document.activeElement?.id ?? '')),
  await page.evaluate(() => document.activeElement?.tagName + '#' + (document.activeElement?.id ?? '')),
);

// ── 4. Nothing on the screen is nameless ──────────────────────────────────────────────────────────
const nameless = await page.evaluate(() =>
  [...document.querySelectorAll('button, a')]
    .filter((el) => {
      const text = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim();
      return text.length === 0;
    })
    .map((el) => el.className.slice(0, 30)),
);
check('every button and link has a name a screen reader can say', nameless.length === 0, nameless.join(' | '));

check('no runtime errors from slip', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nAccessibility checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
