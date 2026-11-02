#!/usr/bin/env node
/**
 * Empty-state pass (ONBOARDING-SPEC §5): a panel with nothing in it must say what would fill it.
 *
 * Runs on a fresh install (no demo seed, no wallet), so every list really is empty.
 *
 * Usage: node tests/e2e/states.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import { showPanel } from './_nav.mjs';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 430, height: 1200 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/cdn-cgi|challenge-platform/.test(m.text())) errs.push(m.text());
});

let failures = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? ` — ${d}` : ''}`);
  if (!ok) failures++;
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 15000 });

const panelText = async (id) => {
  const p = page.locator(`[data-panel="${id}"]`);
  return (await p.count()) ? p.first().innerText() : '';
};

await showPanel(page, 'watchlist');
check('watchlist coaches when empty', /Nothing is being watched yet/i.test(await panelText('watchlist')));

await showPanel(page, 'requests');
check('requests coach when empty', /No standing money yet/i.test(await panelText('requests')));

await showPanel(page, 'history');
check('books coach when empty', /Nothing sold on/i.test(await panelText('history')));

await showPanel(page, 'till');
check('a till with no wallet says exactly what it needs', /Tell slip where to send the money first/i.test(await panelText('till')));

check('no runtime errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(failures === 0 ? '\nEmpty-state checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
