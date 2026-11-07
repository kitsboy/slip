/**
 * The design review instrument.
 *
 * Every screen the design pass touches, at every canvas we ship, in both themes, in one run. It exists
 * because "it looks great" is not a judgement anyone can check later — a folder of dated screenshots
 * is. Demo drawer only: nothing real is touched and nothing leaves the device.
 *
 * Usage: node scripts/shots-matrix.mjs [baseUrl] [outDir]
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright';

import { chromePath } from '../tests/e2e/_chrome.mjs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const OUT = process.argv[3] ?? 'docs/shots/matrix';

const CANVASES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desk', width: 1440, height: 960 },
];

const SCREENS = [
  { name: 'sell', hash: 'till', prepare: 'cart' },
  { name: 'money-in', hash: 'history' },
  { name: 'books', hash: 'books' },
  { name: 'setup', hash: 'wallets' },
  { name: 'learn', hash: 'learn' },
];

const THEMES = ['dark', 'light'];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

let shots = 0;
for (const canvas of CANVASES) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: canvas.width, height: canvas.height },
      colorScheme: theme,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    for (const screen of SCREENS) {
      await page.goto(`${BASE}?demo=1#${screen.hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      if (screen.prepare === 'cart') {
        // Two items so the total, the quantity badge and the cart rail all have something to say.
        const espresso = page.locator('button:has-text("Espresso")').first();
        if (await espresso.count()) {
          await espresso.click();
          await espresso.click();
        }
        const croissant = page.locator('button:has-text("Croissant")').first();
        if (await croissant.count()) await croissant.click();
        await page.waitForTimeout(250);
      }
      const file = join(OUT, `${canvas.name}-${screen.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: canvas.name !== 'desk' });
      shots += 1;
      console.log(`${file}`);
    }
    await context.close();
  }
}

await browser.close();
console.log(`\n${shots} screenshots in ${OUT}`);
