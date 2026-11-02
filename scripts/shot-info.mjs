#!/usr/bin/env node
/**
 * Screenshots of the (i) popover, both themes, at phone width.
 *
 *   node scripts/shot-info.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const OUT = '/root/.hermes/cache/scratch/slip-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}#sell`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-panel="till"]', { timeout: 20_000 });

  // The till card's own icon, so we see the icon in situ as well as the popover.
  await page.screenshot({ path: `${OUT}/info-till-${theme}.png` });

  await page.locator('[data-info-video$="02-take-a-payment.mp4"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'visible' });
  await page.waitForTimeout(900); // let the poster paint
  await page.screenshot({ path: `${OUT}/info-popover-${theme}.png` });

  await context.close();
  console.log(`${theme} -> ${OUT}`);
}

await browser.close();
