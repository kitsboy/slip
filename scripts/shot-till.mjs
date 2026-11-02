/**
 * Photograph the counter.
 *
 * The till is the screen a shopkeeper lives in, so its look is checked like a screen and not like a
 * test: phone and desk, dark and light, straight to #till with the demo drawer (no real keys, no
 * network — the demo answers its own internet).
 */

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const BASE = process.env.BASE ?? 'http://[::1]:4181/';
const OUT = process.env.OUT ?? '/root/.hermes/cache/scratch/slip-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

for (const [name, viewport, colorScheme] of [
  ['till-phone-dark', { width: 430, height: 860 }, 'dark'],
  ['till-phone-light', { width: 430, height: 860 }, 'light'],
  ['till-desk-dark', { width: 1440, height: 960 }, 'dark'],
]) {
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}?demo=1#till`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  // With a sale in progress, so the total, the tiles' quantity badges and the charge bar can be judged.
  const espresso = page.locator('button:has-text("Espresso")').first();
  if (await espresso.count()) {
    await espresso.click();
    await espresso.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name} -> ${OUT}/${name}.png`);
  await context.close();
}

await browser.close();
