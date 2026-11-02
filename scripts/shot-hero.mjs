#!/usr/bin/env node
/**
 * Screenshots of the first screen — the page a stranger meets — at phone and desktop width,
 * both themes. Used to review the plain-language pass by eye rather than by hope.
 *
 *   node scripts/shot-hero.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const OUT = '/root/.hermes/cache/scratch/slip-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

for (const theme of ['dark', 'light']) {
  for (const [name, width, height] of [['phone', 430, 932], ['desk', 1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
    const page = await context.newPage();
    // No hash: a deep link scrolls straight to a panel and would photograph the till instead of
    // the page a stranger actually lands on.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-how-it-works]', { timeout: 20_000 });
    await page.evaluate(/* global window */ () => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/hero-${name}-${theme}.png` });
    await context.close();
    console.log(`${name}/${theme} -> ${OUT}/hero-${name}-${theme}.png`);
  }
}

await browser.close();
