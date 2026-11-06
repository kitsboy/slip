/**
 * Photographs for the "wallet picker + finishing" pass.
 *
 * Three screens where the new work lives: the setup page a stranger meets (wallet picker), the
 * settings page (text size and spacing), and the desktop counter with a sale in progress (the two
 * panes). Demo drawer only, so nothing real is touched and nothing leaves the device.
 */

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';
import { chromePath } from '../tests/e2e/_chrome.mjs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const OUT = '/root/.hermes/cache/scratch/slip-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

async function shot(name, viewport, colorScheme, path, prepare) {
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}?demo=1${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (prepare) await prepare(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name} -> ${OUT}/${name}.png`);
  await context.close();
}

// A stranger's setup page, with a wallet chosen from the picker.
await shot('pick-phone-dark', { width: 430, height: 932 }, 'dark', '#setup', async (page) => {
  const blue = page.locator('[data-wallet-picker] button', { hasText: 'BlueWallet' }).first();
  if (await blue.count()) {
    await blue.click();
    await page.waitForTimeout(300);
    await page.locator('[data-wallet-guide]').scrollIntoViewIfNeeded();
  }
});

// Display settings.
await shot('display-phone-light', { width: 430, height: 932 }, 'light', '#settings', async (page) => {
  await page.locator('[data-display]').scrollIntoViewIfNeeded();
});

// The desktop counter, two panes, with a sale in progress.
await shot('two-pane-desk-light', { width: 1440, height: 960 }, 'light', '#till', async (page) => {
  const espresso = page.locator('button:has-text("Espresso")').first();
  if (await espresso.count()) {
    await espresso.click();
    await espresso.click();
  }
  const croissant = page.locator('button:has-text("Croissant")').first();
  if (await croissant.count()) await croissant.click();
  await page.waitForTimeout(400);
});

await browser.close();
