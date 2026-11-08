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
  { name: 'empty', hash: 'till' },
  { name: 'pay', hash: 'till', prepare: 'pay' },
  { name: 'money-in', hash: 'requests' },
  { name: 'books', hash: 'books' },
  { name: 'setup', hash: 'wallets' },
  { name: 'learn', hash: 'learn' },
  { name: 'parts', hash: '', parts: true },
  { name: 'customer', hash: '', customer: true },
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
      const url = new URL(BASE);
      url.searchParams.set('demo', '1');
      if (screen.parts) url.searchParams.set('parts', '1');
      if (screen.customer) url.searchParams.set('display', '1');
      if (screen.hash) url.hash = screen.hash;
      await page.goto(url.toString(), { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      if (screen.prepare === 'cart' || screen.prepare === 'pay') {
        const espresso = page.locator('button:has-text("Espresso")').first();
        if (await espresso.count()) {
          await espresso.click();
          if (screen.prepare === 'cart') await espresso.click();
        }
        if (screen.prepare === 'cart') {
          const croissant = page.locator('button:has-text("Croissant")').first();
          if (await croissant.count()) await croissant.click();
        }
        if (screen.prepare === 'pay') {
          const charge = page.getByRole('button', { name: /^Charge/ });
          if (await charge.count()) await charge.click();
        }
        await page.waitForTimeout(250);
      }
      if (screen.customer) {
        await page.evaluate(() => {
          const channel = new BroadcastChannel('slip-display');
          channel.postMessage({
            kind: 'pay',
            sats: '11703',
            label: 'Espresso — simulated',
            status: 'waiting',
            uri: 'bitcoin:bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu?amount=0.00011703',
            at: new Date().toISOString(),
          });
          channel.close();
        });
        await page.waitForTimeout(300);
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
